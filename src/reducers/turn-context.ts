import type { LearningKernel } from '../ledger.ts';
import type { PromptKind, TurnUserPrompt } from '../types/observation.ts';

interface TurnUserPromptRow {
  prompt_id: string;
  prompt_index: number;
  prompt_kind: PromptKind;
  prompt_summary: string | null;
}

export function resolveTurnUserPrompts(kernel: LearningKernel, turnId: string): TurnUserPrompt[] {
  const rows = kernel.db.prepare(`
    select prompt_id, prompt_index, prompt_kind, prompt_summary
    from session_prompts
    where turn_id = ? and prompt_role = 'user'
    order by prompt_index
  `).all(turnId) as unknown as TurnUserPromptRow[];
  return rows.map((row) => ({
    promptId: row.prompt_id,
    promptIndex: row.prompt_index,
    promptKind: row.prompt_kind,
    promptSummary: row.prompt_summary,
  }));
}
