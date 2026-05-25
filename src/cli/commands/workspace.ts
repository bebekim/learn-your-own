import {
  finishJob,
  recordJob,
  recordWorkspace,
  recordZone,
} from '../../activation.ts';
import { deriveActivationState } from '../activation.ts';
import { jobStatus } from '../coercion.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const WORKSPACE_COMMANDS: Record<string, CommandHandler> = {
  'workspace register': workspaceRegisterCommand,
  'zone add': zoneAddCommand,
  'job start': jobStartCommand,
  'job finish': jobFinishCommand,
};

function workspaceRegisterCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    workspace: recordWorkspace(kernel, {
      workspaceId: args.flagValue('--workspace-id'),
      rootPath: args.requiredFlag('--root'),
      name: args.flagValue('--name'),
    }),
  }));
}

function zoneAddCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    zone: recordZone(kernel, {
      zoneId: args.flagValue('--zone-id'),
      workspaceId: args.requiredFlag('--workspace-id'),
      parentZoneId: args.flagValue('--parent-zone-id') ?? null,
      zoneKind: args.requiredFlag('--kind'),
      pathGlob: args.flagValue('--path-glob') ?? null,
      name: args.requiredFlag('--name'),
      description: args.flagValue('--description') ?? null,
    }),
  }));
}

function jobStartCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    job: recordJob(kernel, {
      jobId: args.requiredFlag('--job-id'),
      workspaceId: args.requiredFlag('--workspace-id'),
      runId: args.flagValue('--run-id') ?? null,
      taskShape: args.flagValue('--task-shape') ?? null,
      summary: args.flagValue('--summary') ?? null,
      sourceRef: args.flagValue('--source-ref') ?? null,
      status: 'started',
    }),
  }));
}

function jobFinishCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => {
    const job = finishJob(kernel, {
      jobId: args.requiredFlag('--job-id'),
      status: jobStatus(args.flagValue('--status'), 'completed'),
    });
    const derived = args.hasFlag('--derive')
      ? deriveActivationState(kernel, job.jobId, args.flagValue('--outcome') ?? 'unknown')
      : null;
    return { ok: true, job, derived };
  });
}
