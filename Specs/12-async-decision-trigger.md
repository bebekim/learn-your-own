# Spec 12: Asynchronous decision triggers

Status: **implemented and live** (merged 2026-11-25, `d10cac5`); design accepted, including
enrollment when the decision lands (section 3). Live hooks use local mlxcel Decider-2b
for the `json-output-handling-haiku-1` trial. State (store, decision config, case sets,
queue) lives under `LYO_HOME` (default `~/.lyo`).

| Part | Code |
|---|---|
| Providers | `src/lyo/decisions/providers.ts` |
| Queue | `src/lyo/decisions/queue.ts` |
| Trigger, enqueue, enrollment | `src/lyo/interface/finding-decision-triggers.ts`, `finding-trials.ts` |
| Worker | `src/lyo/interface/finding-decision-worker.ts` |
| Case sets, test split, recalibration | `src/lyo/decisions/case-sets.ts` |
| CLI | `src/lyo/cli/commands/decisions.ts` |

A trial fires when a failure belongs to the situation a finding addresses. Today
that recognition is an exact command hash or a hand-written regex. Both are rules
someone writes once and nobody revises. This spec replaces them with a calibrated
typed decision, asked in the background so that no hook waits for a model.

## Why

- **Exact triggers never fire in ordinary work.** Real commands rarely repeat byte for
  byte. The live store held no trial opportunities on 2026-11-25.
- **Regex triggers are crystallized.** On 216 labelled real failures, the current
  pattern caught 36 of 102 matching cases. A better hand-written rule caught 92, but it
  is still a fixed description that does not learn.
- **Typed decision models recognise the situation well.** The same 216 cases were rated
  1–5 with one question about the finding's situation:

  | Provider | AUC | Held-out at a cut-off fitted on the other half | Median latency | Leaves the machine |
  |---|---|---|---|---|
  | Solar Decide (OpenRouter) | 0.977 | caught 41/50, false alarms 2/58 | 0.75 s (worst 28.7 s) | yes |
  | Decider-2b (`mlxcel decide`) | 0.971 | caught 47/50, false alarms 5/58 | 4.55 s per CLI call, model load included | no |

  The two AUCs are within noise of each other: the 95% bootstrap interval of the
  difference is −0.016 to +0.030. The labels are provisional; one agent assigned them
  after reading the same error text the models read. Only one finding was tested.
- **Neither is fast enough to hold a hook.** The current hook budget is 1.5 s.

## Design

```
tool failure ─▶ hook: record + enqueue (ms) ─▶ returns
                         │
                         ▼
                decision worker (background, single instance)
                  asks the configured provider, stores the decision
                         │
                         ▼
next hook event in the session ─▶ decision present and above the band?
                                     enroll → assign → advice / no advice
```

### 1. Hook: record and enqueue

On an executed failure (a `failure_kind` other than a denial, a harness rejection or
an interrupt) in a session that has at least one decision-triggered trial in scope, the
hook writes a job and returns. The job is the rendered failure: the command and the
tail of the live output, in the exact format used for calibration. It is held in a
local queue file under the store's spool directory with owner-only permissions. It is
deleted once it is decided. The lesson store never retains it; only the decision
record does.

The hook starts the worker if no live worker holds the lock. It never waits for the
worker.

### 1a. Queue

A directory of job files, using the same write-then-rename pattern as the hook spool
(`src/lyo/hooks/spool.ts`). There is no database on the hook path: hooks never contend
for a SQLite lock. That matters because the SQLite timeout in Spec 4.1 is still open.

```
<store dir>/decision-queue/        mode 0700
  incoming/   <createdAt>-<jobId>.json    hook: write tmp, then rename here (atomic)
  claimed/    <jobId>.json                worker: rename from incoming (atomic claim)
  dead/       <jobId>.json                more than 3 failed attempts; kept for inspection
  worker.lock                             PID and start time of the live worker
```

- **Job.** `{ jobId, sessionId, runtime, createdAt, trialIds, state, inputFormat }`.
  `jobId` is the hash of the trigger event's identity (session and tool use id), so a
  duplicate hook delivery writes the same file and is a no-op. `state` is the rendered
  failure in the calibration input format.
- **Claim.** The worker renames a file from `incoming/` to `claimed/` before deciding it.
  Renaming within one filesystem is atomic, so two workers cannot claim one job, even in
  the moment before the lock check catches a second worker.
- **Order.** Oldest first, by the `createdAt` prefix.
- **Crash recovery.** A file left in `claimed/` with no live worker is moved back to
  `incoming/` with its attempt count raised. After 3 failed attempts it goes to `dead/`
  and is recorded as an `unknown` decision with the reason `worker-failed`.
- **Results.** The worker is the only process that writes decisions to the lesson
  store. With a single writer, decisions do not contend either. Each decision is
  written, then its job file is deleted. A crash between those two steps leaves a job
  whose decision already exists, and the worker skips it on restart.
- **Bound.** At most `maxQueued` (default 200) files in `incoming/`. Beyond that the hook
  drops the job and counts `dropped`. A runaway session therefore cannot fill the disk.

### 2. Worker

- **One instance.** A lock file holds the PID; a live holder means do not start.
- **Lifecycle.** The worker exits after `idleSeconds` (default 600) with an empty queue,
  and a watchdog stops it after `ttlSeconds` (default 14400) regardless. A local model
  server it started is stopped with it.
- **Work.** For each job and each matching trial, ask the trial's question once. Store a
  `typed-decision@1` record with the provider, the answering model, the request hash,
  the probabilities, latency and usage. A provider error or timeout stores an `unknown`
  decision with its reason.
- **Expiry.** A job older than `maxAgeSeconds` (default 900), or from a session that
  has ended, is recorded as `expired` and not decided.

### 3. Enrollment when the decision lands

At any later hook event in the same session (a tool call, a prompt, compaction), LYO
reads the decisions that have completed:

- **Above the trial's `yes` threshold:** register the opportunity, assign it at random,
  and deliver the advice in the advice arm. The no-advice arm records a delivery point
  with no text.
- **Below `no`, between the thresholds, or unknown:** no enrollment, and the reason is
  counted.

Outcomes are measured from the delivery point in both arms, so late advice is compared
against an equally late no-advice baseline. The decision reads only the failure, which
was observed before assignment, so it cannot favour either arm. If the agent repaired
the failure before the decision landed, that is a measured outcome, not an exclusion.

### 4. Swappable providers

Every provider implements the existing `TypedDecisionProvider`
(`src/lyo/application/typed-decisions.ts`) and returns the same `TypedDecisionRecord`.
The worker knows only that interface. A config selects the adapter:

| Adapter | For | Endpoint | Notes |
|---|---|---|---|
| `mlxcel` | Apple Silicon Macs | `mlxcel decide` per decision, or a running `mlxcel-server --decision-model` via `serverUrl` | Needs `mlxcel` ≥ 0.9.0 (decisions shipped in 0.9.0-beta.2). Nothing leaves the machine. The CLI reloads the model each call (about 4 s for Decider-2b); that is acceptable off the hook path. The server serves a decision model only beside a chat model (`-m`), so it is opt-in. |
| `openrouter` | Any platform | `POST https://openrouter.ai/api/v1/systemone`, model `upstage/solar-decide` | Same request and response shape as Jev. Sends `provider: {zdr: true, allow_fallbacks: false}`. Account-level ZDR is recommended for work data. |
| `jev` | Any platform | TypeSafe `POST /v1/systemone` | The current `jevProvider`. |

```jsonc
// ~/.lyo/decisions.json
{
  "provider": "mlxcel",                 // "mlxcel" | "openrouter" | "jev"
  "mlxcel": { "binary": "~/.local/opt/mlxcel-0.9.0-beta.2/mlxcel-server", "decisionModel": "nativ-community/decider-2b", "port": 8082 },
  "openrouter": { "model": "upstage/solar-decide", "apiKeyEnvFile": "~/repositories/individual/.env", "zdr": true },
  "jev": { "model": "jev-1.14.0", "apiKeyEnvFile": "~/repositories/individual/.env" },
  "worker": { "idleSeconds": 600, "ttlSeconds": 14400, "maxAgeSeconds": 900, "timeoutMs": 30000 }
}
```

Adding a provider means writing one adapter. Nothing else changes.

### 5. Trigger shape

The `commandPattern` trigger on `fix/failure-evidence` is replaced by:

```jsonc
"trigger": { "toolName": "Bash", "result": "failure",
  "decision": {
    "question": { "type": "score", "instructions": "<the finding's situation>", "criteria": ["1: …", "…", "5: …"] },
    "band": { "no": 2.5, "yes": 4.1 },
    "calibration": { "provider": "mlxcel", "model": "nativ-community/decider-2b", "positives": 102, "negatives": 114,
                     "heldOut": "…", "evidence": "…", "inputFormat": "command[:900] + output tail[-700:]" } } }
```

- **Calibration belongs to a provider and model.** A band calibrated on Decider-2b does
  not carry over to Solar Decide. A trial whose calibration names a different provider
  or model than the configured one does not enroll, and says why. Switching providers
  therefore means recalibrating on the same labelled cases, which is cheap: about 15
  minutes locally for 218 cases, or under $0.01 on OpenRouter.
- **The labelled cases are data, not rules.** Later outcomes add cases. A delivery
  reviewed as inapplicable becomes a negative; a missed failure found in review becomes
  a positive. Recalibration produces a new trial version, because trial definitions are
  immutable.
- As today, `calibration` requires at least 20 positives and 20 negatives.

### 6. Labelled cases, test set and recalibration

Each finding owns a **case set**: labelled episodes stored locally under
`~/.lyo/decision-cases/<findingId>/`. It is never committed, because it holds
repository content.

```
cases.jsonl     { id, state, inputFormat, label: true|false|"ambiguous", labelSource, addedAt, split }
splits.json     { "test": [ids], "calibration": [ids], "testHash": "<hash of sorted test ids and their labels>" }
decisions/      <provider>/<model>.jsonl   cached answers, keyed by request hash
```

- **Label sources are named.** `agent-draft`, `user-reviewed` or `trial-outcome`. A
  report shows how many labels of each kind it rests on, because agent-drafted labels
  are weaker evidence than reviewed ones.
- **Split once, stratified.** When a case set is created, 30% of the cases (at least 20
  positives and 20 negatives) are drawn into `test`, stratified by label and by
  personal/work. The remaining cases form `calibration`.
- **The test set is frozen.** It is never used to choose a threshold. `testHash` is
  recorded in every trial's `calibration`, so it shows which test set a trial was
  checked against. Changing the test set is an explicit `--new-test-set` action, which
  writes a new hash. Results from different test sets are not compared as if they were
  the same.
- **New cases go to calibration.** Episodes added later, from reviewed deliveries or
  from missed failures found in review, join `calibration`. Adding cases never changes
  the test set.

**Recalibration is one command:**

```sh
lyo finding cases-import --finding <id> --input cases.jsonl        # creates the set and freezes its test split
lyo finding cases-add    --finding <id> --input more.jsonl         # new cases join calibration only
lyo finding recalibrate  --finding <id> --question q.json          # report only; no lesson store opened
lyo finding recalibrate  --finding <id> --trial-id <old> --register --new-trial-id <new> [--provider openrouter] [--accept-worse]
```

1. Asks the configured provider about every case without a cached answer for that
   provider, model and question. Cached answers are reused, so a rerun after adding ten
   cases asks ten questions.
2. Fits the band on `calibration` only: `yes` is the lowest score that keeps
   false alarms at or below `maxFalseAlarmRate` (default 0.05); `no` is the highest
   score below which at most `maxMissRate` (default 0.05) of positives fall.
3. Reports on `test` without changing anything: cases caught, false alarms, cases left
   undecided, AUC with a bootstrap interval, latency, and the label-source mix.
   It reports `sufficient: false` when the test set has fewer than 20 positives or 20
   negatives.
4. With `--register`, writes a new trial version that supersedes the old one, carrying
   the band, provider, model, `testHash` and the test results as `heldOut`. Without
   `--register` it only reports. It refuses to register when the result is
   insufficient, or when the test results are worse than the trial being replaced. A
   worse result is shown so that the user can decide.

Switching provider is the same command with a different `--provider`. A machine
without mlxcel runs it with `openrouter` or `jev`, and gets its own band.

## Failure modes made visible

`lyo decisions status` reports the queue (incoming, claimed, dead), the live worker,
decisions per trial and verdict (`yes`, `no`, `between`, `unknown`, `expired`,
`skipped`) with mean latency, and how many sessions decisions enrolled. A dead worker shows up as queued jobs that are never
decided, not as an absence of matches.

## Privacy

| Adapter | What leaves the machine |
|---|---|
| `mlxcel` | Nothing |
| `openrouter` | The rendered failure, to Upstage through OpenRouter. ZDR is requested per call; account-level ZDR enforces it. |
| `jev` | The rendered failure, to TypeSafe |

The live error text is never stored in the lesson store or corpus; it exists only in the
queue file until the job is decided. Choosing a hosted adapter for work repositories is
an explicit configuration choice. LYO does not select one silently.

## Acceptance

1. The hook returns without waiting on any provider. Test: a provider that never responds
   adds no hook latency.
2. All three adapters pass the same contract tests with a fake transport. One live smoke
   test per adapter is retained as evidence.
3. At most one worker runs, and it exits on idle or TTL. Test: concurrent hooks start one
   worker; a killed worker is restarted by the next job.
4. An advice and a no-advice opportunity created from the same decision have the same
   delivery point, and outcomes are measured from it.
5. A calibration whose provider or model does not match the configured one never enrolls,
   and the reason is reported.
6. Queue: duplicate hook deliveries produce one job; two workers never decide the same
   job; a worker killed mid-job leaves the job redecided once, not lost or doubled; a full
   queue drops and counts instead of blocking.
7. Recalibration: a rerun with no new cases makes no provider calls; the band is fitted
   without reading test labels (test: altering test labels leaves the fitted band
   unchanged); `--register` refuses an insufficient or worse result.
8. The Spec 12 comparison of Decider-2b and Solar Decide is retained under `evidence/`
   with its labels, ratings and scripts, minus work-repository content.

## Not in scope

- **Prevention before a command runs.** Claude Code `PreToolUse` context arrives with the
  tool result. Blocking with a reason remains a separate decision.
- **Kimi enrollment.** No `PostToolUseFailure` context has been observed reaching a Kimi
  model.
- **Laya.** It is small and probably fast, but it has a 512-token input limit and mlxcel
  does not support it yet (lablup/mlxcel#2363). Revisit if Decider-2b proves accurate but
  too slow.
- **Choosing a provider automatically by accuracy.** Each provider is calibrated
  separately; the user chooses which one to run.
