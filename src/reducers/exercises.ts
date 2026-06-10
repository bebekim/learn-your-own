import type { LearningKernel } from '../ledger.ts';
import {
  requiredRow,
} from '../db/rows.ts';
import type {
  EnsureExerciseAttemptInput,
  ExerciseAttemptRecord,
  ExerciseAttemptsInput,
  ExerciseView,
  RecordExerciseAssistantClaimInput,
  RecordExerciseVerifierResultInput,
  RecordExerciseWorkerActionInput,
} from '../types/exercise.ts';
import type { RecordRunTapeCellInput } from '../types/tape.ts';
import { getRunTapeView, recordRunTapeCell } from './tape.ts';
import {
  ISO_NOW,
  requireFields,
  sha256,
} from './shared.ts';

export function ensureExerciseAttempt(
  kernel: LearningKernel,
  input: EnsureExerciseAttemptInput
): ExerciseAttemptRecord {
  requireFields(input, ['exerciseId', 'runId', 'track', 'language', 'stage', 'evidenceRef']);
  ensureExerciseRun(kernel, input);
  const attemptId = input.attemptId ?? exerciseAttemptId(input.exerciseId, input.runId);
  kernel.db.prepare(`
    insert into exercise_attempts (
      attempt_id, exercise_id, run_id, track, language, stage, status,
      score, last_failure_class, started_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, 'started', 0, null, ?, ?)
    on conflict(attempt_id) do update set
      exercise_id = excluded.exercise_id,
      run_id = excluded.run_id,
      track = excluded.track,
      language = excluded.language,
      stage = excluded.stage,
      updated_at = excluded.updated_at
  `).run(
    attemptId,
    input.exerciseId,
    input.runId,
    input.track,
    input.language,
    input.stage,
    ISO_NOW(),
    ISO_NOW()
  );
  initializeExerciseTape(kernel, {
    attemptId,
    runId: input.runId,
    exerciseId: input.exerciseId,
    track: input.track,
    language: input.language,
    stage: input.stage,
    verifierCommands: input.verifierCommands ?? [],
    evidenceRef: input.evidenceRef,
  });
  return getExerciseAttempt(kernel, attemptId);
}

export function recordExerciseWorkerAction(
  kernel: LearningKernel,
  input: RecordExerciseWorkerActionInput
): ExerciseAttemptRecord {
  requireFields(input, ['attemptId', 'summary', 'evidenceRef']);
  const attempt = getExerciseAttempt(kernel, input.attemptId);
  const appended = appendTapeIfLegal(kernel, attempt.runId, {
    kind: 'worker_action',
    summary: input.summary,
    evidenceRef: input.evidenceRef,
    payload: input.payload,
  });
  if (appended) {
    addScore(kernel, input.attemptId, 1, 'working');
  }
  return getExerciseAttempt(kernel, input.attemptId);
}

export function recordExerciseVerifierResult(
  kernel: LearningKernel,
  input: RecordExerciseVerifierResultInput
): ExerciseAttemptRecord {
  requireFields(input, ['attemptId', 'summary', 'evidenceRef']);
  const attempt = getExerciseAttempt(kernel, input.attemptId);
  const appended = appendTapeIfLegal(kernel, attempt.runId, {
    kind: 'verifier_result',
    summary: input.summary,
    evidenceRef: input.evidenceRef,
    passed: input.passed,
    payload: input.payload,
  });
  if (!appended) return attempt;

  if (input.passed) {
    appendTapeIfLegal(kernel, attempt.runId, {
      kind: 'outcome_completed',
      summary: `Exercise ${attempt.exerciseId} verifier passed.`,
      evidenceRef: `exercise:${input.attemptId}:passed`,
      payload: input.payload,
    });
    addScore(kernel, input.attemptId, 5, 'passed');
    return getExerciseAttempt(kernel, input.attemptId);
  }

  const failureClass = input.failureClass ?? 'unknown_failure';
  appendTapeIfLegal(kernel, attempt.runId, {
    kind: 'gap',
    summary: `Verifier failed with ${failureClass}.`,
    evidenceRef: `exercise:${input.attemptId}:failure:${failureClass}`,
    payload: {
      failureClass,
      evidenceRef: input.evidenceRef,
    },
  });
  addScore(kernel, input.attemptId, 2, 'failed', failureClass);
  return getExerciseAttempt(kernel, input.attemptId);
}

export function recordExerciseAssistantClaim(
  kernel: LearningKernel,
  input: RecordExerciseAssistantClaimInput
): ExerciseAttemptRecord {
  requireFields(input, ['attemptId', 'summary', 'evidenceRef']);
  const attempt = getExerciseAttempt(kernel, input.attemptId);
  if (attempt.status === 'passed') return attempt;
  const appended = appendTapeIfLegal(kernel, attempt.runId, {
    kind: 'assistant_claim',
    summary: input.summary,
    evidenceRef: input.evidenceRef,
    payload: input.payload,
  });
  if (appended) {
    addScore(kernel, input.attemptId, -3, 'claimed_without_pass');
  }
  return getExerciseAttempt(kernel, input.attemptId);
}

export function getExerciseAttempt(kernel: LearningKernel, attemptId: string): ExerciseAttemptRecord {
  return requiredRow<ExerciseAttemptRecord>(kernel.db.prepare(`
    select
      attempt_id as attemptId,
      exercise_id as exerciseId,
      run_id as runId,
      track,
      language,
      stage,
      status,
      score,
      last_failure_class as lastFailureClass
    from exercise_attempts
    where attempt_id = ?
  `).get(attemptId), `unknown exercise attempt: ${attemptId}`);
}

export function getExerciseAttempts(
  kernel: LearningKernel,
  input: ExerciseAttemptsInput = {}
): ExerciseAttemptRecord[] {
  const limit = input.limit ?? 50;
  if (input.exerciseId && input.runId) {
    return exerciseAttemptRows(kernel, `
      where exercise_id = ? and run_id = ?
      order by updated_at desc
      limit ?
    `, [input.exerciseId, input.runId, limit]);
  }
  if (input.exerciseId) {
    return exerciseAttemptRows(kernel, `
      where exercise_id = ?
      order by updated_at desc
      limit ?
    `, [input.exerciseId, limit]);
  }
  if (input.runId) {
    return exerciseAttemptRows(kernel, `
      where run_id = ?
      order by updated_at desc
      limit ?
    `, [input.runId, limit]);
  }
  return exerciseAttemptRows(kernel, `
    order by updated_at desc
    limit ?
  `, [limit]);
}

export function getExerciseView(kernel: LearningKernel, input: ExerciseAttemptsInput = {}): ExerciseView {
  const attempts = getExerciseAttempts(kernel, input);
  return {
    attempts,
    summary: {
      attempts: attempts.length,
      passed: attempts.filter((attempt) => attempt.status === 'passed').length,
      failed: attempts.filter((attempt) => attempt.status === 'failed').length,
      claimedWithoutPass: attempts.filter((attempt) => attempt.status === 'claimed_without_pass').length,
      totalScore: attempts.reduce((sum, attempt) => sum + attempt.score, 0),
    },
  };
}

function ensureExerciseRun(kernel: LearningKernel, input: EnsureExerciseAttemptInput): void {
  kernel.db.prepare(`
    insert into runs (run_id, task_shape, channel, status, token_cost, created_at)
    values (?, ?, ?, 'started', 0, ?)
    on conflict(run_id) do nothing
  `).run(
    input.runId,
    `exercise:${input.track}:${input.stage}`,
    `exercise.${input.language}`,
    ISO_NOW()
  );
}

function initializeExerciseTape(
  kernel: LearningKernel,
  input: EnsureExerciseAttemptInput & { attemptId: string; verifierCommands: string[] }
): void {
  const view = getRunTapeView(kernel, { runId: input.runId });
  if (view.cells.length > 0) return;
  recordRunTapeCell(kernel, {
    runId: input.runId,
    kind: 'run_goal',
    summary: `${input.track}/${input.language}/${input.stage}: ${input.exerciseId}`,
    evidenceRef: input.evidenceRef,
    payload: {
      attemptId: input.attemptId,
      exerciseId: input.exerciseId,
      track: input.track,
      language: input.language,
      stage: input.stage,
    },
  });
  recordRunTapeCell(kernel, {
    runId: input.runId,
    kind: 'verifier_spec',
    summary: verifierSummary(input.verifierCommands),
    evidenceRef: `exercise:${input.attemptId}:verifier`,
    payload: {
      verifierCommands: input.verifierCommands,
    },
  });
}

function appendTapeIfLegal(
  kernel: LearningKernel,
  runId: string,
  input: Omit<RecordRunTapeCellInput, 'runId'>
): boolean {
  const view = getRunTapeView(kernel, { runId });
  if (!view.legalNextKinds.includes(input.kind)) return false;
  recordRunTapeCell(kernel, {
    runId,
    ...input,
  });
  return true;
}

function addScore(
  kernel: LearningKernel,
  attemptId: string,
  delta: number,
  status: ExerciseAttemptRecord['status'],
  failureClass?: ExerciseAttemptRecord['lastFailureClass']
): void {
  kernel.db.prepare(`
    update exercise_attempts
    set score = score + ?,
      status = ?,
      last_failure_class = coalesce(?, last_failure_class),
      updated_at = ?
    where attempt_id = ?
  `).run(delta, status, failureClass ?? null, ISO_NOW(), attemptId);
}

function exerciseAttemptRows(
  kernel: LearningKernel,
  suffix: string,
  values: (string | number)[]
): ExerciseAttemptRecord[] {
  return (kernel.db.prepare(`
    select
      attempt_id as attemptId,
      exercise_id as exerciseId,
      run_id as runId,
      track,
      language,
      stage,
      status,
      score,
      last_failure_class as lastFailureClass
    from exercise_attempts
    ${suffix}
  `).all(...values) as unknown as ExerciseAttemptRecord[]);
}

function verifierSummary(commands: string[]): string {
  if (commands.length === 0) return 'Run the exercise verifier until it passes.';
  if (commands.length === 1) return `Verifier command must pass: ${commands[0]}`;
  return `Verifier commands must pass: ${commands.join('; ')}`;
}

function exerciseAttemptId(exerciseId: string, runId: string): string {
  return `exercise-${sha256(`${exerciseId}:${runId}`).slice(0, 20)}`;
}
