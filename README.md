# Lyo

Lyo means **Learn Your Own**.

It is a local learning ledger for AI-agent work. It records what happened in
your own prompts, runs, repos, commands, verifiers, and outcomes so future runs
can receive scoped, evidence-backed guidance.

Lyo is not an agent runtime, memory daemon, workflow framework, or permission
guard. It does not call your LLM, execute tools, or block tools. Hooks,
adapters, CLIs, and agent loops call Lyo to record evidence and ask what has
been learned.

```text
attempt
-> trace
-> verifier / preference / outcome
-> scoped lesson candidate
-> future delivery
-> later evidence
```

## Why

An agent has not learned just because a note was saved.

For Lyo, learning means a behavior change is backed by evidence:

```text
something happened
-> evidence was recorded
-> a better behavior was identified
-> a scoped artifact was promoted or tested
-> a future run received it
-> later evidence showed whether behavior changed
```

The point is not to remember more text. The point is to change future behavior
under provenance, scope, delivery, and feedback.

## Current Package

```sh
npm install lyo-kernel
```

For the CLI:

```sh
npm install -g lyo-kernel
lyo --help
```

Requires Node.js 24+ for `node:sqlite`.

Current package version: `0.2.1`.

## What Works Now

- Local SQLite ledger initialization.
- Codex and Claude hook capture.
- Session, prompt, run, model-call, trace, preference, gap, protocol, delivery,
  and outcome records.
- Verifier-gated run tape reducers.
- Workspace, zone, job, path, command, deployment, co-activation, and association
  records.
- Compiler frontend for telemetry:
  `raw hooks -> NormalizedAction -> tokens -> episodes -> effect summaries`.
- Deterministic command/action classification for common inspect, edit, test,
  build, git, package, cloud, and external command families.
- Read-only effect reports and corpus audits.
- Workflow-style reports for prompt-driven, manually orchestrated,
  loop-assisted, and loop-driven traces.
- Candidate at-bat reports for evidence-producing AI-assisted interview loops.
- Dry-run semantic lowering and cybernetic experiment reports.

Not mature yet:

- stable API guarantees;
- schema migrations;
- complete command coverage;
- subagent/child-process lineage;
- append-only persistence for learned compiler artifacts;
- automatic benchmark/replay orchestration.

## Core Commands

Initialize a ledger:

```sh
lyo init --db .agent-learning/learning.sqlite
```

Record a run goal:

```sh
lyo context goal \
  --db .agent-learning/learning.sqlite \
  --run-id run-1 \
  --goal "Fix the failing local test" \
  --success-criteria "The targeted test passes"
```

Inspect the ledger:

```sh
lyo report --db .agent-learning/learning.sqlite
```

Inspect one run as a trace/effect report:

```sh
lyo report --db .agent-learning/learning.sqlite --effects --run-id turn-1
```

Inspect one run as a workflow-style report:

```sh
lyo report --db .agent-learning/learning.sqlite --style --run-id turn-1
```

Learn style candidates across local telemetry without writing artifacts. The
default output is compact; add `--verbose` if you need every evidence run ID:

```sh
lyo learn style --db .agent-learning/learning.sqlite
```

Compare baseline, treatment, and variant runs in a controlled learning
experiment:

```sh
lyo experiment \
  --db .agent-learning/learning.sqlite \
  --family-id lyo-compiler-classifier-v1 \
  --baseline-run-id <A0-run-id> \
  --treatment-run-id <A1-run-id> \
  --variant-run-id <A2-run-id> \
  --artifact verifier:compiler-frontend \
  --association-edge "src/compiler/** -> tests/compiler-frontend.test.js"
```

Audit existing local ledgers:

```sh
lyo audit --dir ~/repositories
```

For the full CLI surface:

```sh
lyo --help
```

## Hooks

Codex hook capture:

```sh
lyo codex-hook \
  --db-from-event-cwd \
  --prompt-dir-from-event-cwd \
  --spool-dir-from-event-cwd
```

Claude hook capture:

```sh
lyo claude-hook \
  --db-from-event-cwd \
  --prompt-dir-from-event-cwd \
  --spool-dir-from-event-cwd
```

The preferred hook mode is spool-first:

```text
hook event
-> .agent-learning/hook-spool/incoming/*.json
-> Stop hook or lyo normalize hooks drains the spool
-> hook_events
-> normalized facts
```

Manual catch-up:

```sh
lyo normalize hooks \
  --db .agent-learning/learning.sqlite \
  --spool-dir .agent-learning/hook-spool
```

Raw prompts are not stored in SQLite by default. Lyo records prompt hashes,
lengths, summaries, and optional file refs. Use prompt directories only when
local prompt blobs are explicitly allowed.

## Concepts

| Concept | Role |
| --- | --- |
| `run` | Goal-shaped attempt with status and outcome. |
| `turn` | Hook/conversation boundary where the agent acted. |
| `trace` | Observed behavior or output. |
| `tape` | Verifier-gated reducer grammar for a run loop. |
| `protocol` | Scoped lesson candidate or promoted guidance. |
| `delivery` | Evidence that future work received guidance. |
| `outcome` | Later evidence that guidance helped or failed. |
| `NormalizedAction` | Compiler action with operation, intent, resources, risk, status, and facets. |
| `effect summary` | Folded reads, writes, commands, and ordered evidence refs. |
| `experiment` | Baseline/treatment/variant comparison for testing a learning artifact. |

## API

```ts
import {
  createKernel,
  initLedger,
  recordRun,
  recordModelCall,
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
  inputTokens: 1200,
  outputTokens: 500,
  status: 'completed',
});

console.log(getObserverSummary(kernel));
```

## Documentation

- [Deterministic Classification](docs/deterministic-classification.md)
- [Style Learning](docs/style-learning.md)
- [Cybernetic Association Learner](docs/cybernetic-association-learner.md)
- [Cybernetic Learning Experiment Protocol](docs/cybernetic-learning-experiment-protocol.md)
- [Product Learning Log](docs/product-learning-log.md)
- [Candidate At-Bat Telemetry Spec](docs/candidate-at-bat-telemetry-spec.md)
- [Candidate At-Bat Implementation PRD](issues/candidate-at-bat-prd.md)

## Development

```sh
npm run typecheck
npm test
node scripts/pack-npm.mjs
```

Generated tarballs and staging files live under `dist/` and are ignored.
