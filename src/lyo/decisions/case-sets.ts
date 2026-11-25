/**
 * Labelled case sets, a frozen test split and recalibration (Spec 12 §6).
 *
 * Cases are data, not rules: they define where a finding applies. The band is fitted on
 * the calibration split only; the test split is never read while fitting and is
 * identified by `testHash`, so results from different test sets are never mistaken for
 * comparable ones.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import type { TypedDecisionProvider } from '../application/typed-decisions.ts';
import { expectedLevel } from './providers.ts';

export const caseSchema = z.object({
  id: z.string().min(1),
  state: z.string().min(1),
  inputFormat: z.string().min(1),
  label: z.union([z.boolean(), z.literal('ambiguous')]),
  // repair-witness: labelled from what the agent did next in the same session (the observed repair).
  labelSource: z.enum(['agent-draft', 'user-reviewed', 'repair-witness', 'trial-outcome']),
  stratum: z.string().min(1).default('default'),
  addedAt: z.string().min(1),
  evidenceRef: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
}).strict();
export type DecisionCase = z.infer<typeof caseSchema>;

const splitsSchema = z.object({ test: z.array(z.string()), calibration: z.array(z.string()), testHash: z.string(), seed: z.number().int(),
  // Earlier identities of this test split, newest last, kept when its labels are reviewed.
  previousTestHashes: z.array(z.object({ testHash: z.string(), replacedAt: z.string(), reason: z.string() }).strict()).optional() }).strict();
export type Splits = z.infer<typeof splitsSchema>;

export interface ScoreQuestion { type: 'score'; instructions: string; criteria: string[] }

export function caseSetDir(findingId: string, env: NodeJS.ProcessEnv = process.env) {
  const root = env.LYO_DECISION_CASES_DIR ?? join(homedir(), '.lyo', 'decision-cases');
  return join(root, findingId.replace(/[^A-Za-z0-9_.-]/g, '_'));
}

export function readCases(dir: string): DecisionCase[] {
  const path = join(dir, 'cases.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => caseSchema.parse(JSON.parse(line))) : [];
}

export function readSplits(dir: string): Splits {
  return splitsSchema.parse(JSON.parse(readFileSync(join(dir, 'splits.json'), 'utf8')));
}

/** Labels are part of the identity: relabelling a test case is a different test set. */
export function computeTestHash(cases: DecisionCase[], testIds: string[]) {
  const byId = new Map(cases.map(c => [c.id, c]));
  return hashValue([...testIds].sort().map(id => [id, byId.get(id)?.label ?? null]));
}

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** Creates a case set with a stratified test split (by label and stratum). Refuses to overwrite an existing set. */
export function createCaseSet(dir: string, cases: DecisionCase[], options: { testFraction?: number; seed?: number } = {}) {
  if (existsSync(join(dir, 'splits.json'))) throw new Error('case set already exists; use addCases, or pass --new-test-set to replace its test split');
  return writeSplit(dir, cases, options);
}

/** Replaces the test split. An explicit action: earlier results stop being comparable. */
export function newTestSet(dir: string, options: { testFraction?: number; seed?: number } = {}) {
  return writeSplit(dir, readCases(dir), options);
}

function writeSplit(dir: string, cases: DecisionCase[], options: { testFraction?: number; seed?: number }) {
  const fraction = options.testFraction ?? 0.3, seed = options.seed ?? 20261125;
  if (!(fraction > 0 && fraction < 1)) throw new Error('testFraction must be between 0 and 1');
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('case ids must be unique');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const random = mulberry32(seed), groups = new Map<string, DecisionCase[]>();
  for (const c of cases) {
    const key = `${String(c.label)}|${c.stratum}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const test: string[] = [];
  for (const group of [...groups.keys()].sort().map(k => groups.get(k)!)) {
    const shuffled = [...group].sort((a, b) => a.id.localeCompare(b.id));
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    test.push(...shuffled.slice(0, Math.round(group.length * fraction)).map(c => c.id));
  }
  const testSet = new Set(test);
  const splits: Splits = { test: [...test].sort(), calibration: cases.map(c => c.id).filter(id => !testSet.has(id)).sort(),
    testHash: computeTestHash(cases, test), seed };
  writeFileSync(join(dir, 'cases.jsonl'), cases.map(c => JSON.stringify(c)).join('\n') + '\n', { mode: 0o600 });
  writeFileSync(join(dir, 'splits.json'), JSON.stringify(splits, null, 2) + '\n', { mode: 0o600 });
  return splits;
}

/** New cases join calibration only; the test split and its hash never change here. */
export function addCases(dir: string, added: DecisionCase[]) {
  const existing = new Set(readCases(dir).map(c => c.id)), splits = readSplits(dir);
  const fresh = added.filter(c => !existing.has(c.id));
  for (const c of fresh) appendFileSync(join(dir, 'cases.jsonl'), JSON.stringify(caseSchema.parse(c)) + '\n');
  splits.calibration = [...splits.calibration, ...fresh.map(c => c.id)].sort();
  writeFileSync(join(dir, 'splits.json'), JSON.stringify(splits, null, 2) + '\n', { mode: 0o600 });
  return { added: fresh.length, skipped: added.length - fresh.length };
}

export interface Relabel { id: string; label: DecisionCase['label']; labelSource: DecisionCase['labelSource']; evidenceRef?: string; note?: string }

/**
 * Reviewed labels replace drafts in place. The split is kept; when a test label changes, the test set
 * gets a new identity and the old hash is retained, so earlier results are never mistaken for comparable.
 */
export function relabelCases(dir: string, updates: Relabel[], reason: string) {
  const cases = readCases(dir), splits = readSplits(dir), byId = new Map(cases.map(c => [c.id, c]));
  for (const u of updates) if (!byId.has(u.id)) throw new Error(`unknown case ${u.id}`);
  const updated = cases.map(c => {
    const u = updates.find(x => x.id === c.id);
    return u ? caseSchema.parse({ ...c, label: u.label, labelSource: u.labelSource,
      ...(u.evidenceRef ? { evidenceRef: u.evidenceRef } : {}), ...(u.note ? { note: u.note } : {}) }) : c;
  });
  const testHash = computeTestHash(updated, splits.test);
  const next: Splits = testHash === splits.testHash ? splits : { ...splits, testHash,
    previousTestHashes: [...(splits.previousTestHashes ?? []), { testHash: splits.testHash, replacedAt: new Date().toISOString(), reason }] };
  writeFileSync(join(dir, 'cases.jsonl'), updated.map(c => JSON.stringify(c)).join('\n') + '\n', { mode: 0o600 });
  writeFileSync(join(dir, 'splits.json'), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return { updated: updates.length, testHash: next.testHash, previous: testHash === splits.testHash ? null : splits.testHash };
}

interface CachedAnswer { key: string; caseId: string; level: number | null; answeredModel: string; latencyMs: number; error?: string }

function cachePath(dir: string, provider: string, model: string) {
  return join(dir, 'decisions', provider, `${model.replace(/[^A-Za-z0-9_.-]/g, '_')}.jsonl`);
}

const cacheKey = (provider: string, model: string, question: ScoreQuestion, state: string) => hashValue({ provider, model, question, state });

/** Asks only what is not cached for this provider, model and question. */
export async function scoreCases(dir: string, input: { provider: TypedDecisionProvider; providerName: string; model: string;
  question: ScoreQuestion; timeoutMs?: number; now?: () => number }) {
  const cases = readCases(dir), path = cachePath(dir, input.providerName, input.model), now = input.now ?? Date.now;
  mkdirSync(join(dir, 'decisions', input.providerName), { recursive: true, mode: 0o700 });
  const cached = new Map<string, CachedAnswer>(existsSync(path)
    ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as CachedAnswer).filter(a => !a.error).map(a => [a.key, a]) : []);
  let asked = 0, errors = 0;
  for (const c of cases) {
    const key = cacheKey(input.providerName, input.model, input.question, c.state);
    if (cached.has(key)) continue;
    const t = now();
    try {
      const record = await input.provider.decide({ state: c.state, questions: { match: input.question } }, { timeoutMs: input.timeoutMs ?? 120000 });
      const answer: CachedAnswer = { key, caseId: c.id, level: expectedLevel(record.answers.match), answeredModel: record.answeredModel, latencyMs: now() - t };
      appendFileSync(path, JSON.stringify(answer) + '\n'); cached.set(key, answer);
    } catch (error) {
      errors++;
      appendFileSync(path, JSON.stringify({ key, caseId: c.id, level: null, answeredModel: '', latencyMs: now() - t,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 200) }) + '\n');
    }
    asked++;
  }
  const levels = new Map<string, { level: number | null; latencyMs: number }>();
  for (const c of cases) {
    const a = cached.get(cacheKey(input.providerName, input.model, input.question, c.state));
    if (a) levels.set(c.id, { level: a.level, latencyMs: a.latencyMs });
  }
  return { asked, errors, levels };
}

export interface Band { no: number; yes: number }

/** Fits on the given labelled levels only. `yes`: lowest cut-off with false alarms ≤ maxFalseAlarmRate. `no`: highest cut-off with misses ≤ maxMissRate. */
export function fitBand(positives: number[], negatives: number[], maxFalseAlarmRate = 0.05, maxMissRate = 0.05): Band {
  if (!positives.length || !negatives.length) throw new Error('fitting needs labelled positives and negatives');
  const candidates = [...new Set([...positives, ...negatives])].sort((a, b) => a - b);
  const yes = candidates.find(t => negatives.filter(n => n >= t).length / negatives.length <= maxFalseAlarmRate)
    ?? Math.max(...candidates) + 1e-6;
  const below = candidates.filter(t => positives.filter(p => p <= t).length / positives.length <= maxMissRate);
  let no = below.length ? Math.max(...below) : Math.min(...candidates) - 1e-6;
  if (no >= yes) no = yes - 1e-6;
  return { no, yes };
}

function auc(pos: number[], neg: number[]) {
  let s = 0; for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

export function evaluateBand(positives: number[], negatives: number[], band: Band, seed = 7) {
  const caught = positives.filter(p => p >= band.yes).length, falseAlarms = negatives.filter(n => n >= band.yes).length;
  const undecided = [...positives, ...negatives].filter(x => x > band.no && x < band.yes).length;
  const missed = positives.filter(p => p <= band.no).length;
  const random = mulberry32(seed), draws: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const p = positives.map(() => positives[Math.floor(random() * positives.length)]);
    const n = negatives.map(() => negatives[Math.floor(random() * negatives.length)]);
    draws.push(auc(p, n));
  }
  draws.sort((a, b) => a - b);
  return { caught, positives: positives.length, falseAlarms, negatives: negatives.length, undecided, missed,
    auc: auc(positives, negatives), aucInterval: [draws[25], draws[974]] as [number, number] };
}

/** Recalibration report. Nothing is registered here; the caller decides from `register`. */
export async function recalibrate(dir: string, input: { provider: TypedDecisionProvider; providerName: string; model: string;
  question: ScoreQuestion; maxFalseAlarmRate?: number; maxMissRate?: number; timeoutMs?: number }) {
  const cases = readCases(dir), splits = readSplits(dir), byId = new Map(cases.map(c => [c.id, c]));
  if (computeTestHash(cases, splits.test) !== splits.testHash) throw new Error('test split labels changed since it was frozen; create a new test set explicitly');
  const scored = await scoreCases(dir, input);
  const levelsOf = (ids: string[], label: boolean) => ids.map(id => byId.get(id)!).filter(c => c.label === label)
    .map(c => scored.levels.get(c.id)?.level).filter((x): x is number => typeof x === 'number');
  const calP = levelsOf(splits.calibration, true), calN = levelsOf(splits.calibration, false);
  const band = fitBand(calP, calN, input.maxFalseAlarmRate, input.maxMissRate);
  const test = evaluateBand(levelsOf(splits.test, true), levelsOf(splits.test, false), band);
  const latencies = [...scored.levels.values()].map(l => l.latencyMs).sort((a, b) => a - b);
  const sources = Object.fromEntries(['agent-draft', 'user-reviewed', 'repair-witness', 'trial-outcome'].map(s => [s, cases.filter(c => c.labelSource === s).length]));
  const sufficient = calP.length >= 20 && calN.length >= 20 && test.positives >= 20 && test.negatives >= 20;
  return { provider: input.providerName, model: input.model, asked: scored.asked, errors: scored.errors, band,
    calibration: { positives: calP.length, negatives: calN.length }, test, testHash: splits.testHash, sufficient,
    latencyMs: latencies.length ? { p50: latencies[Math.floor(latencies.length / 2)], p90: latencies[Math.floor(latencies.length * 0.9)] } : null,
    labelSources: sources, ambiguous: cases.filter(c => c.label === 'ambiguous').length };
}

/** Higher is better: sensitivity minus false-alarm rate on the test split. */
export const testScore = (t: { caught: number; positives: number; falseAlarms: number; negatives: number }) =>
  t.caught / t.positives - t.falseAlarms / t.negatives;
