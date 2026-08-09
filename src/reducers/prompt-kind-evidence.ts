import type { LearningKernel } from '../ledger.ts';
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
