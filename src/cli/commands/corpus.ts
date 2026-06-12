import {
  corpusReport,
  syncCorpusOnce,
} from '../../corpus/sync.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const CORPUS_COMMANDS: Record<string, CommandHandler> = {
  'corpus report': corpusReportCommand,
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
