# Lyo

Lyo means **Learn Your Own**.

Lyo treats learning as inference over a graph of explanations.
Learning is not remembering; it is updating belief over explanations, changing
future behavior, then testing whether that behavior improves outcomes.

To enable this, Lyo is a local learning ledger for AI-agent work. It records what happened in
your own prompts, runs, repos, commands, verifiers, and outcomes so future runs
can receive scoped, evidence-backed guidance.



```text
attempt
-> trace
-> verifier / preference / outcome
-> association conjecture
-> explanation-graph belief update
-> scoped lesson candidate
-> future delivery
-> later evidence
```

## Why

An agent has not learned just because a note was saved.

For Lyo, learning means a behavior change is backed by explanation-aware
evidence:

```text
something happened
-> evidence was recorded
-> an association conjecture was proposed
-> rivals, defeaters, scope, chronology, and freshness were checked
-> provisional belief changed
-> a scoped artifact was promoted or tested
-> a future run received it
-> later evidence showed whether behavior changed
```

The point is not to remember more text or count co-occurrences. Co-occurrence
only proposes a hypothesis. Lyo should learn by asking whether an observation
actually bears on that hypothesis after rival explanations, defeaters,
chronology, freshness, and scope are represented.

In short:

```text
association is hypothesis generation
learning is inference over explanations plus intervention and feedback
```

Lyo's working model of agentic software engineering is:

```text
intent
-> agent/user policy
-> actions and effects
-> verification
-> explanation-aware belief update
-> future context or artifact delivery
-> later evidence
```

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

Current package version: `0.3.0`.

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
- LYO lesson store, selection policies, reflector policies, model-inversion
  routing, failure classification, and session-start lesson injection.
- Eval task fixtures, split validation, offline lesson replay, learned
  verifier rules, local baseline episode rows, and eval report/gate logic.
- Dry-run semantic lowering.
- **Blind pipeline**: spec-first artifact contract (`lyo.spec.v1`, `lyo.plan.v1`
  and friends), static blindness checking, sandboxed code-writer/test-writer
  stages (Upstage, OpenRouter, Kimi CLI executors), deterministic `node --test`
  verification, aggregate-only feedback rounds, and per-round evidence
  preservation with token/cost accounting.
- **Learning loop**: trace consumption with deterministic + LLM judging,
  falsifiability-gated lesson admission, sequential likelihood-ratio trust
  gates, Thompson-sampled lesson delivery with vehicles
  (prose / skeleton-patch / spec-constraint), outcome credit assignment, and
  demotion of harmful lessons.
- **Bridge to real work**: night-shift markdown spec compilation to
  `spec.json` + `plan.json`, and verifier-gated apply of code artifacts into
  working trees.
- Hook adapters for five agent harnesses: Kimi Code CLI, Codex, Gemini CLI,
  Antigravity CLI, and Deep Agents Code.

Not mature yet:

- stable API guarantees;
- schema migrations;
- complete command coverage;
- subagent/child-process lineage;
- append-only persistence for learned compiler artifacts;
- full external-agent benchmark orchestration across Codex, Claude, and Kimi.

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

Validate the frozen eval task set:

```sh
lyo eval validate
```

Run a zero-cost offline replay from a recorded trace into the lesson store:

```sh
lyo eval replay \
  --db .agent-learning/lyo-lessons.sqlite \
  --trace traces/replay.json \
  --seed 1
```

Run a local baseline episode from one eval task. This executes only the task's
declared verifier command and records a comparable episode row:

```sh
lyo eval run-local \
  --task eval/tasks/lyo-cli-command-registry.json \
  --baseline B0 \
  --model local \
  --harness local-shell
```

Generate an eval report and rule gate decision from episode rows:

```sh
lyo eval report \
  --episodes episodes.json \
  --baseline B0 \
  --treatment B4 \
  --rule-id rule_123 \
  --markdown
```

Audit existing local ledgers:

```sh
lyo audit --dir ~/repositories
```

Collect scattered repo-local ledgers into a personal local corpus:

```sh
lyo sync once --dir ~/repositories --corpus ~/.lyo/corpus.sqlite --json
```

The sync imports source runs and hook events, then materializes normalized
`corpus_actions` and run-level `corpus_effects` using the same effect algebra as
single-run reports.

Inspect the local corpus:

```sh
lyo corpus report --db ~/.lyo/corpus.sqlite --json
```

Import committed OSS/project history into dedicated git corpus tables:

```sh
lyo import git --repo ~/repositories/oss/requests --corpus ~/.lyo/corpus.sqlite --limit 500 --json
```

Git imports are weak evidence from committed history only. They store commit,
file, hunk, and primitive change-token rows separately from native hook
telemetry so later motif discovery can compare both sources without pretending
git history captured prompts or local verifier loops.

For the full CLI surface:

```sh
lyo --help
```

## Blind Pipeline

Two LLMs write code and tests from the same specification without ever seeing
each other's work. Blindness is enforced structurally (sandboxed reads,
tool-less single-shot stages), the verifier is deterministic `node --test`,
and a learning loop judges disagreements and promotes lessons into future
runs.

From a night-shift markdown spec to applied, verified code:

```sh
# 1. Any night-shift markdown spec becomes pipeline artifacts
lyo pipeline init --spec ~/repositories/work/nectr-crm/Specs/05-something.md --task-dir .pipeline/something

# 2. The blind split runs
lyo pipeline run --plan .pipeline/something/plan.json --runs-root .pipeline/something/runs --lessons ~/.agent-learning/lessons

# 3. Verified output lands in the repo (only if the verifier passed)
lyo pipeline apply --run .pipeline/something/runs/<run-id> --target ~/repositories/work/nectr-crm
```

Learning over a batch of runs:

```sh
lyo pipeline learn --run .pipeline/something/runs/<run-id>[,<run-id-2>] --library ~/.agent-learning/lessons
lyo pipeline compare --baseline <run-dir> --treatment <run-dir>
lyo pipeline proposals --run <run-dir>
```

Every run emits content-hashed artifacts (`plan`, `spec`, code/test manifests,
verifier report, trace with token/cost usage) under the run directory, so each
round is fully reconstructible.

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

Gemini CLI hook capture:

```sh
lyo gemini-hook \
  --db-from-event-cwd \
  --spool-dir-from-event-cwd
```

Antigravity CLI hook capture (the event name travels as an argument):

```sh
lyo agy-hook <PreInvocation|PostInvocation|PreToolUse|PostToolUse|Stop> \
  --db-from-event-cwd \
  --spool-dir-from-event-cwd
```

Deep Agents Code hook capture:

```sh
lyo dcode-hook \
  --db-from-event-cwd \
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
| `lesson` | Grounded behavioral hypothesis with selection, application, and outcome counters. |
| `learned_rule` | Mutable data program interpreted by the fixed kernel; first rule kind is `verifier_for_path`. |
| `eval task` | Frozen task spec with split, repo ref, budget, verifier, and expected touched paths. |
| `episode` | One baseline run record containing injected context, verifier evidence, cost, time, and outcome. |
| `gate` | Selection-split accept/reject decision for a candidate rule. |
| `NormalizedAction` | Compiler action with operation, intent, resources, risk, status, and facets. |
| `effect summary` | Folded reads, writes, commands, and ordered evidence refs. |
| `association conjecture` | Candidate relationship proposed by repeated telemetry; not yet learning by itself. |
| `explanation graph` | Hypotheses, evidence, rivals, defeaters, and factors used to compute provisional belief. |
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
- [Behavior As Code](docs/behavior-as-code.md)
- [Learned Context As Thermodynamic Control](docs/learned-context-thermodynamics.md)
- [Product Learning Log](docs/product-learning-log.md)
- [Candidate At-Bat Telemetry Spec](docs/candidate-at-bat-telemetry-spec.md)
- [Learned Reducer Rules And Eval Rubric](docs/learned-reducer-rules-eval-rubric.md)
- [Candidate At-Bat Implementation PRD](issues/candidate-at-bat-prd.md)

## Development

```sh
npm run typecheck
npm test
node scripts/pack-npm.mjs
```

Generated tarballs and staging files live under `dist/` and are ignored.
