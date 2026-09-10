import type { EvalBaselineId } from './live-runner.ts';

export interface EvalReport {
  version: 'lyo/eval-report/v2';
  task_split_hash: string;
  baseline_scores: EvalBaselineSummary[];
  worst_regressions: WorstRegression[];
  gate: RuleGateDecision | null;
}

export interface EvalBaselineSummary {
  baseline_id: EvalBaselineId;
  episodes: number;
  known_outcomes: number;
  unknown_outcomes: number;
  verified_success_rate: number | null;
  verified_success_interval: [number, number] | null;
  false_gate_rate: number | null;
  regression_rate: number | null;
  token_cost: number | null;
  context_overhead_tokens: number | null;
  avg_wall_time_ms: number;
  rule_applications: number;
}

export interface RuleGateDecision {
  rule_id: string;
  baseline_id: EvalBaselineId;
  treatment_id: EvalBaselineId;
  decision: 'accept' | 'reject' | 'inconclusive';
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
