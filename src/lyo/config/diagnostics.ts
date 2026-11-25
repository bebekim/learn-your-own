/**
 * Machine diagnostics for tuning (Spec 15). Measures what LYO's budgets depend on and suggests a
 * value for each setting, with the measurement that motivates it. Suggestions are advice: only
 * LYO's own config files are ever written, and only with `lyo tune --apply`.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, freemem, homedir, loadavg, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { createDecisionProvider, decisionConfigPath, loadDecisionConfig, type DecisionConfig } from '../decisions/providers.ts';
import { lyoHome } from '../storage/lyo-home.ts';
import { loadTuning, lyoConfigPath, type Tuning } from './tuning.ts';

export interface Timing { samples: number; p50Ms: number; p90Ms: number; maxMs: number }
export interface HostHookTimeout { file: string; event: string; timeoutSeconds: number }
export interface Diagnostics {
  measuredAt: string;
  machine: { platform: string; arch: string; node: string; cpus: number; totalMemGb: number; freeMemGb: number; load1: number };
  nodeStart: Timing;
  git: Timing | null;
  sqliteCommit: Timing;
  provider: { name: string; model: string; coldMs: number; warmMs: number } | { skipped: string };
  hostHooks: HostHookTimeout[];
}
export interface Suggestion { file: string; key: string; current: unknown; suggested: unknown; reason: string; applies: boolean }

const round = (ms: number) => Math.round(ms * 10) / 10;
function timing(values: number[]): Timing {
  const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return { samples: values.length, p50Ms: round(at(0.5)), p90Ms: round(at(0.9)), maxMs: round(sorted.at(-1)!) };
}
function time(n: number, fn: () => void) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); fn(); out.push(performance.now() - t); }
  return timing(out);
}

/** Lyo hook entries (a `command` mentioning lyo with a numeric `timeout`) in host hook settings. */
export function hostHookTimeouts(files: string[]): HostHookTimeout[] {
  const found: HostHookTimeout[] = [];
  for (const file of files) {
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    const walk = (node: unknown, event: string) => {
      if (Array.isArray(node)) { for (const v of node) walk(v, event); return; }
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      if (typeof o.command === 'string' && /\blyo\b/.test(o.command) && typeof o.timeout === 'number')
        found.push({ file, event, timeoutSeconds: o.timeout });
      for (const [k, v] of Object.entries(o)) walk(v, /^[A-Z][A-Za-z]+$/.test(k) ? k : event);
    };
    walk(raw, '');
  }
  return found;
}

export async function runDiagnostics(options: { env?: NodeJS.ProcessEnv; cwd?: string; quick?: boolean; hostSettings?: string[] } = {}): Promise<Diagnostics> {
  const env = options.env ?? process.env, cwd = options.cwd ?? process.cwd();
  const nodeStart = time(5, () => { spawnSync(process.execPath, ['-e', 'process.stdout.write("{}")'], { stdio: 'ignore' }); });
  const gitProbe = spawnSync('git', ['--version'], { stdio: 'ignore' });
  const git = gitProbe.error ? null : time(5, () => { spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, stdio: 'ignore' }); });
  const dir = mkdtempSync(join(tmpdir(), 'lyo-tune-'));
  let sqliteCommit: Timing;
  try {
    const db = new DatabaseSync(join(dir, 'probe.db'));
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; CREATE TABLE t (v TEXT)');
    const insert = db.prepare('INSERT INTO t (v) VALUES (?)');
    sqliteCommit = time(30, () => { db.exec('BEGIN IMMEDIATE'); insert.run('x'.repeat(512)); db.exec('COMMIT'); });
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
  let provider: Diagnostics['provider'] = { skipped: 'quick mode' };
  if (!options.quick) {
    const config = loadDecisionConfig(env);
    if (!config) provider = { skipped: 'no decision config' };
    else {
      try {
        const p = createDecisionProvider(config, { env });
        const ask = async () => {
          const t = performance.now();
          await p.decide({ state: 'Command:\nls /missing\n\nOutput (tail):\nls: /missing: No such file or directory',
            questions: { match: { type: 'score', instructions: 'Score 1-5 how clearly this command failed because a path was missing.',
              criteria: ['1: unrelated', '2: unlikely', '3: unclear', '4: likely', '5: clearly'] } } }, { timeoutMs: 300000 });
          return performance.now() - t;
        };
        const coldMs = await ask(), warmMs = await ask();
        provider = { name: config.provider, model: config.provider === 'mlxcel' ? config.mlxcel.decisionModel : config.provider === 'openrouter' ? config.openrouter.model : config.provider,
          coldMs: Math.round(coldMs), warmMs: Math.round(warmMs) };
      } catch (error) { provider = { skipped: `provider error: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}` }; }
    }
  }
  const hostSettings = options.hostSettings ?? [join(homedir(), '.claude', 'settings.json'), join(homedir(), '.codex', 'hooks.json')];
  return {
    measuredAt: new Date().toISOString(),
    machine: { platform: process.platform, arch: process.arch, node: process.version, cpus: cpus().length,
      totalMemGb: Math.round(totalmem() / 2 ** 30 * 10) / 10, freeMemGb: Math.round(freemem() / 2 ** 30 * 10) / 10, load1: Math.round(loadavg()[0]! * 100) / 100 },
    nodeStart, git, sqliteCommit, provider, hostHooks: hostHookTimeouts(hostSettings.filter(existsSync)),
  };
}

const ceilTo = (value: number, step: number) => Math.ceil(value / step) * step;

/**
 * Suggestions from measurements. Budgets are a multiple of the measured p90 so a machine under
 * load (other agents, a local model) keeps headroom; they never go below the shipped defaults.
 */
export function suggestTuning(d: Diagnostics, tuning: Tuning, decisions: DecisionConfig | null, paths: { config: string; decisions: string }): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (file: string, key: string, current: unknown, suggested: unknown, reason: string, applies = true) => {
    if (JSON.stringify(current) !== JSON.stringify(suggested)) out.push({ file, key, current, suggested, reason, applies });
  };
  const checkSeconds = Math.min(10, Math.max(2, ceilTo(d.nodeStart.p90Ms / 1000 * 8 + 0.5, 0.5)));
  add(paths.config, 'tuning.hooks.checkSeconds', tuning.hooks.checkSeconds, checkSeconds,
    `an evaluator check starts a node process: p90 start-up ${d.nodeStart.p90Ms} ms; budget = 8×p90 + 0.5 s, at least 2 s`);
  add(paths.config, 'tuning.hooks.stdinGuardMs', tuning.hooks.stdinGuardMs, Math.max(2500, ceilTo(d.nodeStart.p90Ms * 10, 500)),
    `node start-up p90 ${d.nodeStart.p90Ms} ms; guard = 10×p90, at least 2500 ms`);
  if (d.git) add(paths.config, 'tuning.git.timeoutMs', tuning.git.timeoutMs, Math.max(1000, ceilTo(d.git.p90Ms * 10, 100)),
    `git rev-parse p90 ${d.git.p90Ms} ms; timeout = 10×p90, at least 1000 ms (a timeout loses the repository identity)`);
  add(paths.config, 'tuning.sqlite.busyTimeoutMs', tuning.sqlite.busyTimeoutMs, Math.min(30000, Math.max(5000, ceilTo(d.sqliteCommit.p90Ms * 500, 1000))),
    `SQLite commit p90 ${d.sqliteCommit.p90Ms} ms; wait = 500×p90, 5-30 s`);
  add(paths.config, 'tuning.sqlite.ledgerBusyTimeoutMs', tuning.sqlite.ledgerBusyTimeoutMs, Math.min(60000, Math.max(10000, ceilTo(d.sqliteCommit.p90Ms * 1000, 1000))),
    `SQLite commit p90 ${d.sqliteCommit.p90Ms} ms; capture ledgers take many concurrent hook writes: wait = 1000×p90, 10-60 s`);
  if (decisions && 'coldMs' in d.provider) {
    const timeoutMs = Math.max(30000, ceilTo(d.provider.coldMs * 3, 1000));
    add(paths.decisions, 'worker.timeoutMs', decisions.worker.timeoutMs, timeoutMs,
      `${d.provider.name} decision: first (cold) ${d.provider.coldMs} ms, then ${d.provider.warmMs} ms; timeout = 3×cold, at least 30 s`);
    const maxAgeSeconds = Math.max(decisions.worker.maxAgeSeconds, Math.ceil(timeoutMs / 1000) * 10);
    add(paths.decisions, 'worker.maxAgeSeconds', decisions.worker.maxAgeSeconds, maxAgeSeconds,
      'a queued job must outlive about ten decisions ahead of it');
  }
  if (decisions?.provider === 'mlxcel') {
    const idle = d.machine.totalMemGb <= 16 ? 120 : 600;
    add(paths.decisions, 'worker.idleSeconds', decisions.worker.idleSeconds, idle,
      `${d.machine.totalMemGb} GB memory: ${d.machine.totalMemGb <= 16 ? 'release the local model sooner when idle' : 'keep the local model warm between failures'}`);
  }
  const needed = Math.ceil(checkSeconds * 3 + 2);
  for (const h of d.hostHooks) if (h.timeoutSeconds < needed)
    add(h.file, `hooks.${h.event || '?'}.timeout`, h.timeoutSeconds, needed,
      `a hook may run up to three checks of ${checkSeconds} s plus capture; host settings are not edited by LYO`, false);
  return out;
}

const backup = (file: string) => { if (existsSync(file)) copyFileSync(file, `${file}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`); };
function setPath(target: Record<string, any>, key: string, value: unknown) {
  const parts = key.split('.'); let node = target;
  for (const p of parts.slice(0, -1)) node = (node[p] ??= {});
  node[parts.at(-1)!] = value;
}

/** Writes applicable suggestions into LYO's own config files, each backed up first. */
export function applySuggestions(suggestions: Suggestion[], files: string[]) {
  const written: string[] = [];
  for (const file of files) {
    const mine = suggestions.filter(s => s.applies && s.file === file);
    if (!mine.length) continue;
    const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    for (const s of mine) setPath(raw, s.key, s.suggested);
    backup(file);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
    written.push(file);
  }
  return written;
}

export const tuneReportPath = (env: NodeJS.ProcessEnv = process.env) => join(lyoHome(env), 'tune-report.json');

export async function tune(options: { env?: NodeJS.ProcessEnv; cwd?: string; quick?: boolean; apply?: boolean; fromInstall?: boolean }) {
  const env = options.env ?? process.env;
  const paths = { config: lyoConfigPath(env), decisions: decisionConfigPath(env) };
  let decisions: DecisionConfig | null = null;
  try { decisions = loadDecisionConfig(env); } catch { /* an invalid decision config gets no decision suggestions */ }
  const diagnostics = await runDiagnostics({ env, cwd: options.cwd, quick: options.quick });
  const suggestions = suggestTuning(diagnostics, loadTuning(env), decisions, paths);
  const written = options.apply ? applySuggestions(suggestions, [paths.config, paths.decisions]) : [];
  const report = { ok: true, ...paths, diagnostics, suggestions, applied: written,
    reviewedAt: options.fromInstall ? null : new Date().toISOString() };
  mkdirSync(lyoHome(env), { recursive: true, mode: 0o700 });
  writeFileSync(tuneReportPath(env), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return report;
}

/**
 * One line for a CLI user: the machine was never measured (npm often blocks install scripts, so
 * the install-time run cannot be relied on), or an install-time report has unreviewed suggestions.
 */
export function pendingTuneNotice(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!existsSync(tuneReportPath(env))) return 'Lyo has not measured this machine yet; run `lyo tune` to check its time budgets.\n';
  try {
    const report = JSON.parse(readFileSync(tuneReportPath(env), 'utf8'));
    if (report.reviewedAt || !Array.isArray(report.suggestions) || !report.suggestions.length) return null;
    return `Lyo measured this machine at install and suggests ${report.suggestions.length} setting change(s); run \`lyo tune\` to review.\n`;
  } catch { return null; }
}
