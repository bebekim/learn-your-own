import type { NormalizedAction, ResourceRef, TokenProvenance } from './syntax.ts';

export type PolicyRiskClass =
  | 'local_test'
  | 'local_edit'
  | 'external_deploy'
  | 'destructive'
  | 'unknown';

export type PolicyDecision = 'allowed' | 'denied' | 'attempted';

export interface VerifierCandidate {
  command: string;
  provenance: TokenProvenance;
  scopePaths: string[];
}

export interface MilestoneCandidate {
  name: string;
  provenance: TokenProvenance;
  associatedPaths: string[];
  failedAttempts: number;
}

export interface PolicyObservation {
  action: string;
  riskClass: PolicyRiskClass;
  decision: PolicyDecision;
  provenance: TokenProvenance;
}

export interface RiskObservation {
  command: string;
  reason: string;
  provenance: TokenProvenance;
}

export interface SemanticRunAst {
  runId: string;
  verifiers: VerifierCandidate[];
  milestones: MilestoneCandidate[];
  policyObservations: PolicyObservation[];
  riskObservations: RiskObservation[];
}

export interface EffectSummary {
  reads: ResourceRef[];
  writes: ResourceRef[];
  executedCommands: string[];
  evidenceRefs: string[];
}

export interface ActionConflict {
  left: NormalizedAction;
  right: NormalizedAction;
}

export function emptyEffect(): EffectSummary {
  return {
    reads: [],
    writes: [],
    executedCommands: [],
    evidenceRefs: [],
  };
}

export function concatEffects(left: EffectSummary, right: EffectSummary): EffectSummary {
  return {
    reads: unionResources(left.reads, right.reads),
    writes: unionResources(left.writes, right.writes),
    executedCommands: uniqueSorted([
      ...left.executedCommands,
      ...right.executedCommands,
    ]),
    evidenceRefs: [
      ...left.evidenceRefs,
      ...right.evidenceRefs,
    ],
  };
}

export function actionToEffect(action: NormalizedAction): EffectSummary {
  return {
    reads: unionResources(action.resources.read),
    writes: unionResources(action.resources.written),
    executedCommands: action.command ? [action.command.argvSummary] : [],
    evidenceRefs: [action.provenance.evidenceRef],
  };
}

export function foldTrace(trace: NormalizedAction[]): EffectSummary {
  return trace.reduce(
    (effect, action) => concatEffects(effect, actionToEffect(action)),
    emptyEffect()
  );
}

export function areIndependent(left: NormalizedAction, right: NormalizedAction): boolean {
  if (hasExternalSideEffects(left) || hasExternalSideEffects(right)) {
    return false;
  }

  const leftWrites = resourceKeySet(left.resources.written);
  const rightWrites = resourceKeySet(right.resources.written);
  const leftTouched = resourceKeySet([
    ...left.resources.read,
    ...left.resources.written,
  ]);
  const rightTouched = resourceKeySet([
    ...right.resources.read,
    ...right.resources.written,
  ]);

  return !intersects(leftWrites, rightTouched)
    && !intersects(rightWrites, leftTouched);
}

export function areConflicting(left: NormalizedAction, right: NormalizedAction): boolean {
  return !areIndependent(left, right);
}

export function findConflicts(trace: NormalizedAction[]): ActionConflict[] {
  const conflicts: ActionConflict[] = [];
  for (let leftIndex = 0; leftIndex < trace.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < trace.length; rightIndex += 1) {
      const left = trace[leftIndex];
      const right = trace[rightIndex];
      if (areConflicting(left, right)) {
        conflicts.push({ left, right });
      }
    }
  }
  return conflicts;
}

export function hasExternalSideEffects(action: NormalizedAction): boolean {
  return action.operation === 'mutate_external'
    || action.risk === 'external_write'
    || action.risk === 'deploy'
    || action.facets.includes('external')
    || action.facets.includes('cloud')
    || action.facets.includes('deploy')
    || action.resources.read.some(isExternalResource)
    || action.resources.written.some(isExternalResource);
}

export function isInspectAction(action: NormalizedAction): boolean {
  return action.resources.read.length > 0
    && action.resources.written.length === 0
    && action.operation === 'observe';
}

export function isEditAction(action: NormalizedAction): boolean {
  return action.operation === 'mutate_local'
    && action.resources.written.some((resource) => resource.type === 'local_file');
}

export function isTestAction(action: NormalizedAction): boolean {
  return action.intent === 'verify' || action.facets.includes('test');
}

export function isExternalAction(action: NormalizedAction): boolean {
  return action.operation === 'mutate_external'
    || action.resources.read.some(isExternalResource)
    || action.resources.written.some(isExternalResource);
}

export function hasVerifiedCompletion(trace: NormalizedAction[]): boolean {
  const lastEditIndex = findLastIndex(trace, isEditAction);
  if (lastEditIndex === -1) return false;

  return trace
    .slice(lastEditIndex + 1)
    .some((action) => isTestAction(action) && actionSucceeded(action));
}

export function hasDebugging(trace: NormalizedAction[]): boolean {
  let failedVerifierOpen = false;

  for (const action of trace) {
    if (isTestAction(action)) {
      failedVerifierOpen = actionFailed(action);
      continue;
    }

    if (failedVerifierOpen && (isEditAction(action) || isInspectAction(action))) {
      return true;
    }
  }

  return false;
}

export function hasApprovalFriction(trace: NormalizedAction[]): boolean {
  return trace.some((action) => action.eventKind === 'approval' || action.status === 'denied');
}

export function hasUnsafeWrite(trace: NormalizedAction[]): boolean {
  return trace.some((action) => {
    const mutates = action.operation === 'mutate_local' || action.operation === 'mutate_external';
    return mutates && (action.risk === 'destructive' || action.risk === 'external_write');
  });
}

export function hasStoppedAfterEditWithoutVerification(trace: NormalizedAction[]): boolean {
  const lastEditIndex = findLastIndex(trace, isEditAction);
  if (lastEditIndex === -1) return false;
  return !trace.slice(lastEditIndex + 1).some(isTestAction);
}

function unionResources(...groups: ResourceRef[][]): ResourceRef[] {
  const byKey = new Map<string, ResourceRef>();
  for (const group of groups) {
    for (const resource of group) {
      byKey.set(resourceKey(resource), resource);
    }
  }
  return Array.from(byKey.values()).sort(compareResources);
}

function compareResources(left: ResourceRef, right: ResourceRef): number {
  return resourceKey(left).localeCompare(resourceKey(right));
}

function resourceKey(resource: ResourceRef): string {
  return `${resource.type}:${resource.ref}`;
}

function resourceKeySet(resources: ResourceRef[]): Set<string> {
  return new Set(resources.map(resourceKey));
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function isExternalResource(resource: ResourceRef): boolean {
  return resource.type === 'external_resource';
}

function actionSucceeded(action: NormalizedAction): boolean {
  return action.status === 'succeeded' || action.command?.exitCode === 0;
}

function actionFailed(action: NormalizedAction): boolean {
  return action.status === 'failed' || (
    typeof action.command?.exitCode === 'number' && action.command.exitCode !== 0
  );
}

function findLastIndex<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index])) return index;
  }
  return -1;
}
