import {
  getRunTapeView,
  recordRunTapeCell,
} from '../../reducers.ts';
import { runTapeCellKind } from '../coercion.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const TAPE_COMMANDS: Record<string, CommandHandler> = {
  'tape record': tapeRecordCommand,
  'tape view': tapeViewCommand,
};

function tapeRecordCommand(args: CommandArgs): unknown {
  const runId = args.requiredFlag('--run-id');
  return withKernel(args, (kernel) => {
    const payloadJson = args.flagValue('--payload-json');
    const cell = recordRunTapeCell(kernel, {
      runId,
      kind: runTapeCellKind(args.requiredFlag('--kind')),
      summary: args.requiredFlag('--summary'),
      evidenceRef: args.requiredFlag('--evidence-ref'),
      passed: parsePassed(args.flagValue('--passed')),
      payload: payloadJson === undefined ? undefined : JSON.parse(payloadJson),
    });
    return {
      ok: true,
      cell,
      view: getRunTapeView(kernel, { runId }),
    };
  });
}

function tapeViewCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    view: getRunTapeView(kernel, {
      runId: args.requiredFlag('--run-id'),
    }),
  }));
}

function parsePassed(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('--passed must be true or false');
}
