import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import {
  classifyCommand,
  phaseForCommand,
  phaseForPathActivation,
  summarizeCommand,
} from '../hooks/normalizer.ts';
import type { LearningKernel } from '../ledger.ts';
import type {
  CommandActivationRecord,
  DeploymentActionRecord,
  FinishJobInput,
  JobRecord,
  PathActivationRecord,
  RecordCommandActivationInput,
  RecordDeploymentActionInput,
  RecordJobInput,
  RecordPathActivationInput,
  RecordZoneInput,
  RecordZoneActivationInput,
  WorkspaceRecordInput,
  WorkspaceRecord,
  ZoneActivationRecord,
  ZoneCoactivationRecord,
  ZoneRecord,
} from '../types.ts';
import { normalizeRelativePath } from './matching.ts';

const ISO_NOW = () => new Date().toISOString();

export function recordWorkspace(kernel: LearningKernel, input: WorkspaceRecordInput): WorkspaceRecord {
  requireFields(input, ['rootPath']);
  const rootPath = resolve(input.rootPath);
  const workspaceId = input.workspaceId ?? `workspace-${sha256(rootPath).slice(0, 16)}`;
  const name = input.name ?? basename(rootPath);
  kernel.db.prepare(`
    insert into workspaces (workspace_id, root_path, name, created_at, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(workspace_id) do update set
      root_path = excluded.root_path,
      name = excluded.name,
      updated_at = excluded.updated_at
  `).run(workspaceId, rootPath, name, ISO_NOW(), ISO_NOW());
  return getWorkspace(kernel, workspaceId);
}

export function recordZone(kernel: LearningKernel, input: RecordZoneInput): ZoneRecord {
  requireFields(input, ['workspaceId', 'zoneKind', 'name']);
  ensureWorkspace(kernel, input.workspaceId);
  if (input.parentZoneId) ensureZone(kernel, input.parentZoneId);
  const zoneId = input.zoneId ?? `zone-${sha256(`${input.workspaceId}:${input.name}`).slice(0, 16)}`;
  kernel.db.prepare(`
    insert into zones (
      zone_id, workspace_id, parent_zone_id, zone_kind, path_glob, name,
      description, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(zone_id) do update set
      parent_zone_id = excluded.parent_zone_id,
      zone_kind = excluded.zone_kind,
      path_glob = excluded.path_glob,
      name = excluded.name,
      description = excluded.description,
      updated_at = excluded.updated_at
  `).run(
    zoneId,
    input.workspaceId,
    input.parentZoneId ?? null,
    input.zoneKind,
    input.pathGlob ?? null,
    input.name,
    input.description ?? null,
    ISO_NOW(),
    ISO_NOW()
  );
  return getZone(kernel, zoneId);
}

export function recordJob(kernel: LearningKernel, input: RecordJobInput): JobRecord {
  requireFields(input, ['jobId', 'workspaceId']);
  ensureWorkspace(kernel, input.workspaceId);
  kernel.db.prepare(`
    insert into jobs (
      job_id, workspace_id, run_id, task_shape, summary, source_ref, status,
      created_at, completed_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, null, ?)
    on conflict(job_id) do update set
      run_id = coalesce(excluded.run_id, jobs.run_id),
      task_shape = coalesce(excluded.task_shape, jobs.task_shape),
      summary = coalesce(excluded.summary, jobs.summary),
      source_ref = coalesce(excluded.source_ref, jobs.source_ref),
      status = excluded.status,
      completed_at = case
        when excluded.status in ('completed', 'failed', 'cancelled') then excluded.updated_at
        else jobs.completed_at
      end,
      updated_at = excluded.updated_at
  `).run(
    input.jobId,
    input.workspaceId,
    input.runId ?? null,
    input.taskShape ?? null,
    input.summary ?? null,
    input.sourceRef ?? null,
    input.status ?? 'started',
    ISO_NOW(),
    ISO_NOW()
  );
  return getJob(kernel, input.jobId);
}

export function finishJob(kernel: LearningKernel, input: FinishJobInput): JobRecord {
  requireFields(input, ['jobId', 'status']);
  ensureJob(kernel, input.jobId);
  kernel.db.prepare(`
    update jobs
    set status = ?,
      completed_at = case when ? in ('completed', 'failed', 'cancelled') then ? else completed_at end,
      updated_at = ?
    where job_id = ?
  `).run(input.status, input.status, ISO_NOW(), ISO_NOW(), input.jobId);
  return getJob(kernel, input.jobId);
}

export function recordPathActivation(kernel: LearningKernel, input: RecordPathActivationInput): PathActivationRecord {
  requireFields(input, ['jobId', 'path', 'activationKind']);
  ensureJob(kernel, input.jobId);
  const activationId = input.activationId ?? `path-act-${sha256(`${input.jobId}:${input.path}:${input.activationKind}:${input.evidenceRef ?? ''}`).slice(0, 20)}`;
  const phase = input.phase ?? phaseForPathActivation(input.activationKind);
  kernel.db.prepare(`
    insert or ignore into path_activations (
      activation_id, job_id, run_id, path, activation_kind, evidence_ref,
      confidence, phase, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    activationId,
    input.jobId,
    input.runId ?? null,
    normalizeRelativePath(input.path),
    input.activationKind,
    input.evidenceRef ?? null,
    input.confidence ?? 'medium',
    phase,
    ISO_NOW()
  );
  return getPathActivation(kernel, activationId);
}

export function recordCommandActivation(kernel: LearningKernel, input: RecordCommandActivationInput): CommandActivationRecord {
  requireFields(input, ['jobId', 'commandName']);
  ensureJob(kernel, input.jobId);
  const argvHash = input.argvHash ?? (input.argv ? sha256(input.argv) : null);
  const argvSummary = input.argvSummary ?? (input.argv ? summarizeCommand(input.argv) : null);
  const classification = input.classification ?? classifyCommand(input.commandName, argvSummary ?? input.argv ?? input.commandName);
  const phase = input.phase ?? phaseForCommand(classification, input.commandName, argvSummary ?? input.argv ?? input.commandName);
  const commandId = input.commandId ?? `cmd-act-${sha256(`${input.jobId}:${input.commandName}:${argvHash ?? argvSummary ?? ''}`).slice(0, 20)}`;
  kernel.db.prepare(`
    insert into command_activations (
      command_id, job_id, run_id, command_name, command_family, working_directory,
      argv_hash, argv_summary, classification, evidence_ref, status, phase,
      output_size, occurrence_count, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    on conflict(command_id) do update set
      status = case
        when excluded.status = 'failed' then 'failed'
        when command_activations.status = 'failed' then command_activations.status
        when excluded.status = 'succeeded' then 'succeeded'
        when command_activations.status = 'succeeded' then command_activations.status
        when excluded.status = 'attempted' then 'attempted'
        else excluded.status
      end,
      phase = excluded.phase,
      output_size = max(command_activations.output_size, excluded.output_size),
      occurrence_count = command_activations.occurrence_count + 1,
      updated_at = excluded.updated_at
  `).run(
    commandId,
    input.jobId,
    input.runId ?? null,
    input.commandName,
    input.commandFamily ?? input.commandName,
    input.workingDirectory ?? null,
    argvHash,
    argvSummary,
    classification,
    input.evidenceRef ?? null,
    input.status ?? 'attempted',
    phase,
    input.outputSize ?? 0,
    ISO_NOW(),
    ISO_NOW()
  );
  return getCommandActivation(kernel, commandId);
}

export function recordDeploymentAction(kernel: LearningKernel, input: RecordDeploymentActionInput): DeploymentActionRecord {
  requireFields(input, ['jobId', 'commandId']);
  ensureJob(kernel, input.jobId);
  ensureCommandActivation(kernel, input.commandId);
  const deploymentId = input.deploymentId ?? `deploy-${sha256(`${input.jobId}:${input.commandId}:${input.target ?? ''}`).slice(0, 20)}`;
  kernel.db.prepare(`
    insert into deployment_actions (
      deployment_id, job_id, command_id, provider, environment, target, status,
      evidence_ref, created_at, completed_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(deployment_id) do update set
      status = excluded.status,
      completed_at = excluded.completed_at
  `).run(
    deploymentId,
    input.jobId,
    input.commandId,
    input.provider ?? null,
    input.environment ?? null,
    input.target ?? null,
    input.status ?? 'attempted',
    input.evidenceRef ?? null,
    ISO_NOW(),
    input.status && ['succeeded', 'failed'].includes(input.status) ? ISO_NOW() : null
  );
  return getDeploymentAction(kernel, deploymentId);
}

export function recordZoneActivation(kernel: LearningKernel, input: RecordZoneActivationInput): ZoneActivationRecord {
  requireFields(input, ['jobId', 'zoneId', 'activationKind', 'sourceKind']);
  ensureJob(kernel, input.jobId);
  ensureZone(kernel, input.zoneId);
  const activationId = input.activationId ?? `zone-act-${sha256(`${input.jobId}:${input.zoneId}:${input.sourceKind}:${input.sourceId ?? ''}`).slice(0, 20)}`;
  kernel.db.prepare(`
    insert or ignore into zone_activations (
      activation_id, job_id, run_id, zone_id, activation_kind, source_kind,
      source_id, evidence_ref, strength, confidence, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    activationId,
    input.jobId,
    input.runId ?? null,
    input.zoneId,
    input.activationKind,
    input.sourceKind,
    input.sourceId ?? null,
    input.evidenceRef ?? null,
    input.strength ?? 1,
    input.confidence ?? 'medium',
    ISO_NOW()
  );
  return getZoneActivation(kernel, activationId);
}

export function getWorkspace(kernel: LearningKernel, workspaceId: string): WorkspaceRecord {
  return kernel.db.prepare(`
    select workspace_id as workspaceId, root_path as rootPath, name
    from workspaces
    where workspace_id = ?
  `).get(workspaceId) as WorkspaceRecord;
}

export function getWorkspaceByRoot(kernel: LearningKernel, rootPath: string): WorkspaceRecord | undefined {
  return kernel.db.prepare(`
    select workspace_id as workspaceId, root_path as rootPath, name
    from workspaces
    where root_path = ?
  `).get(resolve(rootPath)) as WorkspaceRecord | undefined;
}

export function ensureWorkspace(kernel: LearningKernel, workspaceId: string): WorkspaceRecord {
  const workspace = getWorkspace(kernel, workspaceId);
  if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`);
  return workspace;
}

export function getZone(kernel: LearningKernel, zoneId: string): ZoneRecord {
  return kernel.db.prepare(`
    select
      zone_id as zoneId,
      workspace_id as workspaceId,
      parent_zone_id as parentZoneId,
      zone_kind as zoneKind,
      path_glob as pathGlob,
      name,
      description
    from zones
    where zone_id = ?
  `).get(zoneId) as ZoneRecord;
}

export function ensureZone(kernel: LearningKernel, zoneId: string): ZoneRecord {
  const zone = getZone(kernel, zoneId);
  if (!zone) throw new Error(`unknown zone: ${zoneId}`);
  return zone;
}

export function listZonesForWorkspace(kernel: LearningKernel, workspaceId: string): ZoneRecord[] {
  return kernel.db.prepare(`
    select
      zone_id as zoneId,
      workspace_id as workspaceId,
      parent_zone_id as parentZoneId,
      zone_kind as zoneKind,
      path_glob as pathGlob,
      name,
      description
    from zones
    where workspace_id = ?
  `).all(workspaceId) as ZoneRecord[];
}

export function getJob(kernel: LearningKernel, jobId: string): JobRecord {
  return kernel.db.prepare(`
    select
      job_id as jobId,
      workspace_id as workspaceId,
      run_id as runId,
      task_shape as taskShape,
      summary,
      source_ref as sourceRef,
      status
    from jobs
    where job_id = ?
  `).get(jobId) as JobRecord;
}

export function ensureJob(kernel: LearningKernel, jobId: string): JobRecord {
  const job = getJob(kernel, jobId);
  if (!job) throw new Error(`unknown job: ${jobId}`);
  return job;
}

export function getPathActivation(kernel: LearningKernel, activationId: string): PathActivationRecord {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      path,
      activation_kind as activationKind,
      evidence_ref as evidenceRef,
      confidence,
      phase
    from path_activations
    where activation_id = ?
  `).get(activationId) as PathActivationRecord;
}

export function listPathActivations(kernel: LearningKernel, jobId: string): PathActivationRecord[] {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      path,
      activation_kind as activationKind,
      evidence_ref as evidenceRef,
      confidence,
      phase
    from path_activations
    where job_id = ?
    order by created_at asc, activation_id asc
  `).all(jobId) as PathActivationRecord[];
}

export function getCommandActivation(kernel: LearningKernel, commandId: string): CommandActivationRecord {
  return kernel.db.prepare(`
    select
      command_id as commandId,
      job_id as jobId,
      run_id as runId,
      command_name as commandName,
      command_family as commandFamily,
      working_directory as workingDirectory,
      argv_hash as argvHash,
      argv_summary as argvSummary,
      classification,
      evidence_ref as evidenceRef,
      status,
      phase,
      output_size as outputSize,
      occurrence_count as occurrenceCount
    from command_activations
    where command_id = ?
  `).get(commandId) as CommandActivationRecord;
}

export function ensureCommandActivation(kernel: LearningKernel, commandId: string): CommandActivationRecord {
  const command = getCommandActivation(kernel, commandId);
  if (!command) throw new Error(`unknown command activation: ${commandId}`);
  return command;
}

export function listCommandActivations(kernel: LearningKernel, jobId: string): CommandActivationRecord[] {
  return kernel.db.prepare(`
    select
      command_id as commandId,
      job_id as jobId,
      run_id as runId,
      command_name as commandName,
      command_family as commandFamily,
      working_directory as workingDirectory,
      argv_hash as argvHash,
      argv_summary as argvSummary,
      classification,
      evidence_ref as evidenceRef,
      status,
      phase,
      output_size as outputSize,
      occurrence_count as occurrenceCount
    from command_activations
    where job_id = ?
    order by created_at asc, command_id asc
  `).all(jobId) as CommandActivationRecord[];
}

export function getDeploymentAction(kernel: LearningKernel, deploymentId: string): DeploymentActionRecord {
  return kernel.db.prepare(`
    select
      deployment_id as deploymentId,
      job_id as jobId,
      command_id as commandId,
      provider,
      environment,
      target,
      status,
      evidence_ref as evidenceRef
    from deployment_actions
    where deployment_id = ?
  `).get(deploymentId) as DeploymentActionRecord;
}

export function listDeploymentActions(kernel: LearningKernel, jobId: string): DeploymentActionRecord[] {
  return kernel.db.prepare(`
    select
      deployment_id as deploymentId,
      job_id as jobId,
      command_id as commandId,
      provider,
      environment,
      target,
      status,
      evidence_ref as evidenceRef
    from deployment_actions
    where job_id = ?
    order by created_at asc, deployment_id asc
  `).all(jobId) as DeploymentActionRecord[];
}

export function getZoneActivation(kernel: LearningKernel, activationId: string): ZoneActivationRecord {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      zone_id as zoneId,
      activation_kind as activationKind,
      source_kind as sourceKind,
      source_id as sourceId,
      evidence_ref as evidenceRef,
      strength,
      confidence
    from zone_activations
    where activation_id = ?
  `).get(activationId) as ZoneActivationRecord;
}

export function listZoneActivations(kernel: LearningKernel, jobId: string): ZoneActivationRecord[] {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      zone_id as zoneId,
      activation_kind as activationKind,
      source_kind as sourceKind,
      source_id as sourceId,
      evidence_ref as evidenceRef,
      strength,
      confidence
    from zone_activations
    where job_id = ?
    order by created_at asc, activation_id asc
  `).all(jobId) as ZoneActivationRecord[];
}

export function getZoneCoactivation(kernel: LearningKernel, coactivationId: string): ZoneCoactivationRecord {
  return kernel.db.prepare(`
    select
      coactivation_id as coactivationId,
      job_id as jobId,
      left_zone_id as leftZoneId,
      right_zone_id as rightZoneId,
      reason,
      strength
    from zone_coactivations
    where coactivation_id = ?
  `).get(coactivationId) as ZoneCoactivationRecord;
}

export function listZoneCoactivations(kernel: LearningKernel, jobId: string): ZoneCoactivationRecord[] {
  return kernel.db.prepare(`
    select
      coactivation_id as coactivationId,
      job_id as jobId,
      left_zone_id as leftZoneId,
      right_zone_id as rightZoneId,
      reason,
      strength
    from zone_coactivations
    where job_id = ?
    order by left_zone_id asc, right_zone_id asc
  `).all(jobId) as ZoneCoactivationRecord[];
}

function requireFields(input: object, fields: string[]): void {
  const values = input as Record<string, unknown>;
  for (const field of fields) {
    if (values[field] === undefined || values[field] === null || values[field] === '') {
      throw new Error(`missing required field: ${field}`);
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
