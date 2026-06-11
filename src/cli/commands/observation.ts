import { readFileSync } from 'node:fs';
import { analyzeTelemetrySemantics } from '../../compiler/analyzer.ts';
import {
  buildCandidateAtBatReport,
  parseCandidateAtBatTaskContext,
} from '../../compiler/candidate-at-bat.ts';
import { buildCyberneticExperimentReport } from '../../compiler/cybernetic-experiment.ts';
import type { CyberneticExperimentAttemptInput } from '../../compiler/cybernetic-experiment.ts';
import { auditEffectLedgers } from '../../compiler/effect-audit.ts';
import { buildEffectReport } from '../../compiler/effect-report.ts';
import { compileTelemetryRunAst } from '../../compiler/parser.ts';
import { planSemanticLowering } from '../../compiler/lowering.ts';
import { buildWorkflowStyleReport } from '../../compiler/workflow-style.ts';
import {
  getObserverSummary,
  recordPromptBoundary,
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
  'record-prompt': recordPromptCommand,
  report: reportCommand,
  audit: auditCommand,
  experiment: experimentCommand,
};

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
      kind: args.flagValue('--kind') ?? 'user_prompt',
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
      const telemetry = compileTelemetryRunAst(kernel, { runId });
      const semantic = analyzeTelemetrySemantics(telemetry);

      if (args.hasFlag('--lower')) {
        return observationLoweringPlanResponse(planSemanticLowering({ telemetry, semantic }));
      }

      return observationReportResponse('semantic', semantic);
    });
  }

  return withKernel(args, (kernel) => observationSummaryResponse(getObserverSummary(kernel)));
}

function auditCommand(args: CommandArgs): unknown {
  return auditEffectLedgers({
    root: args.flagValue('--dir') ?? args.flagValue('--root') ?? args.cwd,
  });
}

function experimentCommand(args: CommandArgs): unknown {
  const familyId = args.requiredFlag('--family-id');
  const artifactId = args.flagValue('--artifact') ?? null;
  const associationEdge = args.flagValue('--association-edge') ?? null;

  return withKernel(args, (kernel) => {
    const attempts: CyberneticExperimentAttemptInput[] = [
      {
        attemptId: 'A0',
        mode: 'baseline' as const,
        telemetry: compileTelemetryRunAst(kernel, { runId: args.requiredFlag('--baseline-run-id') }),
      },
      {
        attemptId: 'A1',
        mode: 'treatment' as const,
        telemetry: compileTelemetryRunAst(kernel, { runId: args.requiredFlag('--treatment-run-id') }),
        deliveredArtifacts: artifactId ? [artifactId] : [],
      },
    ];

    const variantRunId = args.flagValue('--variant-run-id');
    if (variantRunId) {
      attempts.push({
        attemptId: 'A2',
        mode: 'variant' as const,
        telemetry: compileTelemetryRunAst(kernel, { runId: variantRunId }),
        deliveredArtifacts: artifactId ? [artifactId] : [],
      });
    }

    return observationReportResponse(
      'experiment',
      buildCyberneticExperimentReport({
        familyId,
        attempts,
        associationEdges: associationEdge && artifactId
          ? [{ edge: associationEdge, artifactId }]
          : [],
        nextExperiment: args.flagValue('--next-experiment') ?? null,
      })
    );
  });
}
