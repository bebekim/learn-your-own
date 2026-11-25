/**
 * Spec 14 operations: propose, replay, evaluate and harvest. Each reads local transcripts and the
 * lesson store; only `propose` (to the generator) and decisions (to the decision provider) send data,
 * and only to the configured, explicitly chosen providers.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TypedDecisionProvider } from '../application/typed-decisions.ts';
import { expectedLevel } from '../decisions/providers.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { readFailureEpisodes, type FailureEpisode } from './episodes.ts';
import type { HypothesisGenerator } from './generator.ts';
import { evaluateRecurrence, hypothesisMatches, listHypotheses, recordHypothesisMatch, recordProposals, setHypothesisStatus } from './store.ts';

const ACTIVE = new Set(['shadowing', 'recurrent', 'harvested', 'candidate']);

export async function proposeHypotheses(store: LessonStore, generator: HypothesisGenerator, options: {
  from: Date; until: Date; maxEpisodes: number; maxProposals?: number; rivalShare?: number; root?: string; now?: Date }) {
  const hypotheses = listHypotheses(store.db), active = hypotheses.filter(h => ACTIVE.has(h.status));
  // Failures an active hypothesis already explains are left out, so new proposals look elsewhere.
  const explained = new Set(active.flatMap(h => hypothesisMatches(store.db, h.id).filter(m => m.verdict === 'match').map(m => m.episodeId)));
  const episodes = readFailureEpisodes({ root: options.root, from: options.from, until: options.until })
    .filter(e => !explained.has(e.id)).slice(-options.maxEpisodes);
  if (episodes.length < 3) return { episodes: episodes.length, proposed: [], rejected: 0, usage: null, note: 'too few unexplained failures' };
  const record = await generator.propose({ episodes, existing: active.map(h => ({ id: h.id, situation: h.proposal.situation })),
    maxProposals: options.maxProposals ?? 5, rivalShare: options.rivalShare ?? 0.1 });
  const ids = recordProposals(store, record, { from: options.from, until: options.until }, options.now);
  return { episodes: episodes.length, proposed: ids, rejected: record.rejected, rejections: record.rejections ?? [], truncated: record.truncated ?? false, retried: record.retried ?? false, rivalShortfall: record.rivalShortfall ?? 0,
    usage: record.usage, model: record.model,
    rivals: record.proposals.filter(p => p.rival).length };
}

/** Ask a hypothesis's question about historical failures, recorded as replay matches. Nothing is delivered. */
export async function replayHypothesis(store: LessonStore, provider: TypedDecisionProvider, id: string, options: {
  from: Date; until: Date; root?: string; timeoutMs?: number; minDecided?: number; onProgress?: (done: number, total: number) => void }) {
  const h = listHypotheses(store.db).find(x => x.id === id);
  if (!h) throw new Error(`unknown hypothesis ${id}`);
  const episodes = readFailureEpisodes({ root: options.root, from: options.from, until: options.until });
  const done = new Set(hypothesisMatches(store.db, id, 'replay').map(m => m.episodeId));
  let asked = 0;
  for (const [i, e] of episodes.entries()) {
    if (done.has(e.id)) continue;
    let level: number | null = null, model: string | null = null;
    try {
      const record = await provider.decide({ state: e.state, questions: { match: h.proposal.question } }, { timeoutMs: options.timeoutMs ?? 120000 });
      level = expectedLevel(record.answers.match); model = record.answeredModel;
    } catch { /* recorded as unknown */ }
    recordHypothesisMatch(store, { hypothesisId: id, episodeId: e.id, sessionId: e.sessionId, cwd: e.cwd, at: e.at, level,
      mode: 'replay', provider: provider.name, model });
    asked++;
    options.onProgress?.(i + 1, episodes.length);
  }
  const evaluation = evaluateRecurrence(hypothesisMatches(store.db, id, 'replay'), h.proposal.predicted,
    { from: options.from, until: options.until }, { now: options.until, minDecided: options.minDecided });
  return { id, episodes: episodes.length, asked, evaluation };
}

/** Judge live shadowing once its window has ended; a pending window changes nothing. */
export function evaluateHypothesis(store: LessonStore, id: string, options: { windowDays?: number; minDecided?: number; now?: Date } = {}) {
  const h = listHypotheses(store.db).find(x => x.id === id);
  if (!h) throw new Error(`unknown hypothesis ${id}`);
  if (h.status !== 'shadowing') throw new Error(`only a shadowing hypothesis can be evaluated (it is ${h.status})`);
  const from = new Date(h.statusAt), until = new Date(from.getTime() + (options.windowDays ?? 30) * 86400000);
  const evaluation = evaluateRecurrence(hypothesisMatches(store.db, id, 'live'), h.proposal.predicted, { from, until },
    { now: options.now, minDecided: options.minDecided });
  if (evaluation.verdict !== 'pending') setHypothesisStatus(store, id, evaluation.verdict, 'shadow window evaluated', options.now, evaluation);
  return evaluation;
}

/**
 * Review pack for labelling (Spec 14 §3): matched failures plus an equal random sample of
 * non-matched ones from the same period, each with its repair. Labels are left to a reviewer.
 */
export function harvestHypothesis(store: LessonStore, id: string, outDir: string, options: { root?: string; seed?: number } = {}) {
  const h = listHypotheses(store.db).find(x => x.id === id);
  if (!h) throw new Error(`unknown hypothesis ${id}`);
  if (!['recurrent', 'harvested'].includes(h.status)) throw new Error(`harvest needs a recurrent hypothesis (it is ${h.status})`);
  const matches = hypothesisMatches(store.db, id);
  const byId = new Map<string, FailureEpisode>(readFailureEpisodes({ root: options.root }).map(e => [e.id, e]));
  const hits = matches.filter(m => m.verdict === 'match' && byId.has(m.episodeId));
  const misses = matches.filter(m => m.verdict === 'no-match' && byId.has(m.episodeId));
  let seed = options.seed ?? 14;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const sample = [...misses].sort(() => random() - 0.5).slice(0, hits.length);
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const lines = [...hits, ...sample].map(m => {
    const e = byId.get(m.episodeId)!;
    return JSON.stringify({ id: e.id, state: e.state, inputFormat: 'command-output@1', level: m.level, shadowVerdict: m.verdict,
      repair: e.repair, stratum: e.cwd.includes('/repositories/work') ? 'work' : 'personal', label: null });
  });
  writeFileSync(join(outDir, 'harvest.jsonl'), lines.join('\n') + '\n', { mode: 0o600 });
  writeFileSync(join(outDir, 'question.json'), JSON.stringify(h.proposal.question, null, 2) + '\n', { mode: 0o600 });
  if (h.status === 'recurrent') setHypothesisStatus(store, id, 'harvested', `review pack written: ${hits.length} matched, ${sample.length} sampled`);
  return { id, matched: hits.length, sampled: sample.length, outDir };
}
