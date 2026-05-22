import {
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
  ensureWorkspace,
  getWorkspaceByRoot,
  recordCommandActivation,
  recordDeploymentAction,
  recordJob,
  recordPathActivation,
  recordWorkspace,
  updateZoneAssociationsFromJob,
} from '../activation.ts';
import type { LearningKernel } from '../ledger.ts';
import type {
  NormalizeHooksInput,
  NormalizeHooksResult,
  WorkspaceRecord,
} from '../types.ts';
import { classifyHookEvent } from './normalizer.ts';

const ISO_NOW = () => new Date().toISOString();

export function normalizeHooks(kernel: LearningKernel, input: NormalizeHooksInput = {}): NormalizeHooksResult {
  const events = kernel.db.prepare(`
    select
      he.event_id as eventId,
      he.session_id as sessionId,
      he.turn_id as turnId,
      he.event_name as eventName,
      he.cwd,
      he.payload_json as payloadJson
    from hook_events he
    left join hook_normalizations hn on hn.event_id = he.event_id
    where hn.event_id is null
    order by he.created_at asc, he.event_id asc
    limit ?
  `).all(input.limit ?? 1000) as {
    eventId: string;
    sessionId: string;
    turnId: string | null;
    eventName: string;
    cwd: string;
    payloadJson: string;
  }[];

  const jobIds = new Set<string>();
  let pathActivations = 0;
  let commandActivations = 0;
  let deploymentActions = 0;

  for (const event of events) {
    const classified = classifyHookEvent(event);
    const workspace = workspaceForHookEvent(kernel, event.cwd, input.workspaceId);
    const jobId = classified.jobId;
    jobIds.add(jobId);
    recordJob(kernel, {
      jobId,
      workspaceId: workspace.workspaceId,
      runId: event.turnId ?? null,
      taskShape: `${classified.runtime}-hook-turn`,
      summary: `${classified.runtime} ${event.eventName} in ${workspace.name}`,
      sourceRef: `${classified.runtime}-hook:${event.eventId}`,
      status: ['Stop', 'turn.stop'].includes(event.eventName) ? 'completed' : 'started',
    });

    for (const commandFact of classified.commands) {
      const command = recordCommandActivation(kernel, {
        jobId,
        runId: event.turnId ?? null,
        commandName: commandFact.commandName,
        commandFamily: commandFact.commandFamily,
        workingDirectory: commandFact.workingDirectory,
        argv: commandFact.argv,
        argvSummary: commandFact.argvSummary,
        classification: commandFact.classification,
        evidenceRef: classified.evidenceRef,
        status: commandFact.status,
        phase: commandFact.phase,
        outputSize: commandFact.outputSize,
      });
      commandActivations += 1;
      if (commandFact.deployment) {
        recordDeploymentAction(kernel, {
          jobId,
          commandId: command.commandId,
          provider: commandFact.deployment.provider,
          environment: commandFact.deployment.environment,
          target: commandFact.deployment.target,
          status: commandFact.deployment.status,
          evidenceRef: classified.evidenceRef,
        });
        deploymentActions += 1;
      }
    }

    for (const pathFact of classified.paths) {
      recordPathActivation(kernel, {
        jobId,
        runId: event.turnId ?? null,
        path: pathFact.path,
        activationKind: pathFact.activationKind,
        evidenceRef: classified.evidenceRef,
        confidence: pathFact.confidence,
        phase: pathFact.phase,
      });
      pathActivations += 1;
    }

    kernel.db.prepare(`
      insert or ignore into hook_normalizations (event_id, job_id, normalized_at)
      values (?, ?, ?)
    `).run(event.eventId, jobId, ISO_NOW());
  }

  let zoneActivations = 0;
  let zoneCoactivations = 0;
  let associations = 0;
  for (const jobId of jobIds) {
    zoneActivations += deriveZoneActivationsForJob(kernel, { jobId }).length;
    zoneCoactivations += deriveZoneCoactivationsForJob(kernel, { jobId }).length;
    associations += updateZoneAssociationsFromJob(kernel, {
      jobId,
      outcome: input.outcome ?? 'unknown',
    }).length;
  }

  return {
    processedEvents: events.length,
    jobs: [...jobIds],
    pathActivations,
    commandActivations,
    deploymentActions,
    zoneActivations,
    zoneCoactivations,
    associations,
  };
}

function workspaceForHookEvent(kernel: LearningKernel, cwd: string, workspaceId?: string): WorkspaceRecord {
  if (workspaceId) return ensureWorkspace(kernel, workspaceId);
  const existing = getWorkspaceByRoot(kernel, cwd);
  if (existing) return existing;
  return recordWorkspace(kernel, {
    rootPath: cwd,
  });
}
