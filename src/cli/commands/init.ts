import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandArgs, CommandHandler } from './context.ts';
import { closeKernel, createKernel } from '../../ledger.ts';
import { initLedger } from '../../schema.ts';

export const INIT_COMMANDS: Record<string, CommandHandler> = {
  init: initCommand,
};

const SPEC_TEMPLATE = `# Spec

## Signatures

## Desired behavior

## Acceptance criteria

## Non-goals

## Environment

## Edge cases
`;

const PLAN_TEMPLATE = {
  version: 'lyo.plan.v1',
  planId: 'plan-initial',
  specRef: { path: 'spec.md', sha256: '' },
  stages: [],
};

const PIPELINE_CONFIG_TEMPLATE = {
  dbPath: '.agent-learning/learning.sqlite',
  lessonsDir: 'lessons/',
  runsRoot: 'runs/',
  channel: 'claude',
};

export function projectRoot(): string {
  // init.ts is at <root>/src/cli/commands/init.ts — go up 4 levels to <root>/
  return dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
}

export function sessionHookAbsolutePath(): string {
  return join(projectRoot(), 'src', 'lyo', 'selection', 'session-hook.ts');
}

function writeFileSafe(filePath: string, content: string): void {
  if (existsSync(filePath)) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function initWorkspace(folderPath: string): { ok: true; path: string; created: string[] } {
  const created: string[] = [];
  const hookPath = sessionHookAbsolutePath();

  const claudeSettings = JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: `node ${hookPath}`,
              },
            ],
          },
        ],
      },
    },
    null,
    2
  );

  // Directories
  for (const dir of ['.agent-learning', 'artifacts', 'lessons', 'runs', '.claude']) {
    const dirPath = join(folderPath, dir);
    mkdirSync(dirPath, { recursive: true });
    created.push(dir + '/');
  }

  // SQLite DB
  const dbPath = join(folderPath, '.agent-learning', 'learning.sqlite');
  const kernel = createKernel({ dbPath });
  initLedger(kernel);
  closeKernel(kernel);
  created.push('.agent-learning/learning.sqlite');

  // .claude/settings.json
  writeFileSafe(join(folderPath, '.claude', 'settings.json'), claudeSettings);
  created.push('.claude/settings.json');

  // spec.md
  writeFileSafe(join(folderPath, 'spec.md'), SPEC_TEMPLATE);
  created.push('spec.md');

  // plan.json
  writeFileSafe(join(folderPath, 'plan.json'), JSON.stringify(PLAN_TEMPLATE, null, 2) + '\n');
  created.push('plan.json');

  // pipeline-config.json
  writeFileSafe(join(folderPath, 'pipeline-config.json'), JSON.stringify(PIPELINE_CONFIG_TEMPLATE, null, 2) + '\n');
  created.push('pipeline-config.json');

  return { ok: true, path: folderPath, created };
}

function initCommand(args: CommandArgs): unknown {
  const folderName = args.subcommand;
  if (folderName && !folderName.startsWith('-')) {
    // Full workspace init
    const targetPath = isAbsolute(folderName) ? folderName : join(args.cwd, folderName);
    return initWorkspace(targetPath);
  }
  // Legacy: just create the DB
  const kernel = createKernel({ dbPath: args.dbPath });
  try {
    initLedger(kernel);
    return { ok: true, dbPath: args.dbPath };
  } finally {
    closeKernel(kernel);
  }
}
