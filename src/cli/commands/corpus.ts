import {
  corpusReport,
  syncCorpusOnce,
} from '../../corpus/sync.ts';
import { importGitHistory } from '../../corpus/git-import.ts';
import { collectGitCorpusPool } from '../../corpus/pool.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const CORPUS_COMMANDS: Record<string, CommandHandler> = {
  'corpus report': corpusReportCommand,
  'import git': importGitCommand,
  'pool collect': poolCollectCommand,
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
    projectTag: args.flagValue('--tag') ?? null,
  });
}

function poolCollectCommand(args: CommandArgs): unknown {
  const sources = args.flagValues('--source');
  const tags = args.flagValues('--tag');
  if (sources.length === 0) throw new Error('expected at least one --source');
  if (sources.length !== tags.length) {
    throw new Error(`expected one --tag per --source, got ${sources.length} sources and ${tags.length} tags`);
  }
  return collectGitCorpusPool({
    poolPath: args.requiredFlag('--pool'),
    sources: sources.map((sourcePath, index) => ({
      sourcePath,
      tag: tags[index],
    })),
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
