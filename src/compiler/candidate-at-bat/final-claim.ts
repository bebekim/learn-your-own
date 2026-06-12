import type { LearningKernel } from '../../ledger.ts';
import type { RunTelemetryAst } from '../syntax.ts';
import type {
  CandidateAtBatFinalClaim,
  CandidateAtBatFinalClaimPosture,
} from '../candidate-at-bat.ts';

export function extractFinalClaim(
  kernel: LearningKernel,
  ast: RunTelemetryAst
): CandidateAtBatFinalClaim {
  const stopRows = kernel.db.prepare(`
    select event_id as eventId, payload_json as payloadJson, created_at as createdAt
    from hook_events
    where turn_id = ?
      and (event_name = 'Stop' or json_extract(payload_json, '$.hook_event_name') = 'Stop')
    order by created_at, event_id
  `).all(ast.runId) as Array<{ eventId: string; payloadJson: string; createdAt: string }>;
  const evidenceRefs = stopRows.map((row) => `hook:${row.eventId}`);
  const rawMessages = stopRows
    .map((row) => finalMessageFromPayload(row.payloadJson))
    .filter((message): message is string => typeof message === 'string' && message.trim() !== '');
  const promptRows = kernel.db.prepare(`
    select response_summary as responseSummary
    from session_prompts
    where (run_id = ? or turn_id = ?)
      and prompt_role = 'assistant'
      and prompt_kind = 'assistant_response'
      and response_summary is not null
    order by recorded_at, prompt_index
  `).all(ast.runId, ast.runId) as Array<{ responseSummary: string | null }>;
  const summarizedMessages = promptRows
    .map((row) => row.responseSummary)
    .filter((message): message is string => typeof message === 'string' && message.trim() !== '');
  const summary = truncateSummary(rawMessages.at(-1) ?? summarizedMessages.at(-1) ?? null);
  const text = summary?.toLowerCase() ?? '';
  const mentionsVerifier = /\b(test|tests|tested|testing|pytest|rspec|mvn|gradle|ctest|cargo test|go test|xcodebuild|typecheck|build|verifier|verified|passed|green)\b/i.test(text);
  const mentionsBlocker = /\b(blocked|blocker|cannot|can't|unable|unsafe|underspecified|missing|permission|requires|required|not enough|not possible|needs?|need)\b/i.test(text);
  const claimsDone = /\b(done|completed|complete|fixed|implemented|finished|ready|works|resolved|shipped)\b/i.test(text);
  const asksForFollowup = /\b(next step|please|could you|would you|let me know|follow up)\b/i.test(text);

  let posture: CandidateAtBatFinalClaimPosture = 'unknown';
  if (summary) {
    if (mentionsBlocker && !claimsDone) posture = 'blocked';
    else if (mentionsVerifier && claimsDone) posture = 'cites_evidence';
    else if (claimsDone) posture = 'claims_done';
    else if (asksForFollowup) posture = 'asks_for_followup';
  }

  return {
    posture,
    mentionsVerifier,
    mentionsBlocker,
    summary,
    evidenceRefs,
  };
}

function finalMessageFromPayload(payloadJson: string): string | null {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    return typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : null;
  } catch {
    return null;
  }
}

function truncateSummary(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}
