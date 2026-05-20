#!/usr/bin/env node
import {
  createKernel,
  finishRun,
  getObserverSummary,
  handleCodexHook,
  initLedger,
  recordModelCall,
  recordPromptBoundary,
  recordRun,
  recordSessionStarted,
  runFixtureReplayDemo,
} from './index.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function usage(exitCode = 0): never {
  console.log(`Usage:
	  learn init [--db path]
	  learn codex-hook [--db path] [--db-from-event-cwd] [--channel name] [--prompt-dir path] [--prompt-dir-from-event-cwd]
	  learn session-start [--db path] --session-id id [--repo-path path] [--platform name] [--model name]
	  learn record-prompt [--db path] --session-id id --role role [--kind kind] [--prompt-file path] [--summary text] [--response text] [--model name]
	  learn model-call record [--db path] --provider name --model name --model-lane lane [--call-id id] [--session-id id] [--run-id id] [--prompt-file path] [--prompt-ref path] [--summary text] [--input-tokens n] [--output-tokens n] [--total-tokens n] [--estimated-cost n] [--latency-ms n] [--status started|completed|failed]
	  learn run-start [--db path] --run-id id --task-shape shape --channel channel [--status status] [--token-cost n]
	  learn run-finish [--db path] --run-id id [--status status] [--token-cost n]
	  learn report [--db path]
	  learn demo fixture-replay [--db path]

	Environment:
	  LEARNLOOP_DB       Default SQLite path. Defaults to .agent-learning/learning.sqlite
	  LEARNLOOP_CHANNEL  Optional channel override for hook overlay resolution
	  LEARNLOOP_PROMPT_DIR Optional directory for hook prompt blobs`);
  process.exit(exitCode);
}

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

const [, , command, subcommand] = process.argv;
const dbPath = flagValue('--db') ?? process.env.LEARNLOOP_DB ?? '.agent-learning/learning.sqlite';
const channel = flagValue('--channel') ?? process.env.LEARNLOOP_CHANNEL;
const promptDir = flagValue('--prompt-dir') ?? process.env.LEARNLOOP_PROMPT_DIR;

try {
  if (!command || command === '--help' || command === '-h') {
    usage(0);
  }

  if (command === 'init') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({ ok: true, dbPath });
  } else if (command === 'codex-hook') {
    const input = await readStdin();
    const event = input.trim() ? JSON.parse(input) : {};
    const eventCwd = typeof event.cwd === 'string' && event.cwd ? event.cwd : process.cwd();
    const effectiveDbPath = hasFlag('--db-from-event-cwd')
      ? join(eventCwd, '.agent-learning', 'learning.sqlite')
      : dbPath;
    const effectivePromptDir = hasFlag('--prompt-dir-from-event-cwd')
      ? join(eventCwd, '.agent-learning', 'prompts')
      : promptDir;
    const kernel = createKernel({ dbPath: effectiveDbPath });
    initLedger(kernel);
    print(handleCodexHook(kernel, event, { channel, promptDir: effectivePromptDir }));
  } else if (command === 'session-start') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      session: recordSessionStarted(kernel, {
        sessionId: requiredFlag('--session-id'),
        workspaceScope: flagValue('--workspace-scope') ?? 'local',
        repoPath: flagValue('--repo-path') ?? process.cwd(),
        branch: flagValue('--branch'),
        platform: flagValue('--platform') ?? 'agent',
        model: flagValue('--model') ?? null,
      }),
    });
  } else if (command === 'record-prompt') {
    const promptFile = flagValue('--prompt-file');
    const promptText = promptFile ? readFileSync(promptFile, 'utf8') : undefined;
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      prompt: recordPromptBoundary(kernel, {
        sessionId: requiredFlag('--session-id'),
        runId: flagValue('--run-id') ?? null,
        turnId: flagValue('--turn-id') ?? null,
        role: requiredFlag('--role'),
        kind: flagValue('--kind') ?? 'user_prompt',
        promptText,
        promptRef: promptFile,
        summary: flagValue('--summary'),
        responseSummary: flagValue('--response'),
        model: flagValue('--model') ?? null,
      }),
    });
  } else if (command === 'model-call' && subcommand === 'record') {
    const promptFile = flagValue('--prompt-file');
    const promptText = promptFile ? readFileSync(promptFile, 'utf8') : undefined;
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      modelCall: recordModelCall(kernel, {
        callId: flagValue('--call-id'),
        sessionId: flagValue('--session-id') ?? null,
        runId: flagValue('--run-id') ?? null,
        provider: requiredFlag('--provider'),
        model: requiredFlag('--model'),
        modelLane: requiredFlag('--model-lane'),
        promptRef: flagValue('--prompt-ref') ?? promptFile ?? null,
        promptText,
        promptHash: flagValue('--prompt-hash') ?? null,
        promptSummary: flagValue('--summary') ?? null,
        inputTokens: optionalNumber('--input-tokens'),
        outputTokens: optionalNumber('--output-tokens'),
        totalTokens: optionalNumber('--total-tokens'),
        estimatedCost: optionalNumber('--estimated-cost'),
        latencyMs: optionalNumber('--latency-ms'),
        status: flagValue('--status') ?? 'completed',
        errorSummary: flagValue('--error') ?? null,
      }),
    });
  } else if (command === 'run-start') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      run: recordRun(kernel, {
        runId: requiredFlag('--run-id'),
        taskShape: requiredFlag('--task-shape'),
        channel: requiredFlag('--channel'),
        status: flagValue('--status') ?? 'started',
        tokenCost: Number(flagValue('--token-cost') ?? 0),
      }),
    });
  } else if (command === 'run-finish') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      run: finishRun(kernel, {
        runId: requiredFlag('--run-id'),
        status: flagValue('--status') ?? 'completed',
        tokenCost: flagValue('--token-cost') === undefined ? undefined : Number(flagValue('--token-cost')),
      }),
    });
  } else if (command === 'report') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({ ok: true, ...getObserverSummary(kernel) });
  } else if (command === 'demo' && subcommand === 'fixture-replay') {
    print(runFixtureReplayDemo({ dbPath }));
  } else {
    usage(1);
  }
} catch (error) {
  print({
    ok: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  });
  process.exit(1);
}

function requiredFlag(name: string): string {
  const value = flagValue(name);
  if (!value) throw new Error(`missing required flag: ${name}`);
  return value;
}

function optionalNumber(name: string): number | null {
  const value = flagValue(name);
  return value === undefined ? null : Number(value);
}
