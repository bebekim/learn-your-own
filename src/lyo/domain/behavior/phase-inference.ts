import type {
  BehaviorPhase,
  CommandClassification,
  PathActivationKind,
} from '../types/activation.ts';

const CLASSIFICATION_PHASE: Record<CommandClassification, BehaviorPhase> = {
  test: 'validate',
  build: 'validate',
  lint: 'validate',
  format: 'validate',
  inspect: 'explore',
  deploy: 'unknown',
  database: 'unknown',
  cloud: 'unknown',
  package: 'unknown',
  git: 'unknown',
  local_dev: 'unknown',
  unknown: 'unknown',
};

const ACTIVATION_KIND_PHASE: Record<PathActivationKind, BehaviorPhase> = {
  file_read: 'explore',
  directory_listed: 'explore',
  file_written: 'fix',
  file_created: 'fix',
  file_deleted: 'fix',
  file_diffed: 'fix',
  unknown: 'unknown',
};

export function inferPhaseFromClassification(classification: CommandClassification): BehaviorPhase {
  return CLASSIFICATION_PHASE[classification] ?? 'unknown';
}

export function inferPhaseFromActivationKind(kind: PathActivationKind): BehaviorPhase {
  return ACTIVATION_KIND_PHASE[kind] ?? 'unknown';
}
