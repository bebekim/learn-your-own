import {
  getJobActivationReport,
  getZoneAssociationReport,
  recordCommandActivation,
  recordDeploymentAction,
  recordPathActivation,
} from '../../activation.ts';
import { deriveActivationState } from '../activation.ts';
import {
  activationConfidence,
  commandClassification,
  commandStatus,
  deploymentStatus,
  pathActivationKind,
} from '../coercion.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const ACTIVATION_COMMANDS: Record<string, CommandHandler> = {
  'activate path': activatePathCommand,
  'activate command': activateCommandCommand,
  'activate deployment': activateDeploymentCommand,
  'activation derive': activationDeriveCommand,
  'activation report': activationReportCommand,
  'zone associations': zoneAssociationsCommand,
};

function activatePathCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    pathActivation: recordPathActivation(kernel, {
      jobId: args.requiredFlag('--job-id'),
      runId: args.flagValue('--run-id') ?? null,
      path: args.requiredFlag('--path'),
      activationKind: pathActivationKind(args.flagValue('--kind')),
      evidenceRef: args.flagValue('--evidence-ref') ?? null,
      confidence: activationConfidence(args.flagValue('--confidence')),
    }),
  }));
}

function activateCommandCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    commandActivation: recordCommandActivation(kernel, {
      jobId: args.requiredFlag('--job-id'),
      runId: args.flagValue('--run-id') ?? null,
      commandName: args.requiredFlag('--command-name'),
      commandFamily: args.flagValue('--command-family') ?? null,
      workingDirectory: args.flagValue('--working-directory') ?? null,
      argv: args.flagValue('--argv') ?? null,
      argvHash: args.flagValue('--argv-hash') ?? null,
      argvSummary: args.flagValue('--argv-summary') ?? null,
      classification: commandClassification(args.flagValue('--classification')),
      evidenceRef: args.flagValue('--evidence-ref') ?? null,
      status: commandStatus(args.flagValue('--status')),
    }),
  }));
}

function activateDeploymentCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    deploymentAction: recordDeploymentAction(kernel, {
      jobId: args.requiredFlag('--job-id'),
      commandId: args.requiredFlag('--command-id'),
      provider: args.flagValue('--provider') ?? null,
      environment: args.flagValue('--environment') ?? null,
      target: args.flagValue('--target') ?? null,
      status: deploymentStatus(args.flagValue('--status')),
      evidenceRef: args.flagValue('--evidence-ref') ?? null,
    }),
  }));
}

function activationDeriveCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    ...deriveActivationState(kernel, args.requiredFlag('--job-id'), args.flagValue('--outcome') ?? 'unknown'),
  }));
}

function activationReportCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    ...getJobActivationReport(kernel, { jobId: args.requiredFlag('--job-id') }),
  }));
}

function zoneAssociationsCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    associations: getZoneAssociationReport(kernel, {
      workspaceId: args.requiredFlag('--workspace-id'),
      zoneId: args.flagValue('--zone-id'),
      limit: args.optionalNumber('--limit') ?? 20,
    }),
  }));
}
