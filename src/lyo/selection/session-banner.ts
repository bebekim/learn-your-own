import type { SessionFinding } from '../interface/session-findings.ts';

const MAX_TEXT = 220;

export interface LessonRow {
  trigger_cue: string;
  lesson_id: string;
  status: string;
  failure_class: string;
  intervention: string;
  helpful_count: number;
  harmful_count: number;
  posterior_mean: number;
  explanation: string;
  prior_json: string | null;
}

function formatLesson(row: LessonRow, reason?: string): string {
  const text = row.intervention.replace(/\s+/g, ' ').trim();
  const short = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text;
  const mean = Number(row.posterior_mean || 0).toFixed(2);
  return `- [${row.lesson_id}; ${row.status}; ${mean} · ${row.helpful_count}✓/${row.harmful_count}✗ recorded feedback · ${row.failure_class}] ${short}${reason ? ' (' + reason + ')' : ''}`;
}

export interface HookSelection {
  selected: LessonRow[];
  findings: SessionFinding[];
  storePath: string;
  selector?: {policy: string; retriever: string; reason: string; poolHash?: string; cueHash?: string; matches: readonly {lesson_id: string; reason: string}[]};
}

export function formatSelection({ selected, findings, selector }: Omit<HookSelection, 'storePath'>): string {
  return [
    findings.length ? 'Observed findings — future usefulness unvalidated; apply only when the stated activity fits:\n' +
      findings.map(row => `- [${row.activity}; ${row.id}] ${row.intervention}\n  Observed: ${row.observation} Evidence: ${row.evidenceRef}` +
        (row.supporting ? `\n  ${row.supporting} supporting observation(s); broader usefulness unvalidated.` : '')).join('\n') : '',
    selected.length ? `LYO lessons from your past runs (${selector?.retriever} / ${selector?.policy}, ${selected.length} selected; ` +
      'score = posterior mean, ✓/✗ = recorded feedback; this delivery does not establish applicability or benefit):\n' + selected.map(row => formatLesson(row, selector?.matches.find(match => match.lesson_id === row.lesson_id)?.reason)).join('\n') : '',
  ].filter(Boolean).join('\n') + '\n';
}
