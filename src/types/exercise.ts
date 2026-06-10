export type ExerciseAttemptStatus =
  | 'started'
  | 'working'
  | 'failed'
  | 'passed'
  | 'claimed_without_pass'
  | 'blocked';

export type ExerciseFailureClass =
  | 'compile_error'
  | 'test_failure'
  | 'assertion_failure'
  | 'segfault'
  | 'timeout'
  | 'command_not_found'
  | 'unknown_failure';

export interface ExerciseManifest {
  exerciseId: string;
  track: string;
  language: string;
  stage: string;
  verifierCommands: string[];
}

export interface ExerciseAttemptRecord {
  attemptId: string;
  exerciseId: string;
  runId: string;
  track: string;
  language: string;
  stage: string;
  status: ExerciseAttemptStatus;
  score: number;
  lastFailureClass: ExerciseFailureClass | null;
}

export interface EnsureExerciseAttemptInput {
  attemptId?: string;
  exerciseId: string;
  runId: string;
  track: string;
  language: string;
  stage: string;
  verifierCommands?: string[];
  evidenceRef: string;
}

export interface RecordExerciseWorkerActionInput {
  attemptId: string;
  summary: string;
  evidenceRef: string;
  payload?: unknown;
}

export interface RecordExerciseVerifierResultInput {
  attemptId: string;
  passed: boolean;
  failureClass: ExerciseFailureClass | null;
  summary: string;
  evidenceRef: string;
  payload?: unknown;
}

export interface RecordExerciseAssistantClaimInput {
  attemptId: string;
  summary: string;
  evidenceRef: string;
  payload?: unknown;
}

export interface ExerciseAttemptsInput {
  exerciseId?: string;
  runId?: string;
  limit?: number;
}

export interface ExerciseView {
  attempts: ExerciseAttemptRecord[];
  summary: {
    attempts: number;
    passed: number;
    failed: number;
    claimedWithoutPass: number;
    totalScore: number;
  };
}
