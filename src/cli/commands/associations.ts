import {
  recommendZoneAssociations,
} from '../../activation.ts';
import { deriveActivationState } from '../activation.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const ASSOCIATION_COMMANDS: Record<string, CommandHandler> = {
  'associations derive': associationsDeriveCommand,
  'associations recommend': associationsRecommendCommand,
};

function associationsDeriveCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    ...deriveActivationState(kernel, args.requiredFlag('--job-id'), args.flagValue('--outcome') ?? 'unknown'),
  }));
}

function associationsRecommendCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    recommendations: recommendZoneAssociations(kernel, {
      workspaceId: args.requiredFlag('--workspace-id'),
      seedZoneIds: seedZoneIds(args.flagValue('--seed-zone-id')),
      limit: args.optionalNumber('--limit') ?? 10,
      includeNonPositive: args.hasFlag('--include-nonpositive'),
    }),
  }));
}

function seedZoneIds(value: string | undefined): string[] {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}
