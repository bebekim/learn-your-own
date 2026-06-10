import { createHash } from 'node:crypto';
import {
  findConflicts,
  foldTrace,
  hasApprovalFriction,
  hasDebugging,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  hasVerifiedCompletion,
  isEditAction,
  isExternalAction,
  isInspectAction,
  isTestAction,
} from './semantics.ts';
import type {
  NormalizedAction,
  ResourceRef,
  RunTelemetryAst,
} from './syntax.ts';

export const EFFECT_REPORT_VERSION = 'lyo/effect/v1';

export interface EffectReport {
  effectVersion: typeof EFFECT_REPORT_VERSION;
  effectSignature: string;
  runId: string;
  actionCount: number;
  summary: {
    reads: ResourceRef[];
    writes: ResourceRef[];
    executedCommands: string[];
    evidenceLength: number;
    evidencePreview: string[];
  };
  counts: {
    inspect: number;
    edit: number;
    test: number;
    external: number;
    unknown: number;
  };
  predicates: {
    verifiedCompletion: boolean;
    debugging: boolean;
    approvalFriction: boolean;
    unsafeWrite: boolean;
    stoppedAfterEditWithoutVerification: boolean;
  };
  resourceConflicts: ResourceConflictReport[];
  temporalFindings: TemporalFinding[];
}

export interface ResourceConflictReport {
  actionA: string;
  actionB: string;
  evidenceA: string;
  evidenceB: string;
  reason: string;
}

export interface TemporalFinding {
  kind:
    | 'debugging_after_failed_verification'
    | 'approval_friction'
    | 'unsafe_write'
    | 'unverified_local_mutation';
  message: string;
}

export function buildEffectReport(ast: RunTelemetryAst): EffectReport {
  const effect = foldTrace(ast.actions);
  const predicates = {
    verifiedCompletion: hasVerifiedCompletion(ast.actions),
    debugging: hasDebugging(ast.actions),
    approvalFriction: hasApprovalFriction(ast.actions),
    unsafeWrite: hasUnsafeWrite(ast.actions),
    stoppedAfterEditWithoutVerification: hasStoppedAfterEditWithoutVerification(ast.actions),
  };
  const counts = countActionKinds(ast.actions);
  const summary = {
    reads: effect.reads,
    writes: effect.writes,
    executedCommands: effect.executedCommands,
    evidenceLength: effect.evidenceRefs.length,
    evidencePreview: effect.evidenceRefs.slice(0, 10),
  };

  return {
    effectVersion: EFFECT_REPORT_VERSION,
    effectSignature: effectSignature({
      effectVersion: EFFECT_REPORT_VERSION,
      summary,
    }),
    runId: ast.runId,
    actionCount: ast.actions.length,
    summary,
    counts,
    predicates,
    resourceConflicts: resourceConflicts(ast.actions),
    temporalFindings: temporalFindings(ast.actions, predicates),
  };
}

function countActionKinds(actions: NormalizedAction[]): EffectReport['counts'] {
  const counts = {
    inspect: 0,
    edit: 0,
    test: 0,
    external: 0,
    unknown: 0,
  };

  for (const action of actions) {
    const matched = [
      isInspectAction(action),
      isEditAction(action),
      isTestAction(action),
      isExternalAction(action),
    ];
    if (matched[0]) counts.inspect += 1;
    if (matched[1]) counts.edit += 1;
    if (matched[2]) counts.test += 1;
    if (matched[3]) counts.external += 1;
    if (!matched.some(Boolean) && action.eventKind !== 'boundary') counts.unknown += 1;
  }

  return counts;
}

function resourceConflicts(actions: NormalizedAction[]): ResourceConflictReport[] {
  return findConflicts(actions).map(({ left, right }) => ({
    actionA: actionLabel(left),
    actionB: actionLabel(right),
    evidenceA: left.provenance.evidenceRef,
    evidenceB: right.provenance.evidenceRef,
    reason: conflictReason(left, right),
  }));
}

function temporalFindings(
  actions: NormalizedAction[],
  predicates: EffectReport['predicates']
): TemporalFinding[] {
  const findings: TemporalFinding[] = [];

  if (predicates.debugging) {
    findings.push({
      kind: 'debugging_after_failed_verification',
      message: 'A failed verifier was followed by inspection or editing.',
    });
  }

  if (predicates.approvalFriction) {
    findings.push({
      kind: 'approval_friction',
      message: 'An approval event or denied action appeared in the trace.',
    });
  }

  if (predicates.unsafeWrite) {
    findings.push({
      kind: 'unsafe_write',
      message: 'A destructive or external-write mutation appeared in the trace.',
    });
  }

  if (predicates.stoppedAfterEditWithoutVerification) {
    findings.push({
      kind: 'unverified_local_mutation',
      message: 'A local mutation appeared without a later successful verifier.',
    });
  }

  return findings;
}

function conflictReason(left: NormalizedAction, right: NormalizedAction): string {
  if (hasExternalEffect(left) || hasExternalEffect(right)) {
    return 'external_side_effect';
  }

  const overlapping = overlappingWriteResources(left, right);
  if (overlapping.length > 0) {
    return `write_overlap:${overlapping.join(',')}`;
  }

  return 'resource_dependency';
}

function overlappingWriteResources(left: NormalizedAction, right: NormalizedAction): string[] {
  const leftWrites = new Set(left.resources.written.map(resourceKey));
  const rightWrites = new Set(right.resources.written.map(resourceKey));
  const leftTouched = new Set([
    ...left.resources.read,
    ...left.resources.written,
  ].map(resourceKey));
  const rightTouched = new Set([
    ...right.resources.read,
    ...right.resources.written,
  ].map(resourceKey));
  const overlaps: string[] = [];

  for (const key of leftWrites) {
    if (rightTouched.has(key)) overlaps.push(key);
  }
  for (const key of rightWrites) {
    if (leftTouched.has(key)) overlaps.push(key);
  }

  return Array.from(new Set(overlaps)).sort();
}

function hasExternalEffect(action: NormalizedAction): boolean {
  return isExternalAction(action)
    || action.facets.includes('external')
    || action.facets.includes('deploy')
    || action.risk === 'deploy'
    || action.risk === 'external_write';
}

function actionLabel(action: NormalizedAction): string {
  if (action.command) return action.command.argvSummary;
  if (isEditAction(action)) return `edit ${action.resources.written.map(resourceKey).join(',')}`;
  if (isInspectAction(action)) return `inspect ${action.resources.read.map(resourceKey).join(',')}`;
  return `${action.eventKind}:${action.operation}`;
}

function resourceKey(resource: ResourceRef): string {
  return `${resource.type}:${resource.ref}`;
}

function effectSignature(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
