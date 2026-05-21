#!/usr/bin/env node
import {
  createKernel,
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
  finishJob,
  finishRun,
  getJobActivationReport,
  getObserverSummary,
  getZoneAssociationReport,
  handleCodexHook,
  initLedger,
  normalizeHooks,
  recordCommandActivation,
  recordDeploymentAction,
  recordJob,
  recordModelCall,
  recordPathActivation,
  recordPromptBoundary,
  recordRun,
  recordSessionStarted,
  recordWorkspace,
  recordZone,
  runFixtureReplayDemo,
  updateZoneAssociationsFromJob,
} from './index.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function usage(exitCode = 0): never {
  console.log(`Usage:
	  lyo init [--db path]
	  lyo codex-hook [--db path] [--db-from-event-cwd] [--channel name] [--prompt-dir path] [--prompt-dir-from-event-cwd] [--workspace-id id] [--no-normalize-on-stop]
	  lyo session-start [--db path] --session-id id [--repo-path path] [--platform name] [--model name]
	  lyo record-prompt [--db path] --session-id id --role role [--kind kind] [--prompt-file path] [--summary text] [--response text] [--model name]
	  lyo model-call record [--db path] --provider name --model name --model-lane lane [--call-id id] [--session-id id] [--run-id id] [--prompt-file path] [--prompt-ref path] [--summary text] [--input-tokens n] [--output-tokens n] [--total-tokens n] [--estimated-cost n] [--latency-ms n] [--status started|completed|failed]
	  lyo run-start [--db path] --run-id id --task-shape shape --channel channel [--status status] [--token-cost n]
	  lyo run-finish [--db path] --run-id id [--status status] [--token-cost n]
	  lyo workspace register [--db path] --root path [--workspace-id id] [--name name]
	  lyo zone add [--db path] --workspace-id id --name name --kind kind [--zone-id id] [--parent-zone-id id] [--path-glob glob] [--description text]
	  lyo job start [--db path] --job-id id --workspace-id id [--run-id id] [--task-shape shape] [--summary text] [--source-ref ref]
	  lyo job finish [--db path] --job-id id [--status completed|failed|cancelled|unknown] [--derive] [--outcome positive|negative|unknown]
	  lyo activate path [--db path] --job-id id --path path --kind kind [--run-id id] [--evidence-ref ref] [--confidence low|medium|high]
	  lyo activate command [--db path] --job-id id --command-name name [--argv text] [--argv-summary text] [--classification class] [--status status] [--run-id id] [--evidence-ref ref]
	  lyo activate deployment [--db path] --job-id id --command-id id [--provider name] [--environment env] [--target target] [--status status] [--evidence-ref ref]
	  lyo normalize hooks [--db path] [--workspace-id id] [--outcome positive|negative|unknown] [--limit n]
	  lyo activation derive [--db path] --job-id id [--outcome positive|negative|unknown]
	  lyo activation report [--db path] --job-id id
	  lyo zone associations [--db path] --workspace-id id [--zone-id id] [--limit n]
	  lyo report [--db path]
	  lyo demo fixture-replay [--db path]

	Environment:
	  LEARNLOOP_DB       Default SQLite path. Defaults to .agent-learning/learning.sqlite
	  LEARNLOOP_CHANNEL  Optional channel override for hook overlay resolution
	  LEARNLOOP_PROMPT_DIR Optional directory for hook prompt blobs
	  LEARNLOOP_NORMALIZE_ON_STOP Set to 0 to disable Stop-hook normalization`);
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
    print(handleCodexHook(kernel, event, {
      channel,
      promptDir: effectivePromptDir,
      normalizeOnStop: !hasFlag('--no-normalize-on-stop') && process.env.LEARNLOOP_NORMALIZE_ON_STOP !== '0',
      normalizeWorkspaceId: flagValue('--workspace-id'),
      normalizeOutcome: normalizeOutcome(flagValue('--outcome')),
    }));
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
  } else if (command === 'workspace' && subcommand === 'register') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      workspace: recordWorkspace(kernel, {
        workspaceId: flagValue('--workspace-id'),
        rootPath: requiredFlag('--root'),
        name: flagValue('--name'),
      }),
    });
  } else if (command === 'zone' && subcommand === 'add') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      zone: recordZone(kernel, {
        zoneId: flagValue('--zone-id'),
        workspaceId: requiredFlag('--workspace-id'),
        parentZoneId: flagValue('--parent-zone-id') ?? null,
        zoneKind: requiredFlag('--kind'),
        pathGlob: flagValue('--path-glob') ?? null,
        name: requiredFlag('--name'),
        description: flagValue('--description') ?? null,
      }),
    });
  } else if (command === 'job' && subcommand === 'start') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      job: recordJob(kernel, {
        jobId: requiredFlag('--job-id'),
        workspaceId: requiredFlag('--workspace-id'),
        runId: flagValue('--run-id') ?? null,
        taskShape: flagValue('--task-shape') ?? null,
        summary: flagValue('--summary') ?? null,
        sourceRef: flagValue('--source-ref') ?? null,
        status: 'started',
      }),
    });
  } else if (command === 'job' && subcommand === 'finish') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    const job = finishJob(kernel, {
      jobId: requiredFlag('--job-id'),
      status: flagValue('--status') ?? 'completed',
    });
    let derived = null;
    if (hasFlag('--derive')) {
      derived = deriveActivationState(kernel, job.jobId, flagValue('--outcome') ?? 'unknown');
    }
    print({ ok: true, job, derived });
  } else if (command === 'activate' && subcommand === 'path') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      pathActivation: recordPathActivation(kernel, {
        jobId: requiredFlag('--job-id'),
        runId: flagValue('--run-id') ?? null,
        path: requiredFlag('--path'),
        activationKind: flagValue('--kind') ?? 'unknown',
        evidenceRef: flagValue('--evidence-ref') ?? null,
        confidence: flagValue('--confidence') ?? 'medium',
      }),
    });
  } else if (command === 'activate' && subcommand === 'command') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      commandActivation: recordCommandActivation(kernel, {
        jobId: requiredFlag('--job-id'),
        runId: flagValue('--run-id') ?? null,
        commandName: requiredFlag('--command-name'),
        commandFamily: flagValue('--command-family') ?? null,
        workingDirectory: flagValue('--working-directory') ?? null,
        argv: flagValue('--argv') ?? null,
        argvHash: flagValue('--argv-hash') ?? null,
        argvSummary: flagValue('--argv-summary') ?? null,
        classification: flagValue('--classification') ?? undefined,
        evidenceRef: flagValue('--evidence-ref') ?? null,
        status: flagValue('--status') ?? 'attempted',
      }),
    });
  } else if (command === 'activate' && subcommand === 'deployment') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      deploymentAction: recordDeploymentAction(kernel, {
        jobId: requiredFlag('--job-id'),
        commandId: requiredFlag('--command-id'),
        provider: flagValue('--provider') ?? null,
        environment: flagValue('--environment') ?? null,
        target: flagValue('--target') ?? null,
        status: flagValue('--status') ?? 'attempted',
        evidenceRef: flagValue('--evidence-ref') ?? null,
      }),
    });
  } else if (command === 'normalize' && subcommand === 'hooks') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      ...normalizeHooks(kernel, {
        workspaceId: flagValue('--workspace-id'),
        outcome: normalizeOutcome(flagValue('--outcome')),
        limit: optionalNumber('--limit') ?? undefined,
      }),
    });
  } else if (command === 'activation' && subcommand === 'derive') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      ...deriveActivationState(kernel, requiredFlag('--job-id'), flagValue('--outcome') ?? 'unknown'),
    });
  } else if (command === 'activation' && subcommand === 'report') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      ...getJobActivationReport(kernel, { jobId: requiredFlag('--job-id') }),
    });
  } else if (command === 'zone' && subcommand === 'associations') {
    const kernel = createKernel({ dbPath });
    initLedger(kernel);
    print({
      ok: true,
      associations: getZoneAssociationReport(kernel, {
        workspaceId: requiredFlag('--workspace-id'),
        zoneId: flagValue('--zone-id'),
        limit: optionalNumber('--limit') ?? 20,
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

function normalizeOutcome(value: string | undefined): 'positive' | 'negative' | 'unknown' {
  return value === 'positive' || value === 'negative' ? value : 'unknown';
}

function deriveActivationState(kernel: ReturnType<typeof createKernel>, jobId: string, outcome: string): object {
  const zoneActivations = deriveZoneActivationsForJob(kernel, { jobId });
  const zoneCoactivations = deriveZoneCoactivationsForJob(kernel, { jobId });
  const associations = updateZoneAssociationsFromJob(kernel, {
    jobId,
    outcome: outcome === 'positive' || outcome === 'negative' ? outcome : 'unknown',
  });
  return { zoneActivations, zoneCoactivations, associations };
}
