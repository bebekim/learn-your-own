import type { Feedback } from './finding-assessment.ts';

export type Finding = {
  id: string; source: 'session-finding@1'; gitCommonDir: string;
  activity: 'transfer-review' | 'experiment-design' | 'learning-budget';
  observation: string; evidenceRef: string; intervention: string;
};
export type SessionFinding = Finding & { version: string; context: Feedback['context']; supporting: number };
export interface FindingSelectionPort {
  managed(id: string): boolean;
  state(id: string): { finding: Finding; version: string; validity: string;
    currentFeedback: ReadonlyArray<Pick<Feedback, 'version' | 'outcome' | 'context' | 'observationId'>> } | null;
  hash(value: unknown): string;
}

export function selectSessionFindings(candidates: readonly string[], input: {
  repository: () => string | null; cwd: () => string | null; prompt?: string | null;
}, port: FindingSelectionPort): SessionFinding[] {
  const repository = candidates.length ? input.repository() : null;
  return candidates.flatMap(id => {
    if (port.managed(id)) return [];
    const state = port.state(id);
    if (!state || state.validity === 'needs-revision' || state.validity === 'needs-reassessment') return [];
    const activity = input.prompt?.includes(`[lyo:${state.finding.activity}]`);
    // Repository identity establishes location, not the current activity.
    if (!activity) return [];
    const context = { repository: repository ?? input.cwd(),
      activity: state.finding.activity, match: 'activity' as const };
    const supporting = new Set(state.currentFeedback.filter(row => row.version === state.version && row.outcome === 'supported'
      && port.hash(row.context) === port.hash(context)).map(row => row.observationId)).size;
    return [{ ...state.finding, version: state.version, context, supporting }];
  }).slice(0, 3);
}
