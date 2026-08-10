import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeTelemetry } from '../../telemetry/contract.ts';
import { compileTelemetryArtifact } from '../../telemetry/compile.ts';
import {
  readShepherdExportFile,
  readTelemetryFile,
  summarizeTelemetry,
} from '../../telemetry/files.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const TELEMETRY_COMMANDS: Record<string, CommandHandler> = {
  'telemetry inspect': telemetryInspectCommand,
  'telemetry convert-shepherd': telemetryConvertShepherdCommand,
  'telemetry compile': telemetryCompileCommand,
};

function telemetryInspectCommand(args: CommandArgs): unknown {
  const path = resolve(args.cwd, args.requiredFlag('--file'));
  const events = readTelemetryFile(path);
  return {
    ok: true,
    path,
    schema: events[0]?.schema ?? 'lyo.telemetry.v1',
    summary: summarizeTelemetry(events),
  };
}

function telemetryConvertShepherdCommand(args: CommandArgs): unknown {
  const events = readShepherdExportFile(
    resolve(args.cwd, args.requiredFlag('--file')),
    args.requiredFlag('--run-id')
  );
  const output = resolve(args.cwd, args.requiredFlag('--output'));
  writeFileSync(output, encodeTelemetry(events), 'utf8');
  return {
    ok: true,
    output,
    summary: summarizeTelemetry(events),
  };
}

function telemetryCompileCommand(args: CommandArgs): unknown {
  const events = readTelemetryFile(resolve(args.cwd, args.requiredFlag('--file')));
  const compiled = compileTelemetryArtifact(events, args.flagValue('--run-id'));
  return {
    ok: true,
    runId: args.flagValue('--run-id') ?? events[0]?.runId ?? null,
    telemetry: {
      actions: compiled.actions,
      tokens: compiled.tokens,
      episodes: compiled.episodes,
    },
    semantic: compiled.semantic,
  };
}
