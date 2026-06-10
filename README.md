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

## Native Work Unit

Lyo is task-source agnostic. Its native units are runs, jobs, and turns, not an
external issue tracker item. A run captures the declared goal and outcome; a job
captures work-shaped activity that may span one or more turns; a turn captures
the conversational or hook-level boundary where the agent acted.

Systems such as GitHub Issues, Linear, local TODO files, or other task queues
can provide metadata, but they are optional inputs. The canonical v0.1 path is
native to Lyo:

```text
run goal
-> Codex turn or job
-> trace
-> preference pair or gap
-> scoped protocol or budget pressure
-> future delivery
-> outcome evidence
```

## Goal Evaluation

Lyo should treat a goal as accomplished only when later evidence satisfies the
recorded success criteria. The preferred evidence is an executable verifier, not
an assistant claim.

Examples:

| Goal type | Completion evidence |
| --- | --- |
| CLI installed | command exits 0 and prints the expected version, for example `acli -v` |
| Code fix | targeted tests, typecheck, lint, or replay checks pass |
| API behavior | request returns expected status, schema, and body invariant |
| Data change | SQL assertion, row count, checksum, or migration invariant passes |
| UI behavior | browser/screenshot assertion or interaction probe passes |
| Documentation | expected file section exists and reviewer accepts it |
| Process learning | later run receives the protocol and outcome shows the defect did not repeat |

When no machine verifier exists, Lyo can record a human or reviewer judgment as
outcome evidence, but that should be explicit and scoped. The control loop is:

```text
declared goal
-> success criteria
-> verifier evidence
-> outcome record
-> later preference, promotion, demotion, or budget pressure
```

## Verifier Role Pattern

A verifier can be a command, test runner, browser probe, database assertion, or
agent role. The important part is the contract: verifier output becomes
completion evidence only when it is explicitly tied to the run goal and parsed
by reducer rules.

For an agent verifier, Lyo should follow the same conservative shape used by
TRINITY-style loops:

- worker output produces the candidate state;
- verifier cannot accept before there is candidate work to inspect;
- verifier responses use a small status vocabulary such as `ACCEPT` or `REVISE`;
- unknown verifier text is non-accepting;
- revisions carry a diagnosis and can be budgeted;
- final completion requires verifier acceptance or an explicit fallback policy.

That means `acli -v` and `Verifier: ACCEPT` are both verifier evidence, but
they are different verifier modes. The former is a command probe; the latter is
a judgment probe and should be stored with role, status, diagnosis, trace, and
scope.

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

The loop does not require a separate task database. A human prompt, Codex hook
event, CLI command, or external issue reference can all start a run as long as
Lyo records the goal, traces, preferences or gaps, delivery, and later outcome.

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

Current package version: `0.2.1`.

## 0.2.x Status

Version `0.2.0` added the first trace/effect compiler layer on top of the
ledger. Version `0.2.1` expands the adoption path with stronger deterministic
classification, parked unknown reporting, and clearer documentation. Raw hook
events can now be normalized into ordered actions, folded into effect
summaries, checked with temporal predicates, and audited across existing SQLite
ledgers.

The practical new question Lyo can answer is:

```text
Did this agent edit, verify, debug, touch risky resources, or stop without a
later verifier?
```

The newest read-only learning report also asks:

```text
What does this user's vibecoding style look like across runs, and which
procedures, critics, or context packs are worth reviewing next?
```

The compiler layer is still read-only for learning artifacts. It reports and
plans; it does not yet persist learned procedures, critics, context packs, or
policies.

## What Works Now

- Initialize a local SQLite ledger.
- Record Codex and Claude hook events.
- Record sessions, prompt boundaries, run starts, and run finishes.
- Record model/provider/token/cost usage.
- Record workspaces, zones, jobs, path activations, command activations, and
  deployment actions.
- Derive zone co-activations and association weights from a job.
- Record traces and preference pairs.
- Promote protocols only after evidence.
- Resolve scoped protocol overlays for future matching work.
- Record outcomes and simple adaptive credit.
- Compile hook telemetry into `NormalizedAction` traces.
- Derive compatibility tokens such as inspect, edit, test, git, external, and
  stop from richer action/effect records.
- Parse action/token streams into work episodes.
- Fold ordered traces into effect summaries with reads, writes, executed
  commands, and ordered evidence refs.
- Evaluate temporal predicates such as verified completion, debugging after a
  failed verifier, approval friction, unsafe writes, and stopping after an edit
  without later verification.
- Report a single run's effect summary with `lyo report --effects --run-id`.
- Report prompt-driven, manually orchestrated, loop-assisted, and loop-driven
  workflow style with
  `lyo report --style --run-id`.
- Aggregate LLM usage and vibecoding style learning candidates with
  `lyo learn style`.
- Audit existing `.agent-learning/*.sqlite` ledgers with `lyo audit --dir`.
- Produce dry-run learning plans for verifier, milestone, procedure, critic,
  policy, and context-pack candidates without writing them back to SQLite.

Not mature yet:

- schema migrations
- automatic experiment branching
- automatic 2x1 / 3x1 / 2x2 model execution
- stable API guarantees
- full event/fact substrate
- complete classifier coverage for every real-world command
- local process/service effects for server startup and simulator launch commands
- subagent lineage and child-process hierarchy
- append-only persistence for compiled learning artifacts
- benchmark/replay loops that compare attempts over time

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

Record the goal for that run:

```sh
lyo context goal \
  --db .agent-learning/learning.sqlite \
  --run-id run-1 \
  --goal "Fix the failing local test" \
  --success-criteria "The targeted test passes and the fix is scoped" \
  --stop-condition "Stop after test verification or a clear blocker"
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

Inspect one run as a trace/effect report:

```sh
lyo report \
  --db .agent-learning/learning.sqlite \
  --effects \
  --run-id turn-1
```

Inspect one run as a conservative workflow-style report:

```sh
lyo report \
  --db .agent-learning/learning.sqlite \
  --style \
  --run-id turn-1
```

Learn from local telemetry across runs without writing artifacts:

```sh
lyo learn style --db .agent-learning/learning.sqlite
```

The style learning report aggregates model-call usage, token totals, manual
prompting/orchestration versus loop-driven distribution, verifier/debugging
habits, unverified edit stops, and reviewable learning candidates.

Compare baseline, treatment, and variant runs for a controlled learning
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

The experiment report is read-only. It turns local trace/effect evidence into
attempt deltas, association credit, and a reviewable decision such as
`retain_candidate` or `generalize_candidate`.

Inspect one run as a candidate at-bat report:

```sh
lyo report \
  --db .agent-learning/learning.sqlite \
  --at-bat \
  --run-id turn-1 \
  --task-context task-context.json
```

The task context is required because telemetry alone cannot score an interview
fairly:

```json
{
  "taskId": "etl-debugging-v1",
  "language": "python",
  "taskComplexity": 6,
  "expectedPattern": "verifier-first debugging",
  "successCriteria": ["targeted verifier passes after the fix"],
  "allowedTools": ["Bash", "apply_patch"],
  "verifiers": [
    {
      "id": "targeted-parser-test",
      "commandPattern": "pytest tests/test_parser.py",
      "kind": "targeted",
      "required": true
    }
  ],
  "baseline": {
    "existingTestsPass": true,
    "buildSucceeds": true,
    "knownIssues": []
  }
}
```

Audit existing local ledgers without writing to them:

```sh
lyo audit --dir ~/repositories
```

Audit output includes a human-readable `summaryText` plus JSON fields such as:

```text
normalizedActionRate
editVerificationRate
stoppedAfterEditWithoutVerificationRuns
unsafeWriteRuns
topUnknownCommands
topParkedUnknownCommands
topMisclassificationCandidates
```

Candidate at-bat reports also include `finalClaim`, a deterministic summary of
the last assistant stop message when available. Lyo classifies whether the
candidate claimed completion, cited verifier evidence, explained a blocker, or
left the final claim unknown. This is deliberately conservative: raw assistant
text may be unavailable or redacted, and the v1 evaluator does not use an LLM
judge for final-claim semantics.

## Related Documentation

The deterministic command classifier is documented separately because the rule
set will grow with real telemetry. The candidate at-bat spec describes how Lyo
can evaluate interview sessions as evidence-producing work loops.

- [Deterministic Classification](docs/deterministic-classification.md)
- [Style Learning](docs/style-learning.md)
- [Cybernetic Association Learner](docs/cybernetic-association-learner.md)
- [Cybernetic Learning Experiment Protocol](docs/cybernetic-learning-experiment-protocol.md)
- [Candidate At-Bat Telemetry Spec](docs/candidate-at-bat-telemetry-spec.md)
- [Candidate At-Bat Implementation PRD](issues/candidate-at-bat-prd.md)

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
path kind and explicit phase when supplied
repeated path events
command name/family, status, output size, repeat count, and explicit semantic labels when supplied
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

For the Nectr data-engineering workspace, the default zones can be registered in
one step:

```sh
lyo workspace init-nectr \
  --db .agent-learning/learning.sqlite \
  --root /Users/marcus.kim/repositories/work/nectr_data_eng
```

After passive hook normalization has produced zone associations, ask for the
next likely associated zone from the current seed:

```sh
lyo associations recommend \
  --db .agent-learning/learning.sqlite \
  --workspace-id nectr_data_eng \
  --seed-zone-id nectr_data_eng:business_logic
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

`lyo codex-hook` reads Codex hook JSON from stdin and records a redacted event.
For active Codex use, prefer spool-first capture so tool hooks do not write
directly to SQLite while a turn is running.

Spool-first flow:

```text
Codex hook event
-> .agent-learning/hook-spool/incoming/*.json
-> Stop hook or lyo normalize hooks drains the spool
-> hook_events
-> normalized command/path/zone/deployment facts
```

For a global Codex hook, prefer event-cwd storage:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "lyo codex-hook --db-from-event-cwd --prompt-dir-from-event-cwd --spool-dir-from-event-cwd",
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
            "command": "lyo codex-hook --db-from-event-cwd --prompt-dir-from-event-cwd --spool-dir-from-event-cwd",
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
            "command": "lyo codex-hook --db-from-event-cwd --prompt-dir-from-event-cwd --spool-dir-from-event-cwd",
            "statusMessage": "Recording learning event"
          }
        ]
      }
    ]
  }
}
```

Use the same command for `PreToolUse` and `PostToolUse` hooks when you want
files touched, commands run, tests, and deploy actions to be normalized later.

With `--db-from-event-cwd`, one global hook writes each workspace to its own:

```text
<event.cwd>/.agent-learning/learning.sqlite
```

With `--spool-dir-from-event-cwd`, hot hook capture writes first to:

```text
<event.cwd>/.agent-learning/hook-spool/incoming
```

The `Stop` hook best-effort drains the spool. You can also repair or catch up
manually:

```bash
lyo normalize hooks \
  --db .agent-learning/learning.sqlite \
  --spool-dir .agent-learning/hook-spool
```

The hook does not store raw prompts or assistant messages in SQLite by default.
It records hashes, lengths, summaries, and optional file refs. Use
`--prompt-dir` or `--prompt-dir-from-event-cwd` only when local prompt blobs are
explicitly allowed.

## Claude Hook

`lyo claude-hook` reads Claude Code hook JSON from stdin and records the same
reducer-backed facts as Codex where event shapes overlap. It is passive: it does
not block tools, approve permissions, or inject protocol overlay text yet.

For active Claude use, prefer the same spool-first pattern:

```sh
lyo claude-hook \
  --db-from-event-cwd \
  --prompt-dir-from-event-cwd \
  --spool-dir-from-event-cwd
```

Supported canonical mappings include session start/end, prompt submit,
pre/post tool use, tool failure, tool batches, compaction, subagent/task events,
cwd/file/worktree changes, notifications, and elicitation events. `PostToolUse`
and `PostToolUseFailure` can be normalized into command, deployment, path, and
zone activation facts.

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
