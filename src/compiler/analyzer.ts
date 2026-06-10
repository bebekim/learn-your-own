import type {
  MilestoneCandidate,
  PolicyDecision,
  PolicyObservation,
  PolicyRiskClass,
  RiskObservation,
  SemanticRunAst,
  VerifierCandidate,
} from './semantics.ts';
import type {
  RunEpisode,
  RunTelemetryAst,
  TelemetryToken,
} from './syntax.ts';

export function analyzeTelemetrySemantics(ast: RunTelemetryAst): SemanticRunAst {
  const verifiers: VerifierCandidate[] = [];
  const milestones: MilestoneCandidate[] = [];
  const policyObservations: PolicyObservation[] = [];
  const riskObservations: RiskObservation[] = [];

  const tokensByEventId = groupTokensByEventId(ast.tokens);

  for (let index = 0; index < ast.episodes.length; index += 1) {
    const episode = ast.episodes[index];
    const episodeTokens = tokensForEpisode(episode, tokensByEventId);

    for (const token of episodeTokens) {
      if (!token.command) continue;

      const policy = policyObservationForToken(token);
      if (policy) policyObservations.push(policy);

      riskObservations.push(...riskObservationsForToken(token));
    }

    if (episode.phase !== 'passed_verification') continue;

    const testTokens = episodeTokens.filter((token) => token.kind === 'TEST' && testPassed(token));
    for (const testToken of testTokens) {
      if (!testToken.command) continue;

      const precedingWork = workEpisodesSincePreviousPass(ast.episodes, index, tokensByEventId);
      const scopePaths = uniqueSorted([
        ...(testToken.paths ?? []),
        ...precedingWork.paths,
      ]);

      verifiers.push({
        command: testToken.command.argvSummary,
        provenance: testToken.provenance,
        scopePaths,
      });

      if (precedingWork.episodes.length > 0) {
        milestones.push({
          name: milestoneName(scopePaths),
          provenance: testToken.provenance,
          associatedPaths: scopePaths,
          failedAttempts: precedingWork.failedAttempts,
        });
      }
    }
  }

  return {
    runId: ast.runId,
    verifiers,
    milestones,
    policyObservations,
    riskObservations,
  };
}

function groupTokensByEventId(tokens: TelemetryToken[]): Map<string, TelemetryToken[]> {
  const groups = new Map<string, TelemetryToken[]>();
  for (const token of tokens) {
    const eventId = token.provenance.eventId;
    const group = groups.get(eventId);
    if (group) {
      group.push(token);
    } else {
      groups.set(eventId, [token]);
    }
  }
  return groups;
}

function tokensForEpisode(
  episode: RunEpisode,
  tokensByEventId: Map<string, TelemetryToken[]>
): TelemetryToken[] {
  return episode.tokenIds.flatMap((tokenId) => tokensByEventId.get(tokenId) ?? []);
}

function workEpisodesSincePreviousPass(
  episodes: RunEpisode[],
  passedIndex: number,
  tokensByEventId: Map<string, TelemetryToken[]>
): { episodes: RunEpisode[]; paths: string[]; failedAttempts: number } {
  const workEpisodes: RunEpisode[] = [];
  const paths: string[] = [];
  let failedAttempts = 0;

  for (let index = passedIndex - 1; index >= 0; index -= 1) {
    const episode = episodes[index];
    if (episode.phase === 'passed_verification') break;

    if (episode.phase === 'failed_verification') {
      failedAttempts += tokensForEpisode(episode, tokensByEventId)
        .filter((token) => token.kind === 'TEST')
        .length;
      continue;
    }

    if (episode.phase === 'implementation' || episode.phase === 'debugging') {
      workEpisodes.unshift(episode);
      paths.push(...episode.paths);
    }
  }

  return {
    episodes: workEpisodes,
    paths: uniqueSorted(paths),
    failedAttempts,
  };
}

function testPassed(token: TelemetryToken): boolean {
  return token.command?.status === 'succeeded' || token.command?.exitCode === 0;
}

function policyObservationForToken(token: TelemetryToken): PolicyObservation | null {
  if (!token.command) return null;

  const riskClass = policyRiskClassForToken(token);
  const decision = policyDecisionForToken(token);
  if (riskClass === 'unknown' && decision !== 'attempted') return null;

  return {
    action: token.command.argvSummary,
    riskClass,
    decision,
    provenance: token.provenance,
  };
}

function policyRiskClassForToken(token: TelemetryToken): PolicyRiskClass {
  if (!token.command) return 'unknown';
  const command = token.command.argvSummary;
  if (isDestructiveCommand(command)) return 'destructive';
  if (token.kind === 'TEST') return 'local_test';
  if (token.kind === 'EDIT') return 'local_edit';
  if (token.kind === 'EXTERNAL') return 'external_deploy';
  return 'unknown';
}

function policyDecisionForToken(token: TelemetryToken): PolicyDecision {
  if (token.command?.status === 'attempted') return 'attempted';
  return 'allowed';
}

function riskObservationsForToken(token: TelemetryToken): RiskObservation[] {
  if (!token.command) return [];

  const observations: RiskObservation[] = [];
  const command = token.command.argvSummary;

  if (token.kind === 'EXTERNAL') {
    observations.push({
      command,
      reason: 'external_command',
      provenance: token.provenance,
    });
  }

  if (isDestructiveCommand(command)) {
    observations.push({
      command,
      reason: 'destructive_command',
      provenance: token.provenance,
    });
  }

  if (referencesCredential(command)) {
    observations.push({
      command,
      reason: 'credential_or_secret_reference',
      provenance: token.provenance,
    });
  }

  return observations;
}

function isDestructiveCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  return /\brm\b/.test(normalized)
    || /\bdelete\b/.test(normalized)
    || /\bdrop\s+(table|database|schema)\b/.test(normalized)
    || /\btruncate\s+table\b/.test(normalized)
    || /\bgit\s+reset\s+--hard\b/.test(normalized)
    || /\bgit\s+push\b.*\b--force\b/.test(normalized)
    || /\bdocker\s+volume\s+rm\b/.test(normalized);
}

function referencesCredential(command: string): boolean {
  return /\b(password|passwd|secret|token|api[_-]?key|credential|private[_-]?key)\b/i.test(command)
    || /(^|\s)\.env(\s|$|\/)/.test(command);
}

function milestoneName(paths: string[]): string {
  if (paths.length === 0) return 'verified_run';
  const firstPath = paths[0]
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (paths.length === 1) return `verify_${firstPath}`;
  return `verify_${firstPath}_and_${paths.length - 1}_more`;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
