import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { projectRoot, sessionHookAbsolutePath } from './init.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

// --- Config editing ---

export function buildHookBlock(): string {
  const root = projectRoot();
  const sessionHookPath = sessionHookAbsolutePath();
  const cliPath = join(root, 'src', 'cli.ts');
  const hookCmd = `node ${cliPath} claude-hook --db-from-event-cwd --spool-dir-from-event-cwd`;

  return [
    '# lyo-wrap-begin',
    '[[hooks]]',
    'event = "UserPromptSubmit"',
    `command = "node ${sessionHookPath}"`,
    'timeout = 5',
    '',
    '[[hooks]]',
    'event = "SessionStart"',
    `command = "${hookCmd}"`,
    'timeout = 10',
    '',
    '[[hooks]]',
    'event = "UserPromptSubmit"',
    `command = "${hookCmd}"`,
    'timeout = 10',
    '',
    '[[hooks]]',
    'event = "PreToolUse"',
    `command = "${hookCmd}"`,
    'timeout = 10',
    '',
    '[[hooks]]',
    'event = "PostToolUse"',
    `command = "${hookCmd}"`,
    'timeout = 10',
    '',
    '[[hooks]]',
    'event = "PostToolUseFailure"',
    `command = "${hookCmd}"`,
    'timeout = 10',
    '',
    '[[hooks]]',
    'event = "Stop"',
    `command = "${hookCmd}"`,
    'timeout = 10',
    '',
    '[[hooks]]',
    'event = "SessionEnd"',
    `command = "${hookCmd}"`,
    'timeout = 10',
    '# lyo-wrap-end',
  ].join('\n');
}

export function writeHooks(configPath: string): void {
  const block = buildHookBlock();
  let existing = '';
  if (existsSync(configPath)) {
    existing = readFileSync(configPath, 'utf8');
  }

  mkdirSync(dirname(configPath), { recursive: true });

  const markerRegex = /# lyo-wrap-begin[\s\S]*?# lyo-wrap-end[^\n]*/;
  let updated: string;
  if (markerRegex.test(existing)) {
    updated = existing.replace(markerRegex, block);
  } else {
    updated = existing;
    if (existing.length > 0 && !existing.endsWith('\n')) {
      updated += '\n';
    }
    if (updated.length > 0) {
      updated += '\n';
    }
    updated += block + '\n';
  }

  writeFileSync(configPath, updated, 'utf8');
}

export function removeHooks(configPath: string): void {
  if (!existsSync(configPath)) return;
  const content = readFileSync(configPath, 'utf8');
  if (!content.includes('# lyo-wrap-begin')) return;
  const markerRegex = /\n?# lyo-wrap-begin[\s\S]*?# lyo-wrap-end[^\n]*/g;
  const updated = content.replace(markerRegex, '').replace(/^\n+/, '').trimEnd();
  writeFileSync(configPath, updated + (updated.length > 0 ? '\n' : ''), 'utf8');
}

// --- Process launching ---

function launchKimi(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('kimi', [], {
      stdio: 'inherit',
      env: process.env,
    });

    // Catch missing binary — spawn emits 'error' if kimi isn't on PATH
    child.on('error', () => {
      reject(new Error('kimi not found. Install Kimi Code CLI first.'));
    });

    // Forward signals to the child process
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.on('SIGTERM', () => child.kill('SIGTERM'));

    child.on('exit', (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

// --- Command handlers ---

function kimiConfigPath(): string {
  return join(homedir(), '.kimi-code', 'config.toml');
}

async function wrapKimi(args: CommandArgs): Promise<void> {
  if (!existsSync(join(args.cwd, 'pipeline-config.json'))) {
    throw new Error(
      `No lyo workspace found in ${args.cwd}.\nRun 'awok init <folder>' first, then 'cd <folder>' and run 'awok wrap kimi'.`
    );
  }

  console.error('Verifying lyo workspace... ok');

  const configPath = kimiConfigPath();
  writeHooks(configPath);
  console.error(`Wiring 8 hooks into ${configPath}... ok`);

  console.error('Launching kimi...');
  const exitCode = await launchKimi();
  process.exit(exitCode);
}

function unwrapKimi(): unknown {
  const configPath = kimiConfigPath();
  removeHooks(configPath);
  return { ok: true };
}

export const WRAP_COMMANDS: Record<string, CommandHandler> = {
  'wrap kimi': wrapKimi,
  'unwrap kimi': unwrapKimi,
};
