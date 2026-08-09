import type { LearningKernel } from '../ledger.ts';
import {
  classifyPromptKind,
  classifyResponseContext,
  PROMPT_KIND_LOG_LR,
} from '../classification/prompt-kind.ts';
import { requiredRow } from '../db/rows.ts';
import type {
  PromptKind,
  PromptKindBelief,
  PromptKindEvidenceRecord,
  PromptKindRecomputeResult,
  RecordPromptKindEvidenceInput,
} from '../types/observation.ts';
import { ISO_NOW, requireFields } from './shared.ts';

interface BeliefRow {
  kind: PromptKind;
  log_odds: number;
}

export function recordPromptKindEvidence(
  kernel: LearningKernel,
  input: RecordPromptKindEvidenceInput
): PromptKindEvidenceRecord {
  requireFields(input, ['promptId', 'kind', 'method']);
  const seq = requiredRow<{ count: number }>(
    kernel.db.prepare('select count(*) as count from prompt_kind_evidence where prompt_id = ?').get(input.promptId),
    `count query returned no row for prompt_kind_evidence`
  ).count + 1;
  const evidenceId = `${input.promptId}:evidence:${seq}`;
  kernel.db.prepare(`
    insert into prompt_kind_evidence (evidence_id, prompt_id, kind, log_lr, method, evidence_ref, created_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(evidenceId, input.promptId, input.kind, input.logLr, input.method, input.evidenceRef ?? null, ISO_NOW());
  return {
    evidenceId,
    promptId: input.promptId,
    kind: input.kind,
    logLr: input.logLr,
    method: input.method,
  };
}

export function getPromptKindBeliefs(kernel: LearningKernel, promptId: string): PromptKindBelief[] {
  const rows = kernel.db.prepare(`
    select kind, sum(log_lr) as log_odds
    from prompt_kind_evidence
    where prompt_id = ?
    group by kind
    order by log_odds desc, kind asc
  `).all(promptId) as unknown as BeliefRow[];
  return rows.map((row) => ({ kind: row.kind, logOdds: row.log_odds }));
}

export function recomputePromptKind(kernel: LearningKernel, promptId: string): PromptKindRecomputeResult {
  const current = requiredRow<{ prompt_kind: PromptKind }>(
    kernel.db.prepare('select prompt_kind from session_prompts where prompt_id = ?').get(promptId),
    `no session prompt with id ${promptId}`
  );
  const beliefs = getPromptKindBeliefs(kernel, promptId);
  const argmax = beliefs[0]?.kind;
  if (argmax === undefined || argmax === current.prompt_kind) {
    return {
      promptId,
      previousKind: current.prompt_kind,
      currentKind: current.prompt_kind,
      changed: false,
    };
  }
  kernel.db.prepare('update session_prompts set prompt_kind = ? where prompt_id = ?').run(argmax, promptId);
  return {
    promptId,
    previousKind: current.prompt_kind,
    currentKind: argmax,
    changed: true,
  };
}

interface LegacyPromptRow {
  prompt_id: string;
  session_id: string;
  turn_id: string | null;
  prompt_index: number;
  prompt_kind: PromptKind;
  prompt_summary: string | null;
}

interface LegacyAssistantRow {
  session_id: string;
  turn_id: string;
  response_summary: string;
}

export interface PromptKindBackfillResult {
  promptsScanned: number;
  promptsSkipped: number;
  evidenceInserted: number;
  byMethod: Record<string, number>;
  promptsRecomputed: number;
  kindsChanged: number;
}

// Semantic kinds produced by Route B's classifyPromptKind (plus task_instruction,
// which the union allows). Rows carrying one of these keep it as their heuristic
// vote; legacy 'user_prompt' rows and 'direction_setting' overrides are re-derived
// from the stored summary.
const ROUTE_B_KINDS = new Set<PromptKind>([
  'debugging_request',
  'question',
  'correction',
  'refactoring_request',
  'task_instruction',
  'follow_up',
]);

export function backfillPromptKindEvidence(kernel: LearningKernel): PromptKindBackfillResult {
  const prompts = kernel.db.prepare(`
    select prompt_id, session_id, turn_id, prompt_index, prompt_kind, prompt_summary
    from session_prompts
    where prompt_role = 'user'
    order by session_id, prompt_index
  `).all() as unknown as LegacyPromptRow[];
  const assistantRows = kernel.db.prepare(`
    select session_id, turn_id, response_summary
    from session_prompts
    where prompt_role = 'assistant' and turn_id is not null and response_summary is not null
  `).all() as unknown as LegacyAssistantRow[];

  const contextualByTurn = new Map<string, PromptKind>();
  for (const row of assistantRows) {
    const key = `${row.session_id}:${row.turn_id}`;
    if (contextualByTurn.has(key)) continue;
    const kind = classifyResponseContext(row.response_summary);
    if (kind) contextualByTurn.set(key, kind);
  }

  const hasEvidence = kernel.db.prepare(
    'select count(*) as count from prompt_kind_evidence where prompt_id = ?'
  );

  const result: PromptKindBackfillResult = {
    promptsScanned: prompts.length,
    promptsSkipped: 0,
    evidenceInserted: 0,
    byMethod: {},
    promptsRecomputed: 0,
    kindsChanged: 0,
  };

  const insert = (promptId: string, kind: PromptKind, logLr: number, method: string) => {
    recordPromptKindEvidence(kernel, {
      promptId,
      kind,
      logLr,
      method: method as RecordPromptKindEvidenceInput['method'],
      evidenceRef: 'backfill',
    });
    result.evidenceInserted += 1;
    result.byMethod[method] = (result.byMethod[method] ?? 0) + 1;
  };

  for (const prompt of prompts) {
    const existing = hasEvidence.get(prompt.prompt_id) as unknown as { count: number };
    if (existing.count > 0) {
      result.promptsSkipped += 1;
      continue;
    }

    if (prompt.prompt_index === 0) {
      insert(prompt.prompt_id, 'direction_setting', PROMPT_KIND_LOG_LR.positional, 'positional');
    }

    const heuristicKind = ROUTE_B_KINDS.has(prompt.prompt_kind)
      ? prompt.prompt_kind
      : classifyPromptKind((prompt.prompt_summary ?? '').replace(/\s+length=\d+$/, ''));
    insert(prompt.prompt_id, heuristicKind, PROMPT_KIND_LOG_LR.heuristic, 'heuristic');

    if (prompt.turn_id) {
      const contextualKind = contextualByTurn.get(`${prompt.session_id}:${prompt.turn_id}`);
      if (contextualKind) {
        insert(prompt.prompt_id, contextualKind, PROMPT_KIND_LOG_LR.contextual, 'contextual');
      }
    }

    result.promptsRecomputed += 1;
    if (recomputePromptKind(kernel, prompt.prompt_id).changed) {
      result.kindsChanged += 1;
    }
  }

  return result;
}
