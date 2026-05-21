# Lyo

Lyo means **Learn Your Own**, in the spirit of "bring your own" systems: your
agents learn from your own prompts, runs, repos, commands, and outcomes.

Not memory. Not a workflow framework. Not a runtime guard.

Lyo is a learning ledger for agent attempts.

It keeps a local SQLite ledger of prompts, model calls, traces, preferences,
protocols, and outcomes so an agent can compare what happened, promote only
evidence-backed lessons, and deliver scoped guidance into future runs.

```text
attempt
-> model call
-> trace
-> preference or outcome
-> promoted protocol
-> scoped future overlay
-> later evidence
```

Lyo is not a full agent runtime, orchestrator, memory daemon, or workflow
template. The current package is the reducer/database core.

It does not call your LLM. It does not execute tools. It does not block tool
calls at runtime. Your agent loop, hooks, or adapters call Lyo to record
evidence and resolve scoped learning overlays.

## Why

An agent has not learned just because a note was saved.

For Lyo, learning means:

```text
something happened
-> evidence was recorded
-> a better behavior was identified
-> a scoped protocol was promoted
-> a future agent received it
-> later evidence showed whether behavior changed
```

That makes learning auditable. A lesson has provenance, scope, delivery, and
feedback instead of becoming vague memory.

## The Failure Mode

Without Lyo:

```text
Run 1: Agent makes a hook-contract mistake.
Run 2: User corrects the same mistake in another repo.
Run 3: Another session repeats it because the correction lived only in chat.
```

With Lyo:

```text
Run 1: Hook failure is recorded as evidence.
Run 2: Similar failure or preference pair supports a scoped protocol.
Run 3: Matching Codex hook receives the protocol as overlay context.
Run 4: Outcome records whether behavior changed.
```

The point is not to remember more text. The point is to change future behavior
under evidence.

## Core Loop

Lyo's current loop is intentionally small:

```text
Observe      record sessions, prompts, runs, model calls, hooks
Compare      record traces, preference pairs, outcomes, gaps
Promote      reject unsupported lessons; activate evidence-backed protocols
Deliver      resolve only scoped overlays for matching future work
Evaluate     record whether the delivered protocol helped
```

The package does not yet execute model comparisons itself. It can record the
pieces needed for that next layer: model calls, traces, preference pairs,
protocols, and outcomes.

## How It Differs

| Tool type | Primary job | Lyo's difference |
| --- | --- | --- |
| Memory system | Recall facts | Records attempts, preferences, protocols, and outcomes. |
| Workflow framework | Prescribe process | Stores evidence that a process change actually helped. |
| Runtime guard | Block bad calls now | Teaches future runs from what happened. |
| Knowledge graph | Link entities | Promotes scoped behavior changes from evidence. |
| Agent orchestrator | Assign work to agents | Sits underneath orchestration as a learning ledger. |

## Package

```sh
npm install lyo-kernel
```

For the CLI:

```sh
npm install -g lyo-kernel
lyo --help
```

Requires Node.js 24+ for `node:sqlite`.

## What Works Now

- Initialize a local SQLite ledger.
- Record Codex hook events.
- Record sessions, prompt boundaries, run starts, and run finishes.
- Record model/provider/token/cost usage.
- Record workspaces, zones, jobs, path activations, command activations, and
  deployment actions.
- Derive zone co-activations and association weights from a job.
- Record traces and preference pairs.
- Promote protocols only after evidence.
- Resolve scoped protocol overlays for future matching work.
- Record outcomes and simple adaptive credit.

Not mature yet:

- schema migrations
- automatic experiment branching
- automatic 2x1 / 3x1 / 2x2 model execution
- Claude or Emacs adapters
- stable API guarantees
- full event/fact substrate

## What Lyo Records

Lyo is centered on evidence that can later support or reject learning:

```text
sessions             which agent session was active
prompt boundaries    what prompt/response boundary was observed
model calls          provider, model, lane, tokens, cost, latency
runs                 task shape, channel, status, token cost
traces               observed behavior or output
preference pairs     chosen trace, rejected trace, reason, evidence
gaps                 explicit defects or missing behavior
protocols            scoped lessons that can be delivered later
deliveries           proof that a future run saw a protocol
outcomes             whether following the protocol helped
workspaces           repo/project roots being observed
zones                folders, modules, command surfaces, or deployment surfaces
jobs                 work-shaped units that may span one or more agent runs
activations          paths, commands, deployments, and zones that fired in a job
co-activations       zone pairs that fired together during a job
associations         accumulated co-activation evidence across jobs
```

Raw prompts are not stored in SQLite by default. Lyo records prompt hashes,
lengths, summaries, and optional file references. Local prompt blobs are only
written when a prompt directory is explicitly configured.

## Quick Start

Inside any repo or workspace where you want a local ledger:

```sh
lyo init --db .agent-learning/learning.sqlite
```

That creates:

```text
.agent-learning/learning.sqlite
```

Record a run:

```sh
lyo run-start \
  --db .agent-learning/learning.sqlite \
  --run-id run-1 \
  --task-shape local-dev \
  --channel agent.task

lyo run-finish \
  --db .agent-learning/learning.sqlite \
  --run-id run-1 \
  --status completed \
  --token-cost 1200
```

Record a model call:

```sh
lyo model-call record \
  --db .agent-learning/learning.sqlite \
  --provider openai \
  --model gpt-5.5 \
  --model-lane frontier \
  --prompt-ref .agent-learning/prompts/turn-1-user.txt \
  --input-tokens 1200 \
  --output-tokens 500 \
  --estimated-cost 0.04 \
  --latency-ms 8400 \
  --status completed
```

Inspect the ledger summary:

```sh
lyo report --db .agent-learning/learning.sqlite
```

Record a workspace activation tracer:

```sh
lyo workspace register \
  --db .agent-learning/learning.sqlite \
  --workspace-id nectr \
  --root . \
  --name nectr_data_eng

lyo zone add \
  --db .agent-learning/learning.sqlite \
  --workspace-id nectr \
  --zone-id core \
  --name core \
  --kind config \
  --path-glob 'nectr_data_eng_core/**'

lyo zone add \
  --db .agent-learning/learning.sqlite \
  --workspace-id nectr \
  --zone-id engineering \
  --name engineering \
  --kind domain \
  --path-glob 'nectr_data_engineering/**'

lyo job start \
  --db .agent-learning/learning.sqlite \
  --job-id REP-123 \
  --workspace-id nectr \
  --task-shape data-platform-change

lyo activate path \
  --db .agent-learning/learning.sqlite \
  --job-id REP-123 \
  --path nectr_data_eng_core/config.yml \
  --kind file_written

lyo activate path \
  --db .agent-learning/learning.sqlite \
  --job-id REP-123 \
  --path nectr_data_engineering/pipelines/foo.py \
  --kind file_written

lyo activation derive \
  --db .agent-learning/learning.sqlite \
  --job-id REP-123 \
  --outcome positive

lyo activation report \
  --db .agent-learning/learning.sqlite \
  --job-id REP-123
```

Activation reports include raw evidence and a compact `summary` grouped by:

```text
path kind and phase
repeated path events
command classification, status, phase, output size, and repeat count
deployment provider, environment, and status
activated zones, confidence, strength, and evidence refs
coactivation pairs
job-local association support counts
```

Zone association reports include both raw support and normalized support:

```sh
lyo zone associations \
  --db .agent-learning/learning.sqlite \
  --workspace-id nectr
```

The normalized fields are descriptive, not automatic policy:

```text
supportCount        raw co-activation count
successRate         positive / known outcomes
riskRate            negative / known outcomes
normalizedWeight    support / sqrt(left activations * right activations)
jaccardWeight       support / jobs that activated either zone
```

Run the built-in reducer demo:

```sh
lyo demo fixture-replay --db :memory:
```

Example report shape:

```text
LYO LEDGER REPORT
Sessions: 4
Model calls: 12
Preference pairs: 3
Active protocols: 2
Delivered overlays: 5
Estimated model cost: 0.42
Adaptive credit: 20
```

## Codex Hook

`lyo codex-hook` reads Codex hook JSON from stdin, records a redacted event,
records session/prompt/assistant boundaries where applicable, resolves matching
active protocols, and returns Codex-compatible JSON.

For a global Codex hook, prefer event-cwd storage:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "lyo codex-hook --db-from-event-cwd --prompt-dir-from-event-cwd",
            "statusMessage": "Recording learning event"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "lyo codex-hook --db-from-event-cwd --prompt-dir-from-event-cwd",
            "statusMessage": "Recording learning event"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "lyo codex-hook --db-from-event-cwd --prompt-dir-from-event-cwd",
            "statusMessage": "Recording learning event"
          }
        ]
      }
    ]
  }
}
```

With `--db-from-event-cwd`, one global hook writes each workspace to its own:

```text
<event.cwd>/.agent-learning/learning.sqlite
```

The hook does not store raw prompts or assistant messages in SQLite by default.
It records hashes, lengths, summaries, and optional file refs. Use
`--prompt-dir` or `--prompt-dir-from-event-cwd` only when local prompt blobs are
explicitly allowed.

## API

```ts
import {
  createKernel,
  initLedger,
  recordRun,
  finishRun,
  recordModelCall,
  recordTrace,
  recordPreferencePair,
  recordGap,
  proposeProtocol,
  promoteProtocol,
  resolveProtocol,
  recordOutcome,
  getObserverSummary,
} from 'lyo-kernel';

const kernel = createKernel({ dbPath: '.agent-learning/learning.sqlite' });
initLedger(kernel);

recordRun(kernel, {
  runId: 'run-1',
  taskShape: 'local-dev',
  channel: 'agent.task',
  status: 'started',
});

recordModelCall(kernel, {
  provider: 'openai',
  model: 'gpt-5.5',
  modelLane: 'frontier',
  promptRef: '.agent-learning/prompts/turn-1-user.txt',
  inputTokens: 1200,
  outputTokens: 500,
  estimatedCost: 0.04,
  latencyMs: 8400,
  status: 'completed',
});
```

## Reducer Model

Reducers are the grammar used to speak with the database. They are not just
insert helpers. They define permitted state transitions and reject unsupported
claims.

Current reducer surface:

- `recordSessionStarted`
- `recordPromptBoundary`
- `recordHookEvent`
- `recordModelCall`
- `recordRun`
- `finishRun`
- `recordTrace`
- `recordPreferencePair`
- `recordGap`
- `proposeProtocol`
- `promoteProtocol`
- `promoteProtocolFromPreferences`
- `resolveProtocol`
- `recordOutcome`

The current demo loop:

```text
run fails without fixture replay
-> gap is recorded
-> protocol is proposed
-> first promotion is rejected because evidence is insufficient
-> second matching gap supplies evidence
-> protocol becomes active
-> future matching run resolves the protocol
-> outcome records whether it helped
-> adaptive credit changes
```

The next intended loop is preference-backed:

```text
same or similar context
-> two traces are recorded
-> one trace is preferred over the other
-> preference evidence supports a protocol
-> future outcomes test whether the preference generalizes
```

## Design Direction

Lyo keeps SQLite as the local durable store, but the reducer grammar should not
be trapped too early by a rigid relational schema. Stable concepts can become
tables; emerging grammar should first be recorded as events/facts with JSON
payloads until repeated evidence proves the shape.

## Development

```sh
node --test
node scripts/pack-npm.mjs
```

Generated tarballs and staging files live under `dist/` and are ignored.
