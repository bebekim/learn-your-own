import type {
  ActivationConfidence,
  CommandClassification,
  CommandStatus,
  JobStatus,
  PathActivationKind,
} from '../types/activation.ts';
import type { ModelCallStatus } from '../types/core.ts';
import type { RunTapeCellKind } from '../types/tape.ts';

const ASSOCIATION_OUTCOMES = ['positive', 'negative'] as const;
const MODEL_CALL_STATUSES = ['started', 'failed'] as const;
const JOB_STATUSES = ['started', 'completed', 'failed', 'cancelled', 'unknown'] as const;
const PATH_ACTIVATION_KINDS = [
  'file_read',
  'file_written',
  'file_created',
  'file_deleted',
  'file_diffed',
  'directory_listed',
] as const;
const ACTIVATION_CONFIDENCES = ['low', 'high'] as const;
const COMMAND_CLASSIFICATIONS = [
  'test',
  'build',
  'lint',
  'format',
  'deploy',
  'database',
  'cloud',
  'package',
  'git',
  'inspect',
  'local_dev',
  'unknown',
] as const;
const COMMAND_STATUSES = ['planned', 'succeeded', 'failed', 'unknown'] as const;
const DEPLOYMENT_STATUSES = ['succeeded', 'failed', 'unknown'] as const;
const RUN_TAPE_CELL_KINDS = [
  'run_goal',
  'verifier_spec',
  'worker_action',
  'assistant_claim',
  'verifier_result',
  'gap',
  'outcome_completed',
  'blocked',
] as const;

export function normalizeOutcome(value: string | undefined): 'positive' | 'negative' | 'unknown' {
  return oneOf(value, ASSOCIATION_OUTCOMES) ?? 'unknown';
}

export function modelCallStatus(value: string | undefined): ModelCallStatus {
  return oneOf(value, MODEL_CALL_STATUSES) ?? 'completed';
}

export function jobStatus(value: string | undefined, fallback: JobStatus): JobStatus {
  return oneOf(value, JOB_STATUSES) ?? fallback;
}

export function pathActivationKind(value: string | undefined): PathActivationKind {
  return oneOf(value, PATH_ACTIVATION_KINDS) ?? 'unknown';
}

export function activationConfidence(value: string | undefined): ActivationConfidence {
  return oneOf(value, ACTIVATION_CONFIDENCES) ?? 'medium';
}

export function commandClassification(value: string | undefined): CommandClassification | undefined {
  return oneOf(value, COMMAND_CLASSIFICATIONS);
}

export function commandStatus(value: string | undefined): CommandStatus {
  return oneOf(value, COMMAND_STATUSES) ?? 'attempted';
}

export function deploymentStatus(value: string | undefined): 'attempted' | 'succeeded' | 'failed' | 'unknown' {
  return oneOf(value, DEPLOYMENT_STATUSES) ?? 'attempted';
}

export function runTapeCellKind(value: string | undefined): RunTapeCellKind {
  const kind = oneOf(value, RUN_TAPE_CELL_KINDS);
  if (!kind) throw new Error(`unsupported tape cell kind: ${value ?? ''}`);
  return kind;
}

function oneOf<const T extends readonly string[]>(
  value: string | undefined,
  allowed: T
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? value as T[number] : undefined;
}
