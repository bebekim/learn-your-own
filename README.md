# Agent Learning Reducer Kernel

Tiny local reducer kernel for evidence-backed agent learning experiments.

This package is not an agent, orchestrator, memory daemon, or workflow template.
It is a small grammar of permitted learning-state transitions backed by
SQLite.

```text
hook or adapter event
-> reducer call
-> SQLite state
-> future reducer/query/overlay
```

## Status

Prototype. The `0.1.x` line is intentionally unstable and local-first.

Current useful pieces:

- SQLite initialization through `learn init`.
- Codex hook event capture through `learn codex-hook`.
- Session, prompt-boundary, run-start, and run-finish recording.
- Model/provider/token/cost call logging through `learn model-call record`.
- Evidence-gated protocol promotion demo.
- Protocol resolution and outcome credit scoring.

Not yet mature:

- schema migrations
- Claude or Emacs adapters
- event/fact substrate implementation
- automatic gap interpretation
- durable grammar-change reducers
- stable API guarantees

## Install

```sh
npm install agent-learning-reducer-kernel
```

Requires Node.js 24+ for `node:sqlite`.

## CLI

```sh
learn init --db .agent-learning/learning.sqlite
learn codex-hook --db .agent-learning/learning.sqlite
learn session-start --db .agent-learning/learning.sqlite --session-id "$CODEX_SESSION_ID" --platform codex
learn run-start --db .agent-learning/learning.sqlite --run-id "run-1" --task-shape "local-dev" --channel "agent.task"
learn record-prompt --db .agent-learning/learning.sqlite --session-id "$CODEX_SESSION_ID" --role user --kind user_prompt --summary "sanitized prompt summary"
learn model-call record --db .agent-learning/learning.sqlite --provider openai --model gpt-5.5 --model-lane frontier --input-tokens 1200 --output-tokens 500 --estimated-cost 0.04 --latency-ms 8400 --status completed
learn run-finish --db .agent-learning/learning.sqlite --run-id "run-1" --status completed
learn report --db .agent-learning/learning.sqlite
learn demo fixture-replay --db :memory:
```

## API

```ts
import {
  createKernel,
  initLedger,
  recordRun,
  recordGap,
  proposeProtocol,
  promoteProtocol,
  resolveProtocol,
  recordOutcome,
  recordModelCall,
  getModelCallSummary,
  getCredit,
} from 'agent-learning-reducer-kernel';

const kernel = createKernel({ dbPath: '.agent-learning/learning.sqlite' });
initLedger(kernel);

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

The current small grammar includes:

- `recordSessionStarted`
- `recordPromptBoundary`
- `recordModelCall`
- `recordRun`
- `finishRun`
- `recordGap`
- `proposeProtocol`
- `promoteProtocol`
- `resolveProtocol`
- `recordOutcome`

The demo loop is:

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

## Event/Fact Direction

The reducer grammar should evolve. A fixed relational schema is too narrow as
the only learning substrate, because early lessons often reveal facts the
current grammar cannot express yet.

SQLite stays as the local durable store, but the durable core should become an
append-only event/fact store:

```text
reducer call
-> event/fact row with reducer name, grammar version, subject, and JSON payload
-> relational projection for stable, query-heavy concepts
```

Tables such as `agent_sessions`, `session_prompts`, `runs`, `protocols`, and
`outcomes` should be treated as stable projections, not the only truth. New
grammar should start as flexible recorded facts, then graduate into typed
reducers, indexed columns, and invariants after repeated evidence proves the
distinction matters.

## Codex Hook

`learn codex-hook` reads Codex hook JSON from stdin, records a redacted event,
records session/prompt/assistant boundaries where applicable, resolves matching
active protocols, and returns Codex-compatible JSON.

Example:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "learn codex-hook --db-from-event-cwd --prompt-dir-from-event-cwd",
            "statusMessage": "Recording learning event"
          }
        ]
      }
    ]
  }
}
```

For a global Codex hook, prefer `--db-from-event-cwd` and
`--prompt-dir-from-event-cwd`. That keeps one hook installed in Codex while
writing each workspace to its own `.agent-learning/learning.sqlite`.

The hook adapter does not store raw prompts or assistant messages in SQLite by
default. It records hashes, lengths, summaries, and optional file refs. Use
`--prompt-dir` only when local prompt blobs are explicitly allowed.

## Development

```sh
node --test
node scripts/pack-npm.mjs
```

Generated tarballs and staging files live under `dist/` and are ignored.

## Future Work
