import { readFileSync } from 'node:fs';

import { LessonStore } from '../lyo/lesson-store.ts';
import type {
  DecisionCandidate,
  LessonRow,
  SelectedLesson,
} from '../lyo/lesson-store.ts';

export interface ReplayCandidateLesson {
  failure_class: string;
  trigger_cue: string;
  explanation: string;
  intervention: string;
}

export interface ReplayTrace {
  run_id: string;
  failure_class: string;
  trigger_message_id: string;
  task_cue: string;
  outcome: 'passed' | 'failed';
  candidate_lessons: ReplayCandidateLesson[];
}

export interface ReplayTraceReport {
  runId: string;
  failureClass: string;
  taskCue: string;
  outcome: 'passed' | 'failed';
  createdLessonIds: string[];
  selected: ReplaySelectedLesson[];
  candidates: DecisionCandidate[];
  decisionId: string | null;
  outcomeUpdate: {
    updated: number;
    lessons: string[];
  };
  lessons: ReplayLessonState[];
}

export interface ReplaySelectedLesson {
  lessonId: string;
  triggerCue: string;
  sampledScore: number | null;
}

export interface ReplayLessonState {
  lessonId: string;
  status: string;
  helpfulCount: number;
  harmfulCount: number;
}

export function readReplayTrace(path: string): ReplayTrace {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return validateReplayTrace(parsed);
}

export function replayTrace(
  store: LessonStore,
  trace: ReplayTrace,
  options: {
    seed?: number;
    limit?: number;
  } = {}
): ReplayTraceReport {
  const created = trace.candidate_lessons.map((lesson) =>
    store.createLesson({
      ...lesson,
      run_id: trace.run_id,
      actor: 'eval-replay',
    })
  ).filter((lesson): lesson is LessonRow => lesson !== null);

  const selection = store.selectWithDecision({
    failure_class: trace.failure_class,
    limit: options.limit ?? 2,
    rng: seededRng(options.seed ?? 1),
    propensityReplicates: 0,
  });
  const decision = store.recordDecision({
    run_id: trace.run_id,
    trigger_message_id: trace.trigger_message_id,
    failure_class: trace.failure_class,
    task_cue: trace.task_cue,
    candidates: selection.candidates,
    selected: selection.selected,
    null_arm: selection.null_arm,
    policy: selection.policy,
    context: {
      source: 'eval/offline-replay',
    },
  });

  for (const lesson of selection.selected) {
    store.recordApplication({
      lesson_id: lesson.lesson_id,
      run_id: trace.run_id,
      trigger_message_id: trace.trigger_message_id,
      task_cue: trace.task_cue,
      sampled_score: lesson.sampled_score,
      decision_id: decision?.decision_id ?? null,
    });
  }

  const update = store.applyValidationOutcome({
    run_id: trace.run_id,
    outcome: trace.outcome,
  });

  return {
    runId: trace.run_id,
    failureClass: trace.failure_class,
    taskCue: trace.task_cue,
    outcome: trace.outcome,
    createdLessonIds: created.map((lesson) => lesson.lesson_id),
    selected: selection.selected.map(toReplaySelection),
    candidates: selection.candidates,
    decisionId: decision?.decision_id ?? null,
    outcomeUpdate: {
      updated: update.updated,
      lessons: update.lessons,
    },
    lessons: created.map((lesson) => toReplayLessonState(store.getLesson(lesson.lesson_id) ?? lesson)),
  };
}

function toReplaySelection(lesson: SelectedLesson): ReplaySelectedLesson {
  return {
    lessonId: lesson.lesson_id,
    triggerCue: lesson.trigger_cue,
    sampledScore: lesson.sampled_score,
  };
}

function toReplayLessonState(lesson: LessonRow): ReplayLessonState {
  return {
    lessonId: lesson.lesson_id,
    status: lesson.status,
    helpfulCount: lesson.helpful_count,
    harmfulCount: lesson.harmful_count,
  };
}

function validateReplayTrace(value: unknown): ReplayTrace {
  if (!isObject(value)) throw new Error('replay trace must be a JSON object');
  const errors: string[] = [];
  const trace: ReplayTrace = {
    run_id: stringField(value, 'run_id', errors),
    failure_class: stringField(value, 'failure_class', errors),
    trigger_message_id: stringField(value, 'trigger_message_id', errors),
    task_cue: stringField(value, 'task_cue', errors),
    outcome: outcomeField(value, errors),
    candidate_lessons: candidateLessonsField(value, errors),
  };
  if (errors.length > 0) {
    throw new Error(`invalid replay trace:\n- ${errors.join('\n- ')}`);
  }
  return trace;
}

function candidateLessonsField(value: Record<string, unknown>, errors: string[]): ReplayCandidateLesson[] {
  const raw = value.candidate_lessons;
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push('candidate_lessons must be a non-empty array');
    return [];
  }
  return raw.map((item, index) => {
    if (!isObject(item)) {
      errors.push(`candidate_lessons[${index}] must be an object`);
      return { failure_class: '', trigger_cue: '', explanation: '', intervention: '' };
    }
    return {
      failure_class: stringField(item, 'failure_class', errors, `candidate_lessons[${index}].failure_class`),
      trigger_cue: stringField(item, 'trigger_cue', errors, `candidate_lessons[${index}].trigger_cue`),
      explanation: stringField(item, 'explanation', errors, `candidate_lessons[${index}].explanation`),
      intervention: stringField(item, 'intervention', errors, `candidate_lessons[${index}].intervention`),
    };
  });
}

function outcomeField(value: Record<string, unknown>, errors: string[]): 'passed' | 'failed' {
  if (value.outcome === 'passed' || value.outcome === 'failed') return value.outcome;
  errors.push('outcome must be passed or failed');
  return 'failed';
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  errors: string[],
  label = key
): string {
  const raw = value[key];
  if (typeof raw === 'string' && raw.length > 0) return raw;
  errors.push(`${label} must be a non-empty string`);
  return '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
