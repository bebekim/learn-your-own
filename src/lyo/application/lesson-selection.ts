// Retrieval is deterministic for a fixed request and index snapshot. Randomized
// exploration belongs to the policy so replay can measure its inclusion rates.
export interface LessonDocument {
  lesson_id: string;
  trigger_cue: string;
  intervention: string;
  failure_class: string;
}
export interface LessonMatch { lesson_id: string; reason: string }
export interface LessonRetriever {
  name: string;
  version: number;
  retrieve(rows: readonly LessonDocument[], cue: string): readonly LessonMatch[];
}
export interface SelectionCandidate { lesson_id: string; alpha: number; beta: number }
export interface ScoredSelection { index: number; score: number | null }
export interface PolicyContext {
  cue: string;
  documents: readonly LessonDocument[];
  matches: readonly LessonMatch[];
}
export interface SelectionPolicy {
  name: string;
  version: number;
  deterministic?: boolean;
  fillsSlots?: boolean;
  sampleSelection(candidates: SelectionCandidate[], limit: number, rng?: () => number, context?: PolicyContext): ScoredSelection[];
}
export type SelectionPolicyRef = SelectionPolicy | string | null | undefined;
export interface SelectionOptions {
  cue?: string;
  policy?: SelectionPolicyRef;
  retriever?: LessonRetriever | string;
  limit?: number;
  rng?: () => number;
  propensityReplicates?: number;
}

interface SelectionRequest<T extends LessonDocument> {
  rows: readonly T[];
  cue: string;
  retriever: LessonRetriever;
  policy: SelectionPolicy;
  parameters: (row: T) => SelectionCandidate;
  limit: number;
  rng: () => number;
  replicates: number;
}

function retrievedDocuments<T extends LessonDocument>(rows: readonly T[], matches: readonly LessonMatch[]): T[] {
  const remaining = new Map(rows.map(row => [row.lesson_id, row]));
  return matches.map(match => {
    const row = remaining.get(match.lesson_id);
    if (!row) throw new Error('Retriever returned an ineligible or duplicate lesson');
    remaining.delete(match.lesson_id);
    return row;
  });
}

function checkPicks(picks: ScoredSelection[], poolSize: number, limit: number, fillsSlots = false) {
  const capacity = Math.min(limit, poolSize);
  const indexes = picks.map(pick => pick.index);
  if (picks.length > capacity || (fillsSlots && picks.length !== capacity) ||
      new Set(indexes).size !== indexes.length ||
      indexes.some(index => !Number.isInteger(index) || index < 0 || index >= poolSize)) {
    throw new Error('Invalid lesson policy selection');
  }
  return picks;
}

function selectionReason(poolSize: number, matchCount: number, limit: number, pickCount: number) {
  if (!poolSize) return 'empty-pool';
  if (!matchCount) return 'no-match';
  if (!limit) return 'no-slots';
  return pickCount ? 'selected' : 'abstained';
}

export function chooseLessons<T extends LessonDocument>(request: SelectionRequest<T>) {
  const {rows, cue, policy, retriever, limit, rng, replicates} = request;
  if (![limit, replicates].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Selection limit and replicate count must be nonnegative integers');
  }
  const matches = retriever.retrieve(rows, cue);
  const documents = retrievedDocuments(rows, matches);
  const inputs = documents.map(request.parameters);
  const context = {cue, documents, matches};
  function draw() {
    if (!limit || !inputs.length) return [];
    return checkPicks(policy.sampleSelection(inputs, limit, rng, context), inputs.length, limit, policy.fillsSlots);
  }
  const exact = !limit || !inputs.length || policy.deterministic ||
    (policy.fillsSlots && inputs.length <= limit);
  const counts = inputs.map(() => 0);
  if (!exact) {
    for (let i = 0; i < replicates; i++) {
      for (const pick of draw()) counts[pick.index]++;
    }
  }
  const picks = draw();
  const picked = new Set(picks.map(p => p.index));
  const candidates = inputs.map((candidate, i) => ({
    ...candidate,
    propensity: exact ? Number(picked.has(i)) : replicates ? counts[i] / replicates : null,
  }));
  const selected = picks.map(({index, score}) => ({...documents[index], sampled_score: score}));
  return {
    selected, candidates, matches,
    null_arm: Number(!selected.length),
    policy: `${policy.name}@${policy.version}`,
    retriever: `${retriever.name}@${retriever.version}`,
    reason: selectionReason(rows.length, inputs.length, limit, selected.length),
    propensityMethod: exact ? 'exact' : replicates ? 'estimated' : 'unknown',
  };
}
