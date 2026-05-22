import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import {
  classifyCommand,
  phaseForCommand,
  phaseForPathActivation,
  summarizeCommand,
} from './hooks/normalizer.ts';
import type { LearningKernel } from './ledger.ts';
import type {
  AssociationOutcome,
  CommandActivationRecord,
  DeploymentActionRecord,
  FinishJobInput,
  JobActivationReport,
  JobActivationSummary,
  JobRecord,
  PathActivationKind,
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
  ZoneAssociationRecord,
  ZoneCoactivationRecord,
  ZoneRecord,
} from './index.ts';

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

export function deriveZoneActivationsForJob(kernel: LearningKernel, { jobId }: { jobId: string }): ZoneActivationRecord[] {
  const job = ensureJob(kernel, jobId);
  const zones = kernel.db.prepare(`
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
  `).all(job.workspaceId) as ZoneRecord[];
  const created: ZoneActivationRecord[] = [];
  const pathActivations = listPathActivations(kernel, jobId);
  for (const activation of pathActivations) {
    for (const zone of zones) {
      if (zone.pathGlob && pathMatchesGlob(activation.path, zone.pathGlob)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          runId: activation.runId,
          zoneId: zone.zoneId,
          activationKind: activation.activationKind,
          sourceKind: 'path',
          sourceId: activation.activationId,
          evidenceRef: activation.evidenceRef,
          strength: activation.activationKind === 'file_written' ? 1.5 : 1,
          confidence: activation.confidence,
        }));
      }
    }
  }
  const commandActivations = listCommandActivations(kernel, jobId);
  for (const activation of commandActivations) {
    for (const zone of zones) {
      if (commandMatchesZone(activation, zone)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          runId: activation.runId,
          zoneId: zone.zoneId,
          activationKind: `command_${activation.classification}`,
          sourceKind: 'command',
          sourceId: activation.commandId,
          evidenceRef: activation.evidenceRef,
          strength: activation.classification === 'deploy' ? 2 : 1,
          confidence: 'medium',
        }));
      }
    }
  }
  const deploymentActions = listDeploymentActions(kernel, jobId);
  for (const action of deploymentActions) {
    for (const zone of zones) {
      if (deploymentMatchesZone(action, zone)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          zoneId: zone.zoneId,
          activationKind: 'deployment_action',
          sourceKind: 'deployment',
          sourceId: action.deploymentId,
          evidenceRef: action.evidenceRef,
          strength: 2,
          confidence: 'medium',
        }));
      }
    }
  }
  return created;
}

export function deriveZoneCoactivationsForJob(kernel: LearningKernel, { jobId }: { jobId: string }): ZoneCoactivationRecord[] {
  ensureJob(kernel, jobId);
  const activations = kernel.db.prepare(`
    select zone_id as zoneId, max(strength) as strength
    from zone_activations
    where job_id = ?
    group by zone_id
    order by zone_id asc
  `).all(jobId) as { zoneId: string; strength: number }[];
  const records: ZoneCoactivationRecord[] = [];
  for (let i = 0; i < activations.length; i += 1) {
    for (let j = i + 1; j < activations.length; j += 1) {
      const left = activations[i];
      const right = activations[j];
      const [leftZoneId, rightZoneId] = sortedPair(left.zoneId, right.zoneId);
      const strength = Math.min(Number(left.strength), Number(right.strength));
      const coactivationId = `coact-${sha256(`${jobId}:${leftZoneId}:${rightZoneId}`).slice(0, 20)}`;
      kernel.db.prepare(`
        insert or ignore into zone_coactivations (
          coactivation_id, job_id, left_zone_id, right_zone_id, reason,
          strength, created_at
        )
        values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        coactivationId,
        jobId,
        leftZoneId,
        rightZoneId,
        'zones activated in the same job',
        strength,
        ISO_NOW()
      );
      records.push(getZoneCoactivation(kernel, coactivationId));
    }
  }
  return records;
}

export function updateZoneAssociationsFromJob(
  kernel: LearningKernel,
  { jobId, outcome = 'unknown' }: { jobId: string; outcome?: AssociationOutcome }
): ZoneAssociationRecord[] {
  ensureJob(kernel, jobId);
  const coactivations = listZoneCoactivations(kernel, jobId);
  const records: ZoneAssociationRecord[] = [];
  for (const coactivation of coactivations) {
    const associationKind = 'coactivation';
    const associationId = `assoc-${sha256(`${coactivation.leftZoneId}:${coactivation.rightZoneId}:${associationKind}`).slice(0, 20)}`;
    kernel.db.prepare(`
      insert into zone_associations (
        association_id, left_zone_id, right_zone_id, association_kind, weight,
        support_count, positive_outcomes, negative_outcomes, last_observed_at,
        created_at, updated_at
      )
      values (?, ?, ?, ?, 0, 0, 0, 0, null, ?, ?)
      on conflict(left_zone_id, right_zone_id, association_kind) do nothing
    `).run(
      associationId,
      coactivation.leftZoneId,
      coactivation.rightZoneId,
      associationKind,
      ISO_NOW(),
      ISO_NOW()
    );
    const observation = kernel.db.prepare(`
      insert or ignore into zone_association_observations (
        association_id, job_id, outcome, observed_at
      )
      values (?, ?, ?, ?)
    `).run(associationId, jobId, outcome, ISO_NOW());
    if (observation.changes === 0) {
      records.push(getZoneAssociation(kernel, coactivation.leftZoneId, coactivation.rightZoneId, associationKind));
      continue;
    }
    kernel.db.prepare(`
      update zone_associations
      set support_count = support_count + 1,
        positive_outcomes = positive_outcomes + ?,
        negative_outcomes = negative_outcomes + ?,
        weight = support_count + 1 + positive_outcomes + ? - negative_outcomes - ?,
        last_observed_at = ?,
        updated_at = ?
      where association_id = ?
    `).run(
      outcome === 'positive' ? 1 : 0,
      outcome === 'negative' ? 1 : 0,
      outcome === 'positive' ? 1 : 0,
      outcome === 'negative' ? 1 : 0,
      ISO_NOW(),
      ISO_NOW(),
      associationId
    );
    records.push(getZoneAssociation(kernel, coactivation.leftZoneId, coactivation.rightZoneId, associationKind));
  }
  return records;
}

export function getJobActivationReport(kernel: LearningKernel, { jobId }: { jobId: string }): JobActivationReport {
  const job = ensureJob(kernel, jobId);
  const pathActivations = listPathActivations(kernel, jobId);
  const commandActivations = listCommandActivations(kernel, jobId);
  const deploymentActions = listDeploymentActions(kernel, jobId);
  const zoneActivations = listZoneActivations(kernel, jobId);
  const zoneCoactivations = listZoneCoactivations(kernel, jobId);
  const associations = listJobZoneAssociations(kernel, jobId);
  return {
    job,
    summary: summarizeJobActivations({
      pathActivations,
      commandActivations,
      deploymentActions,
      zoneActivations,
      zoneCoactivations,
    }),
    pathActivations,
    commandActivations,
    deploymentActions,
    zoneActivations,
    zoneCoactivations,
    associations,
  };
}

export function getZoneAssociationReport(
  kernel: LearningKernel,
  { workspaceId, zoneId, limit = 20 }: { workspaceId: string; zoneId?: string; limit?: number }
): ZoneAssociationRecord[] {
  ensureWorkspace(kernel, workspaceId);
  const params: (string | number)[] = [workspaceId, workspaceId];
  let zoneFilter = '';
  if (zoneId) {
    ensureZone(kernel, zoneId);
    zoneFilter = 'and (za.left_zone_id = ? or za.right_zone_id = ?)';
    params.push(zoneId, zoneId);
  }
  params.push(limit);
  const rows = kernel.db.prepare(`
    select
      za.association_id as associationId,
      za.left_zone_id as leftZoneId,
      za.right_zone_id as rightZoneId,
      za.association_kind as associationKind,
      za.weight,
      za.support_count as supportCount,
      za.positive_outcomes as positiveOutcomes,
      za.negative_outcomes as negativeOutcomes,
      za.support_count - za.positive_outcomes - za.negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = za.association_id
      ) as coactivationSupport
    from zone_associations za
    join zones zl on zl.zone_id = za.left_zone_id
    join zones zr on zr.zone_id = za.right_zone_id
    where zl.workspace_id = ? and zr.workspace_id = ?
      ${zoneFilter}
    order by za.weight desc, za.support_count desc, za.updated_at desc
    limit ?
  `).all(...params) as ZoneAssociationRecord[];
  return rows.map(enrichZoneAssociation);
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

function getPathActivation(kernel: LearningKernel, activationId: string): PathActivationRecord {
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

function listPathActivations(kernel: LearningKernel, jobId: string): PathActivationRecord[] {
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

function getCommandActivation(kernel: LearningKernel, commandId: string): CommandActivationRecord {
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

function ensureCommandActivation(kernel: LearningKernel, commandId: string): CommandActivationRecord {
  const command = getCommandActivation(kernel, commandId);
  if (!command) throw new Error(`unknown command activation: ${commandId}`);
  return command;
}

function listCommandActivations(kernel: LearningKernel, jobId: string): CommandActivationRecord[] {
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

function getDeploymentAction(kernel: LearningKernel, deploymentId: string): DeploymentActionRecord {
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

function listDeploymentActions(kernel: LearningKernel, jobId: string): DeploymentActionRecord[] {
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

function getZoneActivation(kernel: LearningKernel, activationId: string): ZoneActivationRecord {
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

function listZoneActivations(kernel: LearningKernel, jobId: string): ZoneActivationRecord[] {
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

function getZoneCoactivation(kernel: LearningKernel, coactivationId: string): ZoneCoactivationRecord {
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

function listZoneCoactivations(kernel: LearningKernel, jobId: string): ZoneCoactivationRecord[] {
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

function getZoneAssociation(
  kernel: LearningKernel,
  leftZoneId: string,
  rightZoneId: string,
  associationKind: string
): ZoneAssociationRecord {
  const row = kernel.db.prepare(`
    select
      association_id as associationId,
      left_zone_id as leftZoneId,
      right_zone_id as rightZoneId,
      association_kind as associationKind,
      weight,
      support_count as supportCount,
      positive_outcomes as positiveOutcomes,
      negative_outcomes as negativeOutcomes,
      support_count - positive_outcomes - negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = zone_associations.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = zone_associations.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = zone_associations.association_id
      ) as coactivationSupport
    from zone_associations
    where left_zone_id = ? and right_zone_id = ? and association_kind = ?
  `).get(leftZoneId, rightZoneId, associationKind) as ZoneAssociationRecord;
  return enrichZoneAssociation(row);
}

function listJobZoneAssociations(kernel: LearningKernel, jobId: string): ZoneAssociationRecord[] {
  ensureJob(kernel, jobId);
  const rows = kernel.db.prepare(`
    select
      za.association_id as associationId,
      za.left_zone_id as leftZoneId,
      za.right_zone_id as rightZoneId,
      za.association_kind as associationKind,
      za.weight,
      za.support_count as supportCount,
      za.positive_outcomes as positiveOutcomes,
      za.negative_outcomes as negativeOutcomes,
      za.support_count - za.positive_outcomes - za.negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = za.association_id
      ) as coactivationSupport
    from zone_coactivations zc
    join zone_associations za
      on za.left_zone_id = zc.left_zone_id
      and za.right_zone_id = zc.right_zone_id
      and za.association_kind = 'coactivation'
    where zc.job_id = ?
    order by za.weight desc, za.support_count desc, za.updated_at desc
  `).all(jobId) as ZoneAssociationRecord[];
  return rows.map(enrichZoneAssociation);
}

function summarizeJobActivations({
  pathActivations,
  commandActivations,
  deploymentActions,
  zoneActivations,
  zoneCoactivations,
}: {
  pathActivations: PathActivationRecord[];
  commandActivations: CommandActivationRecord[];
  deploymentActions: DeploymentActionRecord[];
  zoneActivations: ZoneActivationRecord[];
  zoneCoactivations: ZoneCoactivationRecord[];
}): JobActivationSummary {
  return {
    evidenceRefs: uniqueSorted([
      ...pathActivations.map((activation) => activation.evidenceRef),
      ...commandActivations.map((activation) => activation.evidenceRef),
      ...deploymentActions.map((activation) => activation.evidenceRef),
      ...zoneActivations.map((activation) => activation.evidenceRef),
    ]),
    paths: {
      total: pathActivations.length,
      byKind: countBy(pathActivations, (activation) => activation.activationKind),
      byPhase: countBy(pathActivations, (activation) => activation.phase),
      repeated: repeatedPathActivations(pathActivations),
    },
    commands: {
      total: commandActivations.length,
      byClassification: countBy(commandActivations, (activation) => activation.classification),
      byStatus: countBy(commandActivations, (activation) => activation.status),
      byPhase: countBy(commandActivations, (activation) => activation.phase),
      totalOutputSize: commandActivations.reduce((sum, activation) => sum + activation.outputSize, 0),
      repeated: commandActivations
        .filter((activation) => activation.occurrenceCount > 1)
        .map((activation) => ({
          commandName: activation.commandName,
          argvSummary: activation.argvSummary,
          count: activation.occurrenceCount,
        })),
    },
    deployments: {
      total: deploymentActions.length,
      byProvider: countBy(deploymentActions, (activation) => activation.provider ?? 'unknown'),
      byEnvironment: countBy(deploymentActions, (activation) => activation.environment ?? 'unknown'),
      byStatus: countBy(deploymentActions, (activation) => activation.status),
    },
    zones: {
      total: zoneActivations.length,
      uniqueZones: new Set(zoneActivations.map((activation) => activation.zoneId)).size,
      byZoneId: countBy(zoneActivations, (activation) => activation.zoneId),
      byActivationKind: countBy(zoneActivations, (activation) => activation.activationKind),
      bySourceKind: countBy(zoneActivations, (activation) => activation.sourceKind),
      byConfidence: countBy(zoneActivations, (activation) => activation.confidence),
      strengthByZoneId: sumBy(zoneActivations, (activation) => activation.zoneId, (activation) => activation.strength),
    },
    coactivations: {
      total: zoneCoactivations.length,
    },
  };
}

function countBy<T>(records: T[], keyFn: (record: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const key = keyFn(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sumBy<T>(
  records: T[],
  keyFn: (record: T) => string,
  valueFn: (record: T) => number
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const record of records) {
    const key = keyFn(record);
    sums[key] = roundMetric((sums[key] ?? 0) + valueFn(record));
  }
  return sums;
}

function repeatedPathActivations(records: PathActivationRecord[]): { path: string; activationKind: PathActivationKind; count: number }[] {
  const counts = new Map<string, { path: string; activationKind: PathActivationKind; count: number }>();
  for (const record of records) {
    const key = `${record.path}\0${record.activationKind}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { path: record.path, activationKind: record.activationKind, count: 1 });
    }
  }
  return [...counts.values()]
    .filter((record) => record.count > 1)
    .sort((left, right) => left.path.localeCompare(right.path) || left.activationKind.localeCompare(right.activationKind));
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function enrichZoneAssociation(record: ZoneAssociationRecord): ZoneAssociationRecord {
  const unknownOutcomes = Math.max(0, record.unknownOutcomes ?? record.supportCount - record.positiveOutcomes - record.negativeOutcomes);
  const knownOutcomes = record.positiveOutcomes + record.negativeOutcomes;
  const leftActivationCount = record.leftActivationCount ?? 0;
  const rightActivationCount = record.rightActivationCount ?? 0;
  const coactivationSupport = record.coactivationSupport ?? record.supportCount;
  const normalizedDenominator = Math.sqrt(leftActivationCount * rightActivationCount);
  const unionActivationCount = leftActivationCount + rightActivationCount - coactivationSupport;
  return {
    ...record,
    unknownOutcomes,
    knownOutcomes,
    successRate: knownOutcomes > 0 ? roundMetric(record.positiveOutcomes / knownOutcomes) : null,
    riskRate: knownOutcomes > 0 ? roundMetric(record.negativeOutcomes / knownOutcomes) : null,
    leftActivationCount,
    rightActivationCount,
    coactivationSupport,
    normalizedWeight: normalizedDenominator > 0 ? roundMetric(coactivationSupport / normalizedDenominator) : 0,
    jaccardWeight: unionActivationCount > 0 ? roundMetric(coactivationSupport / unionActivationCount) : 0,
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/');
}

function pathMatchesGlob(path: string, glob: string): boolean {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedGlob = normalizeRelativePath(glob);
  if (normalizedGlob === normalizedPath) return true;
  if (normalizedGlob.endsWith('/**')) {
    const prefix = normalizedGlob.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedGlob.endsWith('*')) {
    return normalizedPath.startsWith(normalizedGlob.slice(0, -1));
  }
  return false;
}

function commandMatchesZone(command: CommandActivationRecord, zone: ZoneRecord): boolean {
  if (zone.zoneKind !== 'external_command' && zone.zoneKind !== 'deployment') return false;
  const haystack = [
    command.commandName,
    command.commandFamily,
    command.classification,
    command.argvSummary,
    zone.zoneKind,
    zone.name,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
  const zoneName = zone.name.toLowerCase().replace(/[_-]/g, ' ');
  const commandName = command.commandName.toLowerCase();
  return haystack.includes(zoneName)
    || zoneName.includes(commandName)
    || (command.commandFamily ? zoneName.includes(command.commandFamily.toLowerCase()) : false);
}

function deploymentMatchesZone(action: DeploymentActionRecord, zone: ZoneRecord): boolean {
  if (zone.zoneKind !== 'deployment' && zone.zoneKind !== 'external_command') return false;
  const haystack = [
    action.provider,
    action.environment,
    action.target,
    zone.zoneKind,
    zone.name,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
  return haystack.includes(zone.name.toLowerCase().replace(/[_-]/g, ' '))
    || (action.provider ? haystack.includes(action.provider.toLowerCase()) : false);
}

function sortedPair(left: string, right: string): [string, string] {
  return left <= right ? [left, right] : [right, left];
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
