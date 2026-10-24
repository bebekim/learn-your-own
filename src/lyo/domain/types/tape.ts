export type RunTapeCellKind =
  | 'run_goal'
  | 'verifier_spec'
  | 'worker_action'
  | 'assistant_claim'
  | 'verifier_result'
  | 'gap'
  | 'outcome_completed'
  | 'blocked';

export type RunTapeState =
  | 'empty'
  | 'goal_declared'
  | 'verifier_specified'
  | 'working'
  | 'claimed_completion'
  | 'verifying'
  | 'revising'
  | 'completed'
  | 'blocked';

export interface RecordRunTapeCellInput {
  cellId?: string;
  runId: string;
  kind: RunTapeCellKind;
  summary: string;
  evidenceRef: string;
  passed?: boolean | null;
  payload?: unknown;
}

export interface RunTapeCellRecord {
  cellId: string;
  runId: string;
  cellIndex: number;
  kind: RunTapeCellKind;
  summary: string;
  evidenceRef: string;
  passed: boolean | null;
  stateBefore: RunTapeState;
  stateAfter: RunTapeState;
  payload: unknown | null;
}

export interface GetRunTapeViewInput {
  runId: string;
}

export interface RunTapeView {
  runId: string;
  state: RunTapeState;
  leftSpan: RunTapeCellKind[];
  scan: RunTapeCellRecord | null;
  rightSpan: RunTapeCellKind[];
  legalNextKinds: RunTapeCellKind[];
  cells: RunTapeCellRecord[];
}
