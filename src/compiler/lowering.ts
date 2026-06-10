import type { RunTelemetryAst } from './syntax.ts';
import type { SemanticRunAst } from './semantics.ts';

export interface LoweringPlan {
  verifierDrafts: string[];
  milestoneDrafts: string[];
  procedureDrafts: string[];
  criticDrafts: string[];
  policyDrafts: string[];
  contextPackDrafts: string[];
}

export function planSemanticLowering(input: {
  telemetry: RunTelemetryAst;
  semantic: SemanticRunAst;
}): LoweringPlan {
  const { telemetry, semantic } = input;

  const verifierDrafts = semantic.verifiers.map((verifier) => {
    const paths = verifier.scopePaths.length > 0 ? verifier.scopePaths.join(', ') : 'nothing';
    return `${verifier.command} verifies ${paths}`;
  });

  const milestoneDrafts = semantic.milestones.map((milestone) => {
    const s = milestone.failedAttempts === 1 ? '' : 's';
    return `${milestone.name} completed after ${milestone.failedAttempts} failed attempt${s}`;
  });

  const procedureDrafts: string[] = [];
  const steps: string[] = [];
  for (const ep of telemetry.episodes) {
    let step: string | null = null;
    switch (ep.phase) {
      case 'orientation':
        step = 'inspect';
        break;
      case 'implementation':
        step = 'edit';
        break;
      case 'failed_verification':
        step = 'test fail';
        break;
      case 'debugging':
        step = 'debug';
        break;
      case 'passed_verification':
        step = 'test pass';
        break;
      case 'unverified_claim_candidate':
        step = 'unverified claim';
        break;
    }
    if (step !== null) {
      steps.push(step);
    }
  }

  if (steps.length > 0) {
    procedureDrafts.push(steps.join(' -> '));
  }

  const criticDrafts: string[] = [];
  const hasDebugging = telemetry.episodes.some((ep) => ep.phase === 'debugging');
  const hasUnverified = telemetry.episodes.some((ep) => ep.phase === 'unverified_claim_candidate');

  if (hasDebugging) {
    criticDrafts.push('if edit happens after failed verifier, classify as debugging and rerun verifier');
  }
  if (hasUnverified) {
    criticDrafts.push('do not stop or claim completion directly after edit without running verification');
  }
  if (criticDrafts.length === 0) {
    criticDrafts.push('no critics identified; verify changes using local tests');
  }

  const policyDrafts: string[] = [];
  policyDrafts.push('local tests/edits can proceed without restriction');
  for (const pol of semantic.policyObservations) {
    if (pol.riskClass === 'destructive') {
      policyDrafts.push(`destructive command '${pol.action}' requires explicit approval`);
    } else if (pol.riskClass === 'external_deploy') {
      policyDrafts.push(`external deployment '${pol.action}' requires explicit approval`);
    }
  }
  for (const risk of semantic.riskObservations) {
    if (risk.reason === 'credential_or_secret_reference') {
      policyDrafts.push(`credentials/secrets reference in '${risk.command}' is prohibited`);
    }
  }

  const contextPackDrafts: string[] = [];
  const uniqueFiles = Array.from(new Set(telemetry.episodes.flatMap((e) => e.paths))).sort();
  const verifierCommands = Array.from(
    new Set(semantic.verifiers.map((verifier) => verifier.command))
  ).sort();

  if (uniqueFiles.length > 0) {
    contextPackDrafts.push(`files touched: ${uniqueFiles.join(', ')}`);
  }
  if (verifierCommands.length > 0) {
    contextPackDrafts.push(`reusable verification commands: ${verifierCommands.join(', ')}`);
  }
  if (contextPackDrafts.length === 0) {
    contextPackDrafts.push('no context pack candidates identified');
  }

  return {
    verifierDrafts,
    milestoneDrafts,
    procedureDrafts,
    criticDrafts,
    policyDrafts,
    contextPackDrafts,
  };
}
