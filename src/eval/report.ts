import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { EvalBaselineId, EvalEpisodeResult } from './live-runner.ts';

export interface EvalReport {
  version: 'lyo/eval-report/v1';
  task_split_hash: string;
  baseline_scores: EvalBaselineSummary[];
  worst_regressions: WorstRegression[];
  gate: RuleGateDecision | null;
}

export interface EvalBaselineSummary {
  baseline_id: EvalBaselineId;
  episodes: number;
  verified_success_rate: number;
  verified_success_interval: [number, number];
  false_gate_rate: number;
  regression_rate: number;
  token_cost: number;
  context_overhead_tokens: number;
  avg_wall_time_ms: number;
  rule_applications: number;
}

export interface RuleGateDecision {
  rule_id: string;
  baseline_id: EvalBaselineId;
  treatment_id: EvalBaselineId;
  decision: 'accept' | 'reject';
  reasons: string[];
}

export interface WorstRegression {
  episode_id: string;
  task_id: string;
  baseline_id: EvalBaselineId;
  verifier_command: string;
  exit_code: number | null;
  stderr: string;
}

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
  const summaries = summarizeByBaseline(episodes);
  const baseline = options.baselineId
    ? summaries.find((summary) => summary.baseline_id === options.baselineId)
    : null;
  const treatment = options.treatmentId
    ? summaries.find((summary) => summary.baseline_id === options.treatmentId)
    : null;

  return {
    version: 'lyo/eval-report/v1',
    task_split_hash: hashTaskSet(episodes),
    baseline_scores: summaries,
    worst_regressions: worstRegressions(episodes),
    gate: baseline && treatment && options.ruleId
      ? decideRuleGate({
          ruleId: options.ruleId,
          baseline,
          treatment,
        })
      : null,
  };
}

export function decideRuleGate({
  ruleId,
  baseline,
  treatment,
}: {
  ruleId: string;
  baseline: EvalBaselineSummary;
  treatment: EvalBaselineSummary;
}): RuleGateDecision {
  const reasons: string[] = [];

  if (treatment.false_gate_rate > baseline.false_gate_rate) {
    reasons.push('false_gate_rate increased');
  }
  if (treatment.regression_rate > baseline.regression_rate) {
    reasons.push('regression_rate increased');
  }
  if (reasons.length > 0) {
    return gateDecision(ruleId, baseline, treatment, 'reject', reasons);
  }

  if (treatment.verified_success_rate > baseline.verified_success_rate) {
    return gateDecision(ruleId, baseline, treatment, 'accept', ['verified_success_rate improved']);
  }
  if (
    treatment.verified_success_rate === baseline.verified_success_rate &&
    treatment.token_cost < baseline.token_cost
  ) {
    return gateDecision(ruleId, baseline, treatment, 'accept', ['success unchanged and token_cost improved']);
  }

  return gateDecision(ruleId, baseline, treatment, 'reject', ['no success or cost improvement']);
}

export function renderEvalReportMarkdown(report: EvalReport): string {
  const lines = [
    '# LYO Eval Report',
    '',
    `Task split hash: \`${report.task_split_hash}\``,
    '',
    '| Baseline | Episodes | Verified Success | 95% Interval | False Gate | Regression | Token Cost | Context Overhead | Rule Apps | Avg Wall Time |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const summary of report.baseline_scores) {
    lines.push(
      `| ${summary.baseline_id} | ${summary.episodes} | ${pct(summary.verified_success_rate)} | ` +
      `${pct(summary.verified_success_interval[0])}-${pct(summary.verified_success_interval[1])} | ` +
      `${pct(summary.false_gate_rate)} | ${pct(summary.regression_rate)} | ${summary.token_cost} | ` +
      `${summary.context_overhead_tokens} | ${summary.rule_applications} | ${summary.avg_wall_time_ms}ms |`
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
  const successes = episodes.filter((episode) => episode.outcome.verified_success).length;
  const falseGates = episodes.filter((episode) => episode.false_gate === true).length;
  const regressions = episodes.filter((episode) => episode.regression === true).length;
  return {
    baseline_id: baselineId,
    episodes: episodes.length,
    verified_success_rate: rate(successes, episodes.length),
    verified_success_interval: wilson(successes, episodes.length),
    false_gate_rate: rate(falseGates, episodes.length),
    regression_rate: rate(regressions, episodes.length),
    token_cost: sum(episodes, (episode) => episode.token_usage?.total_tokens ?? 0),
    context_overhead_tokens: sum(episodes, (episode) => episode.context_overhead_tokens ?? 0),
    avg_wall_time_ms: Math.round(sum(episodes, (episode) => episode.wall_time_ms) / Math.max(1, episodes.length)),
    rule_applications: sum(episodes, (episode) => episode.injected_context.rule_gates.length),
  };
}

function worstRegressions(episodes: EvalEpisodeResult[]): WorstRegression[] {
  return (episodes as EpisodeWithOptionalMetrics[])
    .filter((episode) => episode.regression === true || !episode.outcome.verified_success)
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
  decision: 'accept' | 'reject',
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
  const ids = episodes.map((episode) => `${episode.baseline_id}:${episode.task_id}`).sort();
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

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
