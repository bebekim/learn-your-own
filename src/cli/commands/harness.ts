import { deriveVerifierGatePolicyFromTapes } from '../../reducers.ts';
import type { ScopeKind } from '../../types/core.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const HARNESS_COMMANDS: Record<string, CommandHandler> = {
  'harness learn-verifier-gate': learnVerifierGateCommand,
};

function learnVerifierGateCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    learned: deriveVerifierGatePolicyFromTapes(kernel, {
      chosenRunId: args.requiredFlag('--chosen-run-id'),
      rejectedRunId: args.requiredFlag('--rejected-run-id'),
      protocolId: args.flagValue('--protocol-id'),
      scopeKind: scopeKind(args.flagValue('--scope-kind')),
      scopeValue: args.flagValue('--scope-value'),
      recordedBy: args.flagValue('--recorded-by') ?? 'harness-learning',
    }),
  }));
}

function scopeKind(value: string | undefined): ScopeKind | undefined {
  if (value === undefined) return undefined;
  if (value === 'worktree' || value === 'repository' || value === 'channel') return value;
  throw new Error(`unsupported scope kind: ${value}`);
}
