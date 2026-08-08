/**
 * Types for the LYO lesson store. Extracted from lesson-store.ts.
 */

import type { SelectionCandidate, SelectionPolicyRef } from '../selection/selection-policies.ts';

export interface LessonRow {
  lesson_id: string;
  status: string;
  failure_class: string;
  trigger_cue: string;
  explanation: string;
  intervention: string;
  helpful_count: number;
  harmful_count: number;
  uses: number;
  created_at: string;
  updated_at: string;
  provenance: string;
  reflector_policy: string | null;
  reflector_model: string | null;
  executor_model: string | null;
}

export interface DeltaRow {
  delta_id: number;
  lesson_id: string;
  run_id: string | null;
  ts: string;
  actor: string;
  delta_type: string;
  payload: string;
}

export interface ApplicationRow {
  application_id: string;
  lesson_id: string;
  run_id: string;
  trigger_message_id: string | null;
  task_cue: string | null;
  sampled_score: number | null;
  outcome: string;
  counted: number;
  decision_id: string | null;
}

export interface DecisionRow {
  decision_id: string;
  run_id: string;
  trigger_message_id: string | null;
  cycle_index: number | null;
  failure_class: string;
  task_cue: string | null;
  candidates: string;
  selected: string;
  null_arm: number;
  context: string;
  created_at: string;
  policy: string;
}

export interface PairStatsRow {
  executor_model: string;
  reflector_policy: string;
  reflector_model: string;
  lessons: number;
  helpful: number;
  harmful: number;
  promoted: number;
  quarantined: number;
  pair_posterior_mean: number;
}

export interface LibraryRow {
  lesson_id: string;
  failure_class: string;
  trigger_cue: string;
  explanation: string;
  intervention: string;
  helpful_count: number;
  harmful_count: number;
  uses: number;
  posterior_mean: number;
}

export interface TraceRow {
  trace_id: string;
  run_id: string | null;
  kind: string;
  summary: string;
  ref: string | null;
  payload_json: string | null;
  created_at: string;
}

export interface PreferencePairRow {
  preference_id: string;
  context_hash: string;
  chosen_trace_id: string;
  rejected_trace_id: string;
  reason: string;
  evidence_ref: string;
  recorded_by: string | null;
  confidence: string;
  created_at: string;
}

export interface DecisionCandidate extends SelectionCandidate {
  propensity: number;
}

export type SelectedLesson = LibraryRow & { sampled_score: number | null };

export interface SelectWithDecisionResult {
  selected: SelectedLesson[];
  candidates: DecisionCandidate[];
  null_arm: number;
  policy: string;
}

export interface CreateLessonInput {
  failure_class: string;
  trigger_cue: string;
  explanation?: string;
  intervention?: string;
  run_id?: string | null;
  actor?: string;
  reflector?: string | null;
  reflector_model?: string | null;
  executor_model?: string | null;
}

export interface SelectLessonsInput {
  failure_class: string;
  limit?: number;
  rng?: () => number;
}

export interface SelectWithDecisionInput extends SelectLessonsInput {
  propensityReplicates?: number;
  policy?: SelectionPolicyRef;
}

export interface RecordApplicationInput {
  lesson_id: string;
  run_id: string;
  trigger_message_id?: string | null;
  task_cue?: string | null;
  sampled_score?: number | null;
  decision_id?: string | null;
}

export interface RecordDecisionInput {
  run_id: string;
  trigger_message_id?: string | null;
  cycle_index?: number | null;
  failure_class: string;
  task_cue?: string | null;
  candidates: unknown;
  selected: unknown;
  null_arm?: number;
  context?: unknown;
  policy?: string | null;
}

export interface RecordTraceInput {
  trace_id?: string;
  run_id?: string | null;
  kind: string;
  summary: string;
  ref?: string | null;
  payload?: unknown;
}

export interface RecordPreferencePairInput {
  chosen_trace_id: string;
  rejected_trace_id: string;
  reason: string;
  evidence_ref: string;
  confidence?: string;
  recorded_by?: string | null;
  context?: string;
  context_hash?: string;
  preference_id?: string;
}

export interface ReplayState {
  lesson_id: string;
  status: string;
  failure_class: string;
  trigger_cue: string;
  explanation: string;
  intervention: string;
  helpful_count: number;
  harmful_count: number;
  created_at: string;
  updated_at: string;
  provenance: string[];
}
