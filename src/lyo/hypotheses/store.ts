/**
 * Hypothesis records (Spec 14 §2, §4). Append-only traces in the lesson store: a proposal, its
 * status changes, and one match record per failure it was asked about. Matches are proxies for
 * recurrence; a hypothesis is never promoted by them alone.
 */

import type { DatabaseSync } from 'node:sqlite';
import { hashValue } from '../contract/refs.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { repositoryKey } from '../repository.ts';
import type { GeneratorRecord, Proposal } from './generator.ts';

export const HYPOTHESIS_STATUSES = ['proposed', 'shadowing', 'recurrent', 'refuted-recurrence', 'untested', 'harvested',
  'candidate', 'defeated', 'retired'] as const;
export type HypothesisStatus = typeof HYPOTHESIS_STATUSES[number];

export interface Hypothesis {
  id: string; proposal: Proposal; generator: { provider: string; model: string }; proposedAt: string;
  episodeWindow: { from: string | null; until: string | null };
  status: HypothesisStatus; statusAt: string; statusHistory: Array<{ status: HypothesisStatus; at: string; reason: string }>;
}

export interface HypothesisMatch {
  hypothesisId: string; episodeId: string; sessionId: string; cwd: string; repository: string | null; at: string;
  level: number | null; verdict: 'match' | 'no-match' | 'unknown'; mode: 'live' | 'replay'; provider: string | null; model: string | null;
}

/** Provisional cut-off while a question is uncalibrated (Spec 14 §2): expected level 4 or above. */
export const PROVISIONAL_MATCH_LEVEL = 4;

function rows(db: DatabaseSync, source: string) {
  return db.prepare(`SELECT trace_id, payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = ? ORDER BY rowid`).all(source)
    .map(r => ({ id: String(r.trace_id), value: JSON.parse(String(r.payload_json)) }));
}

export function recordProposals(store: LessonStore, record: GeneratorRecord, window: { from: Date | null; until: Date | null }, now = new Date()) {
  return record.proposals.map(proposal => {
    const id = `hypothesis:${hashValue(proposal).slice(0, 16)}`;
    if (!store.getTrace(id)) {
      const content = { source: 'hypothesis@1', id, proposal, generator: { provider: record.provider, model: record.model },
        proposedAt: now.toISOString(), episodeWindow: { from: window.from?.toISOString() ?? null, until: window.until?.toISOString() ?? null } };
      store.recordTrace({ trace_id: id, kind: 'behavior', summary: 'Generated hypothesis; model output, unvalidated.', payload: { ...content, hash: hashValue(content) } });
      setHypothesisStatus(store, id, 'proposed', 'generated', now);
    }
    return id;
  });
}

export function setHypothesisStatus(store: LessonStore, id: string, status: HypothesisStatus, reason: string, now = new Date(), evaluation?: unknown) {
  if (!store.getTrace(id)) throw new Error(`unknown hypothesis ${id}`);
  const n = rows(store.db, 'hypothesis-status@1').filter(r => r.value.hypothesisId === id).length;
  const content = { source: 'hypothesis-status@1', hypothesisId: id, status, at: now.toISOString(), reason, ...(evaluation ? { evaluation } : {}) };
  store.recordTrace({ trace_id: `hypothesis-status:${id}:${n}`, kind: 'behavior', summary: `Hypothesis status: ${status}.`,
    payload: { ...content, hash: hashValue(content) } });
}

export function listHypotheses(db: DatabaseSync): Hypothesis[] {
  const statuses = rows(db, 'hypothesis-status@1');
  return rows(db, 'hypothesis@1').map(({ value }) => {
    const history = statuses.filter(s => s.value.hypothesisId === value.id).map(s => ({ status: s.value.status, at: s.value.at, reason: s.value.reason }));
    const last = history[history.length - 1];
    return { id: value.id, proposal: value.proposal, generator: value.generator, proposedAt: value.proposedAt, episodeWindow: value.episodeWindow,
      status: last.status, statusAt: last.at, statusHistory: history };
  });
}

/** Move to shadowing, refusing to exceed the configured number of concurrently shadowed hypotheses. */
export function acceptHypothesis(store: LessonStore, id: string, maxShadowing: number, now = new Date()) {
  const all = listHypotheses(store.db), h = all.find(x => x.id === id);
  if (!h) throw new Error(`unknown hypothesis ${id}`);
  if (h.status !== 'proposed') throw new Error(`only a proposed hypothesis can start shadowing (it is ${h.status})`);
  if (all.filter(x => x.status === 'shadowing').length >= maxShadowing) throw new Error(`already shadowing ${maxShadowing} hypotheses; retire or evaluate one first`);
  setHypothesisStatus(store, id, 'shadowing', 'accepted for shadowing', now);
}

export function recordHypothesisMatch(store: LessonStore, match: Omit<HypothesisMatch, 'verdict' | 'repository'>) {
  const id = `hypothesis-match:${match.hypothesisId}:${match.mode}:${match.episodeId}`;
  if (store.getTrace(id)) return id;
  const verdict = match.level === null ? 'unknown' : match.level >= PROVISIONAL_MATCH_LEVEL ? 'match' : 'no-match';
  const content = { source: 'hypothesis-match@1', ...match, verdict, repository: safeRepository(match.cwd) };
  store.recordTrace({ trace_id: id, run_id: match.sessionId, kind: 'behavior', summary: `Shadow decision: ${verdict}. Nothing delivered.`,
    payload: { ...content, hash: hashValue(content) } });
  return id;
}

function safeRepository(cwd: string) { try { return repositoryKey(cwd) ?? null; } catch { return null; } }

export function hypothesisMatches(db: DatabaseSync, id: string, mode?: 'live' | 'replay'): HypothesisMatch[] {
  return rows(db, 'hypothesis-match@1').map(r => r.value as HypothesisMatch)
    .filter(m => m.hypothesisId === id && (!mode || m.mode === mode));
}

export interface RecurrenceEvaluation {
  verdict: 'recurrent' | 'refuted-recurrence' | 'untested' | 'pending';
  decided: number; matches: number; unknown: number; repositories: number;
  /** Matches whose repository could not be identified (e.g. a since-deleted worktree in a replay). */
  unresolvedRepositoryMatches: number; reason: string | null; months: number; matchesPerMonth: number;
  predicted: Proposal['predicted']; window: { from: string; until: string };
}

/**
 * Recurrence over a window. `untested` when too few failures in scope were decided to judge, which is
 * never reported as a refutation; `pending` when the window has not ended yet.
 */
export function evaluateRecurrence(matches: HypothesisMatch[], predicted: Proposal['predicted'],
  window: { from: Date; until: Date }, options: { now?: Date; minDecided?: number } = {}): RecurrenceEvaluation {
  const inWindow = matches.filter(m => m.at >= window.from.toISOString() && m.at < window.until.toISOString());
  const decided = inWindow.filter(m => m.verdict !== 'unknown'), hits = decided.filter(m => m.verdict === 'match');
  const months = Math.max((window.until.getTime() - window.from.getTime()) / (30 * 86400000), 1 / 30);
  // Only identified repositories count toward spread; a folder path is not a repository identity.
  const repositories = new Set(hits.map(m => m.repository).filter(Boolean)).size;
  const unresolved = hits.filter(m => !m.repository).length;
  const base = { decided: decided.length, matches: hits.length, unknown: inWindow.length - decided.length, repositories,
    unresolvedRepositoryMatches: unresolved, months, matchesPerMonth: hits.length / months, predicted,
    window: { from: window.from.toISOString(), until: window.until.toISOString() } };
  if ((options.now ?? new Date()) < window.until) return { verdict: 'pending', reason: 'window has not ended', ...base };
  if (decided.length < (options.minDecided ?? 30)) return { verdict: 'untested', reason: 'too few failures decided', ...base };
  if (base.matchesPerMonth < predicted.matchesPerMonth) return { verdict: 'refuted-recurrence', reason: 'match rate below prediction', ...base };
  if (repositories >= predicted.repositories) return { verdict: 'recurrent', reason: null, ...base };
  // The shortfall might be covered by matches whose repository is unknown: that is untested, not refuted.
  if (repositories + unresolved >= predicted.repositories)
    return { verdict: 'untested', reason: 'repository spread cannot be established: some matched repositories are unidentified', ...base };
  return { verdict: 'refuted-recurrence', reason: 'repository spread below prediction', ...base };
}
