import type { LearningKernel } from '../ledger.ts';
import type { TelemetryToken, RunEpisode, RunTelemetryAst, EpisodePhase } from './syntax.ts';
import { deriveTelemetryTokens, tokenizeTelemetryActions } from './tokenizer.ts';

export function parseTelemetryEpisodes(tokens: TelemetryToken[]): RunEpisode[] {
  if (tokens.length === 0) return [];

  const runId = tokens[0].provenance.runId ?? 'unknown-run';
  const episodes: RunEpisode[] = [];
  let episodeIndex = 1;

  // Helper to create and push an episode
  function addEpisode(phase: EpisodePhase, tokensInEpisode: TelemetryToken[], precedingEndEventId: string) {
    if (tokensInEpisode.length === 0) return;

    const episodeId = `ep-${runId}-${String(episodeIndex++).padStart(3, '0')}`;
    const paths = Array.from(
      new Set(tokensInEpisode.flatMap((t) => t.paths ?? []))
    ).sort();
    
    const commands = tokensInEpisode
      .filter((t) => t.command)
      .map((t) => t.command!.argvSummary);

    const tokenIds = tokensInEpisode.map((t) => t.provenance.eventId);

    episodes.push({
      episodeId,
      runId,
      phase,
      startedAfter: precedingEndEventId,
      endedAt: tokensInEpisode[tokensInEpisode.length - 1].provenance.eventId,
      commands,
      paths,
      tokenIds,
    });
  }

  // 1. Partition tokens into chunks separated by TEST and STOP tokens
  interface TokenChunk {
    type: 'segment' | 'test' | 'stop';
    tokens: TelemetryToken[];
  }

  const chunks: TokenChunk[] = [];
  let currentSegment: TelemetryToken[] = [];

  for (const token of tokens) {
    if (token.kind === 'TEST') {
      if (currentSegment.length > 0) {
        chunks.push({ type: 'segment', tokens: currentSegment });
        currentSegment = [];
      }
      chunks.push({ type: 'test', tokens: [token] });
    } else if (token.kind === 'STOP') {
      if (currentSegment.length > 0) {
        chunks.push({ type: 'segment', tokens: currentSegment });
        currentSegment = [];
      }
      chunks.push({ type: 'stop', tokens: [token] });
    } else {
      currentSegment.push(token);
    }
  }

  if (currentSegment.length > 0) {
    chunks.push({ type: 'segment', tokens: currentSegment });
  }

  // 2. Process chunks and construct episodes
  let precedingEndEventId = 'start';
  let lastPhase: EpisodePhase = 'unknown';

  for (const chunk of chunks) {
    if (chunk.type === 'segment') {
      const isDebugging = lastPhase === 'failed_verification' || lastPhase === 'debugging';
      
      if (isDebugging) {
        addEpisode('debugging', chunk.tokens, precedingEndEventId);
        precedingEndEventId = chunk.tokens[chunk.tokens.length - 1].provenance.eventId;
        lastPhase = 'debugging';
      } else {
        // Find the first EDIT token in this segment
        const firstEditIdx = chunk.tokens.findIndex((t) => t.kind === 'EDIT');
        
        if (firstEditIdx !== -1) {
          // Tokens before first EDIT are orientation
          if (firstEditIdx > 0) {
            const orientationTokens = chunk.tokens.slice(0, firstEditIdx);
            addEpisode('orientation', orientationTokens, precedingEndEventId);
            precedingEndEventId = orientationTokens[orientationTokens.length - 1].provenance.eventId;
          }

          // Tokens starting from the EDIT token are implementation
          const implementationTokens = chunk.tokens.slice(firstEditIdx);
          addEpisode('implementation', implementationTokens, precedingEndEventId);
          precedingEndEventId = implementationTokens[implementationTokens.length - 1].provenance.eventId;
          lastPhase = 'implementation';
        } else {
          // No EDIT token in the segment; entire segment is orientation
          addEpisode('orientation', chunk.tokens, precedingEndEventId);
          precedingEndEventId = chunk.tokens[chunk.tokens.length - 1].provenance.eventId;
          lastPhase = 'orientation';
        }
      }
    } else if (chunk.type === 'test') {
      const testToken = chunk.tokens[0];
      const cmdStatus = testToken.command?.status;
      const cmdExit = testToken.command?.exitCode;

      const passed = cmdStatus === 'succeeded' || cmdExit === 0;
      const phase: EpisodePhase = passed ? 'passed_verification' : 'failed_verification';
      
      addEpisode(phase, chunk.tokens, precedingEndEventId);
      precedingEndEventId = testToken.provenance.eventId;
      lastPhase = phase;
    } else if (chunk.type === 'stop') {
      const stopToken = chunk.tokens[0];
      // If preceding episode was implementation and no verifier occurred since then
      const phase: EpisodePhase = lastPhase === 'implementation' 
        ? 'unverified_claim_candidate' 
        : 'orientation'; // Default fallback for a benign stop
      
      addEpisode(phase, chunk.tokens, precedingEndEventId);
      precedingEndEventId = stopToken.provenance.eventId;
      lastPhase = phase;
    }
  }

  return episodes;
}

export function compileTelemetryRunAst(
  kernel: LearningKernel,
  input: { runId: string }
): RunTelemetryAst {
  const actions = tokenizeTelemetryActions(kernel, input);
  const tokens = deriveTelemetryTokens(actions);
  const episodes = parseTelemetryEpisodes(tokens);
  return {
    runId: input.runId,
    actions,
    tokens,
    episodes,
  };
}
