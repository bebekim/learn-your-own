import { DatabaseSync } from 'node:sqlite';
import { chooseLessons, type LessonDocument, type LessonRetriever, type SelectionOptions } from '../application/lesson-selection.ts';
import { parsePriorJson, priorPseudoCounts } from './semantic-prior.ts';
import { resolvePolicy } from './selection-policies.ts';

const all: LessonRetriever = {name: 'eligible', version: 1,
  retrieve: rows => rows.map(row => ({lesson_id: row.lesson_id, reason: 'eligible pool'}))};

const bm25: LessonRetriever = {
  name: 'bm25', version: 1,
  retrieve(rows, cue) {
    const terms = [...new Set(cue.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 64);
    if (!rows.length || !terms.length) return [];
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE VIRTUAL TABLE lessons USING fts5(lesson_id UNINDEXED, trigger_cue, intervention)');
      const insert = db.prepare('INSERT INTO lessons VALUES (?, ?, ?)');
      for (const row of rows) insert.run(row.lesson_id, row.trigger_cue, row.intervention);
      const query = terms.map(term => '"' + term + '"').join(' OR ');
      const ranked = db.prepare(`SELECT lesson_id, highlight(lessons,1,'[',']') != trigger_cue AS cue_hit,
        highlight(lessons,2,'[',']') != intervention AS advice_hit FROM lessons WHERE lessons MATCH ?
        ORDER BY bm25(lessons,0,2,1),lesson_id`).all(query);
      return ranked.map(row => {
        const fields = [row.cue_hit && 'trigger', row.advice_hit && 'intervention'].filter(Boolean);
        return {lesson_id: String(row.lesson_id), reason: 'BM25 matched ' + fields.join(' and ')};
      });
    } finally { db.close(); }
  },
};
export const RETRIEVER_REGISTRY = new Map<string, LessonRetriever>([['eligible@1', all], ['bm25@1', bm25]]);
interface FeedbackRow extends LessonDocument {prior_json: string | null; helpful_count: number; harmful_count: number}

export function runLessonSelection<T extends FeedbackRow>(rows: T[], gamma: number, options: SelectionOptions) {
  const ref = options.retriever ?? process.env.LYO_LESSON_RETRIEVER ?? 'eligible@1';
  const retriever = typeof ref === 'string' ? RETRIEVER_REGISTRY.get(ref) : ref;
  if (!retriever) throw new Error('Unknown lesson retriever: ' + ref);
  const policy = resolvePolicy(options.policy ?? process.env.LYO_LESSON_POLICY);
  return chooseLessons({
    rows, cue: options.cue ?? '', retriever, policy,
    limit: options.limit ?? 2,
    rng: options.rng ?? Math.random,
    replicates: options.propensityReplicates ?? 0,
    parameters(row) {
      const prior = priorPseudoCounts(parsePriorJson(row.prior_json), gamma);
      return {lesson_id: row.lesson_id, alpha: row.helpful_count + 1 + prior.alpha, beta: row.harmful_count + 1 + prior.beta};
    },
  });
}
