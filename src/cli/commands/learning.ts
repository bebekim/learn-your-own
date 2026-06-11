import { readFileSync } from 'node:fs';

import { buildAssociationLearningReport } from '../../compiler/association-learning.ts';
import { buildExplanationGraphReport } from '../../compiler/explanation-graph.ts';
import { buildStyleLearningReport } from '../../compiler/style-learning.ts';
import type { ExplanationGraphInput } from '../../compiler/explanation-graph.ts';
import {
  compactAssociationLearningReport,
  compactStyleLearningReport,
} from '../presenters/learning.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const LEARNING_COMMANDS: Record<string, CommandHandler> = {
  'learn associations': learnAssociationsCommand,
  'learn explanation': learnExplanationCommand,
  'learn style': learnStyleCommand,
};

function learnAssociationsCommand(args: CommandArgs): unknown {
  if (!args.hasFlag('--dry-run')) {
    throw new Error('learn associations is currently dry-run only; pass --dry-run');
  }
  const report = buildAssociationLearningReport({
    root: args.flagValue('--dir') ?? args.cwd,
  });

  return {
    ok: true,
    learning: args.hasFlag('--compact') ? compactAssociationLearningReport(report) : report,
  };
}

function learnExplanationCommand(args: CommandArgs): unknown {
  if (!args.hasFlag('--dry-run')) {
    throw new Error('learn explanation is currently dry-run only; pass --dry-run');
  }

  const inputPath = args.requiredFlag('--input');
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as ExplanationGraphInput;

  return {
    ok: true,
    learning: {
      ...buildExplanationGraphReport(input),
      persisted: false,
    },
  };
}

function learnStyleCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => {
    const report = buildStyleLearningReport(kernel);
    return {
      ok: true,
      learning: args.hasFlag('--verbose') ? report : compactStyleLearningReport(report),
    };
  });
}
