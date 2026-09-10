import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { EvalBaselineId, EvalEpisodeResult } from './live-runner.ts';

import type { EvalReport, EvalBaselineSummary, RuleGateDecision, WorstRegression } from './report-types.ts';
export type { EvalReport, EvalBaselineSummary, RuleGateDecision, WorstRegression } from './report-types.ts';

type EpisodeWithOptionalMetrics = Omit<EvalEpisodeResult, 'token_usage'> & {
  false_gate?: boolean;
  regression?: boolean;
  context_overhead_tokens?: number;
  token_usage?: null | {
    total_tokens?: number;
    estimated_cost?: number;
  };
};

export function readEpisodeRows(path: string): EvalEpisodeResult[] {
  const text = readFileSync(path, 'utf8').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text) as EvalEpisodeResult[];
  return text.split(/\n+/).map((line) => JSON.parse(line) as EvalEpisodeResult);
}

export function buildEvalReport(
  episodes: EvalEpisodeResult[],
  options: {
    ruleId?: string;
    baselineId?: EvalBaselineId;
    treatmentId?: EvalBaselineId;
  } = {}
): EvalReport {
  validateEpisodes(episodes);
  const summaries = summarizeByBaseline(episodes);
  const baseline = options.baselineId
    ? summaries.find((summary) => summary.baseline_id === options.baselineId)
    : null;
  const treatment = options.treatmentId
    ? summaries.find((summary) => summary.baseline_id === options.treatmentId)
    : null;

  return {
    version: 'lyo/eval-report/v2',
    task_split_hash: hashTaskSet(episodes),
    baseline_scores: summaries,
    worst_regressions: worstRegressions(episodes),
    gate: baseline && treatment && options.ruleId
      ? decideRuleGate({
          ruleId: options.ruleId,
          baseline,
          treatment,
          episodes,
        })
      : null,
  };
}

export function decideRuleGate({
  ruleId,
  baseline,
  treatment,
  episodes = [],
}: {
  ruleId: string;
  baseline: EvalBaselineSummary;
  treatment: EvalBaselineSummary;
  episodes?: EvalEpisodeResult[];
}): RuleGateDecision {
  validateEpisodes(episodes);
  const reasons = comparisonProblems(episodes, baseline.baseline_id, treatment.baseline_id, ruleId);
  if (reasons.length) return gateDecision(ruleId, baseline, treatment, 'inconclusive', reasons);

  const observed = summarizeByBaseline(episodes);
  baseline = observed.find(s => s.baseline_id === baseline.baseline_id)!;
  treatment = observed.find(s => s.baseline_id === treatment.baseline_id)!;

  if (treatment.false_gate_rate !== null && baseline.false_gate_rate !== null && treatment.false_gate_rate > baseline.false_gate_rate) {
    reasons.push('false_gate_rate increased');
  }
  if (treatment.regression_rate !== null && baseline.regression_rate !== null && treatment.regression_rate > baseline.regression_rate) {
    reasons.push('regression_rate increased');
  }
  if (reasons.length > 0) {
    return gateDecision(ruleId, baseline, treatment, 'reject', reasons);
  }

  const baseRows = episodes.filter(e => e.baseline_id === baseline.baseline_id);
  const pairs = baseRows.map(b => [b, episodes.find(t => t.baseline_id === treatment.baseline_id && t.pair_id === b.pair_id)!]);
  const successWins = pairs.filter(([b, t]) => !b.outcome.verified_success && t.outcome.verified_success).length;
  const successLosses = pairs.filter(([b, t]) => b.outcome.verified_success && !t.outcome.verified_success).length;
  // Predeclared conservative paired gate: the Wilson lower bound on wins
  // among discordant pairs must exceed chance. No tuning on the test split.
  if (successWins > successLosses && wilson(successWins, successWins + successLosses)[0] > 0.5) {
    return gateDecision(ruleId, baseline, treatment, 'accept', ['verified_success_rate improved']);
  }
  if (
    baseline.verified_success_rate !== null && baseline.verified_success_rate > 0 &&
    treatment.verified_success_rate === baseline.verified_success_rate &&
    baseline.token_cost !== null && treatment.token_cost !== null &&
    treatment.token_cost < baseline.token_cost
  ) {
    const wins = pairs.filter(([b, t]) => t.token_usage!.total_tokens < b.token_usage!.total_tokens).length;
    const losses = pairs.filter(([b, t]) => t.token_usage!.total_tokens > b.token_usage!.total_tokens).length;
    if (successLosses === 0 && wilson(wins, wins + losses)[0] > 0.5)
      return gateDecision(ruleId, baseline, treatment, 'accept', ['success unchanged and token_cost improved']);
  }

  return gateDecision(ruleId, baseline, treatment, treatment.verified_success_rate !== null && baseline.verified_success_rate !== null &&
    treatment.verified_success_rate < baseline.verified_success_rate ? 'reject' : 'inconclusive',
    ['no supported success or cost improvement']);
}

export function renderEvalReportMarkdown(report: EvalReport): string {
  const lines = [
    '# LYO Eval Report',
    '',
    `Task split hash: \`${report.task_split_hash}\``,
    '',
    '| Baseline | Episodes | Known Outcomes | Unknown Outcomes | Verified Success (known outcomes) | 95% Interval | False Gate | Regression | Token Cost | Context Overhead | Rule Apps | Avg Wall Time |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const summary of report.baseline_scores) {
    lines.push(
      `| ${summary.baseline_id} | ${summary.episodes} | ${summary.known_outcomes} | ${summary.unknown_outcomes} | ${pct(summary.verified_success_rate)} | ` +
      `${summary.verified_success_interval?.map(pct).join('-') ?? 'unknown'} | ` +
      `${pct(summary.false_gate_rate)} | ${pct(summary.regression_rate)} | ${summary.token_cost ?? 'unknown'} | ` +
      `${summary.context_overhead_tokens ?? 'unknown'} | ${summary.rule_applications} | ${summary.avg_wall_time_ms}ms |`
    );
  }
  if (report.gate) {
    lines.push('', `Gate: **${report.gate.decision}** (${report.gate.reasons.join('; ')})`);
  }
  return `${lines.join('\n')}\n`;
}

function summarizeByBaseline(episodes: EvalEpisodeResult[]): EvalBaselineSummary[] {
  const groups = new Map<EvalBaselineId, EpisodeWithOptionalMetrics[]>();
  for (const episode of episodes as EpisodeWithOptionalMetrics[]) {
    const group = groups.get(episode.baseline_id) ?? [];
    group.push(episode);
    groups.set(episode.baseline_id, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([baselineId, rows]) => summarizeBaseline(baselineId, rows));
}

function summarizeBaseline(
  baselineId: EvalBaselineId,
  episodes: EpisodeWithOptionalMetrics[]
): EvalBaselineSummary {
  const successes = episodes.filter((episode) => episode.outcome.verified_success === true).length;
  const known = episodes.filter((episode) => episode.outcome.verified_success !== null).length;
  const falseGates = episodes.filter((episode) => episode.false_gate === true).length;
  const regressions = episodes.filter((episode) => episode.regression === true).length;
  return {
    baseline_id: baselineId,
    episodes: episodes.length,
    known_outcomes: known,
    unknown_outcomes: episodes.length - known,
    verified_success_rate: known ? rate(successes, known) : null,
    verified_success_interval: known ? wilson(successes, known) : null,
    false_gate_rate: episodes.every(e => typeof e.false_gate === 'boolean') ? rate(falseGates, episodes.length) : null,
    regression_rate: episodes.every(e => typeof e.regression === 'boolean') ? rate(regressions, episodes.length) : null,
    token_cost: episodes.every(e => typeof e.token_usage?.total_tokens === 'number') ? sum(episodes, e => e.token_usage!.total_tokens!) : null,
    context_overhead_tokens: episodes.every(e => typeof e.context_overhead_tokens === 'number') ? sum(episodes, e => e.context_overhead_tokens!) : null,
    avg_wall_time_ms: Math.round(sum(episodes, (episode) => episode.wall_time_ms) / Math.max(1, episodes.length)),
    rule_applications: sum(episodes, (episode) => episode.injected_context.rule_gates.length),
  };
}

function worstRegressions(episodes: EvalEpisodeResult[]): WorstRegression[] {
  return (episodes as EpisodeWithOptionalMetrics[])
    .filter((episode) => episode.regression === true || episode.outcome.verified_success === false)
    .slice(0, 5)
    .map((episode) => ({
      episode_id: episode.episode_id,
      task_id: episode.task_id,
      baseline_id: episode.baseline_id,
      verifier_command: episode.verifier_evidence.command,
      exit_code: episode.verifier_evidence.exit_code,
      stderr: episode.verifier_evidence.stderr.slice(0, 500),
    }));
}

function gateDecision(
  ruleId: string,
  baseline: EvalBaselineSummary,
  treatment: EvalBaselineSummary,
  decision: RuleGateDecision['decision'],
  reasons: string[]
): RuleGateDecision {
  return {
    rule_id: ruleId,
    baseline_id: baseline.baseline_id,
    treatment_id: treatment.baseline_id,
    decision,
    reasons,
  };
}

function hashTaskSet(episodes: EvalEpisodeResult[]): string {
  const ids = [...new Set(episodes.map(e => `${e.split ?? 'unknown'}:${e.task_id}:${e.task_fingerprint ?? 'unknown'}:${e.verifier_sha256 ?? 'unknown'}`))].sort();
  return crypto.createHash('sha256').update(ids.join('\n')).digest('hex');
}

function wilson(successes: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + z ** 2 / total;
  const center = p + z ** 2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total);
  return [roundRate((center - margin) / denom), roundRate((center + margin) / denom)];
}

function rate(count: number, total: number): number {
  return roundRate(total === 0 ? 0 : count / total);
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function pct(value: number | null): string {
  if (value === null) return 'unknown';
  return `${Math.round(value * 1000) / 10}%`;
}

function validateEpisodes(episodes: EvalEpisodeResult[]): void {
  if (!Array.isArray(episodes)) throw new Error('episodes must be an array');
  const ids = new Set<string>();
  for (const row of episodes) {
    if (!row || typeof row.episode_id !== 'string' || ids.has(row.episode_id))
      throw new Error('episodes require unique episode_id values');
    ids.add(row.episode_id);
    if (!['B0', 'B1', 'B3', 'B4'].includes(row.baseline_id) ||
        typeof row.task_id !== 'string' || (row.outcome?.verified_success !== null && typeof row.outcome?.verified_success !== 'boolean') ||
        !row.verifier_evidence || typeof row.verifier_evidence.command !== 'string' ||
        typeof row.verifier_evidence.stderr !== 'string' ||
        typeof row.model !== 'string' || typeof row.harness !== 'string' ||
        !Array.isArray(row.allowed_tools) || !row.allowed_tools.every(t => typeof t === 'string') ||
        !row.budget || !Array.isArray(row.injected_context?.rule_gates) ||
        !Number.isFinite(row.wall_time_ms) || row.wall_time_ms < 0)
      throw new Error(`invalid episode: ${row.episode_id}`);
    for (const value of [row.token_usage?.total_tokens, row.token_usage?.estimated_cost, row.context_overhead_tokens]) {
      if (value != null && (!Number.isFinite(value) || value < 0))
        throw new Error(`invalid measured cost: ${row.episode_id}`);
    }
  }
}

function comparisonProblems(episodes: EvalEpisodeResult[], baselineId: EvalBaselineId, treatmentId: EvalBaselineId, ruleId: string): string[] {
  const baseline = episodes.filter(e => e.baseline_id === baselineId);
  const treatment = episodes.filter(e => e.baseline_id === treatmentId);
  if (baselineId === treatmentId || baseline.length < 2 || baseline.length !== treatment.length)
    return ['at least two matched pairs from distinct baselines are required'];
  const rows = [...baseline, ...treatment];
  const reasons: string[] = [];
  if (rows.some(e => e.outcome.verified_success === null))
    reasons.push('task acceptance must be known for every compared episode');
  if (rows.some(e => e.episode_kind !== 'agent' || !e.trace_ref || !e.diff_ref))
    reasons.push('real agent episodes with trace and output evidence are required');
  if (rows.some(e => e.split !== 'selection')) reasons.push('rule selection may use only selection-split episodes');
  if (rows.some(e => !e.pair_id || !/^[a-f0-9]{64}$/.test(e.task_fingerprint ?? '') || !/^[a-f0-9]{64}$/.test(e.verifier_sha256 ?? '')))
    reasons.push('pair ids and hashed task/verifier identities are required');
  if (rows.some(e => e.token_usage == null || typeof e.token_usage.total_tokens !== 'number' ||
      typeof e.false_gate !== 'boolean' || typeof e.regression !== 'boolean'))
    reasons.push('cost, false-gate and regression measurements must be present');
  if (treatment.some(e => !(e.policy_ref === ruleId && e.decision_ref && e.delivery_ref)
    && !e.injected_context.rule_gates.some(g => g.ruleId === ruleId)))
    reasons.push('the nominated intervention must be recorded in every treatment episode');
  const signature = (e: EvalEpisodeResult) => JSON.stringify([
    e.task_id, e.task_fingerprint, e.verifier_sha256, e.model, e.harness,
    e.budget, [...e.allowed_tools].sort(),
  ]);
  if (new Set(baseline.map(e => e.pair_id)).size !== baseline.length ||
      new Set(treatment.map(e => e.pair_id)).size !== treatment.length ||
      baseline.some(b => !treatment.some(t => t.pair_id === b.pair_id && signature(t) === signature(b))))
    reasons.push('task, model, harness, budget, tools and verifier must match within each unique pair');
  return reasons;
}
