import {
  corpusReport,
  syncCorpusOnce,
} from '../../corpus/sync.ts';
import { importGitHistory } from '../../corpus/git-import.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const CORPUS_COMMANDS: Record<string, CommandHandler> = {
  'corpus report': corpusReportCommand,
  'import git': importGitCommand,
  'sync once': syncOnceCommand,
};

function syncOnceCommand(args: CommandArgs): unknown {
  return syncCorpusOnce({
    rootDir: args.requiredFlag('--dir'),
    corpusPath: args.requiredFlag('--corpus'),
  });
}

function corpusReportCommand(args: CommandArgs): unknown {
  return corpusReport({
    corpusPath: args.dbPath,
  });
}

function importGitCommand(args: CommandArgs): unknown {
  return importGitHistory({
    repoPath: args.requiredFlag('--repo'),
    corpusPath: args.requiredFlag('--corpus'),
    limit: numberFlag(args.flagValue('--limit')),
  });
}

function numberFlag(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`expected positive integer: ${value}`);
  }
  return parsed;
}
