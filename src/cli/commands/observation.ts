import { readFileSync } from 'node:fs';
import {
  buildCandidateAtBatReport,
  parseCandidateAtBatTaskContext,
} from '../../compiler/candidate-at-bat.ts';
import { auditEffectLedgers } from '../../compiler/effect-audit.ts';
import { buildEffectReport } from '../../compiler/effect-report.ts';
import { compileTelemetryRun, compileTelemetryRunAst } from '../../compiler/frontend.ts';
import { planSemanticLowering } from '../../compiler/lowering.ts';
import { buildWorkflowStyleReport } from '../../compiler/workflow-style.ts';
import { buildPromptKindReport } from '../../measurement/prompt-kind.ts';
import {
  backfillPromptKindEvidence,
  getObserverSummary,
  recordPromptBoundary,
  recordSessionEnded,
  recordSessionStarted,
} from '../../reducers.ts';
import {
  observationEffectsResponse,
  observationLoweringPlanResponse,
  observationReportResponse,
  observationSummaryResponse,
} from '../presenters/observation.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const OBSERVATION_COMMANDS: Record<string, CommandHandler> = {
  'session-start': sessionStartCommand,
  'session-end': sessionEndCommand,
  'record-prompt': recordPromptCommand,
  'prompt-kind-report': promptKindReportCommand,
  'backfill-prompt-kind': backfillPromptKindCommand,
  report: reportCommand,
  audit: auditCommand,
};

function sessionEndCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    session: recordSessionEnded(kernel, {
      sessionId: args.requiredFlag('--session-id'),
    }),
  }));
}

function promptKindReportCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => (
    observationReportResponse('promptKind', buildPromptKindReport(kernel))
  ));
}

function backfillPromptKindCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => (
    observationReportResponse('promptKindBackfill', backfillPromptKindEvidence(kernel))
  ));
}

function sessionStartCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    session: recordSessionStarted(kernel, {
      sessionId: args.requiredFlag('--session-id'),
      workspaceScope: args.flagValue('--workspace-scope') ?? 'local',
      repoPath: args.flagValue('--repo-path') ?? args.cwd,
      branch: args.flagValue('--branch'),
      platform: args.flagValue('--platform') ?? 'agent',
      model: args.flagValue('--model') ?? null,
    }),
  }));
}

function recordPromptCommand(args: CommandArgs): unknown {
  const promptFile = args.flagValue('--prompt-file');
  const promptText = promptFile ? readFileSync(promptFile, 'utf8') : undefined;
  return withKernel(args, (kernel) => ({
    ok: true,
    prompt: recordPromptBoundary(kernel, {
      sessionId: args.requiredFlag('--session-id'),
      runId: args.flagValue('--run-id') ?? null,
      turnId: args.flagValue('--turn-id') ?? null,
      role: args.requiredFlag('--role'),
      kind: (args.flagValue('--kind') ?? 'user_prompt') as import('../../types/observation.ts').PromptKind,
      promptText,
      promptRef: promptFile,
      summary: args.flagValue('--summary'),
      responseSummary: args.flagValue('--response'),
      model: args.flagValue('--model') ?? null,
    }),
  }));
}

function reportCommand(args: CommandArgs): unknown {
  if (args.hasFlag('--at-bat')) {
    const runId = args.requiredFlag('--run-id');
    const taskContextPath = args.requiredFlag('--task-context');
    const taskContext = parseCandidateAtBatTaskContext(
      JSON.parse(readFileSync(taskContextPath, 'utf8'))
    );

    return withKernel(args, (kernel) => {
      const telemetry = compileTelemetryRunAst(kernel, { runId });
      return observationReportResponse(
        'atBat',
        buildCandidateAtBatReport(kernel, telemetry, taskContext)
      );
    });
  }

  if (args.hasFlag('--style')) {
    const runId = args.requiredFlag('--run-id');
    return withKernel(args, (kernel) => {
      const telemetry = compileTelemetryRunAst(kernel, { runId });
      return observationReportResponse('style', buildWorkflowStyleReport(kernel, telemetry));
    });
  }

  if (args.hasFlag('--effects')) {
    const runId = args.requiredFlag('--run-id');
    return withKernel(args, (kernel) => (
      observationEffectsResponse(buildEffectReport(compileTelemetryRunAst(kernel, { runId })))
    ));
  }

  if (args.hasFlag('--semantic')) {
    const runId = args.requiredFlag('--run-id');
    return withKernel(args, (kernel) => {
      const telemetry = compileTelemetryRun(kernel, { runId });

      if (args.hasFlag('--lower')) {
        return observationLoweringPlanResponse(planSemanticLowering({
          telemetry,
          semantic: telemetry.semantic,
        }));
      }

      return observationReportResponse('semantic', telemetry.semantic);
    });
  }

  return withKernel(args, (kernel) => observationSummaryResponse(getObserverSummary(kernel)));
}

function auditCommand(args: CommandArgs): unknown {
  return auditEffectLedgers({
    root: args.flagValue('--dir') ?? args.flagValue('--root') ?? args.cwd,
  });
}
