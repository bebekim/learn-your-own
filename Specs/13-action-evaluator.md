# Spec 13: Action evaluators

Status: **implemented on `feat/action-evaluator`** (2026-11-25). Builds on [Spec 12](12-async-decision-trigger.md).
Evaluator: `eval/finding-evaluators/action-outcome.mjs`. Tests: `tests/action-evaluator.test.ts`.

## Problem

Trial evaluators are shell checks that read workspace **files** before and after the
agent's next action. That fits lessons that change code. It does not fit lessons that
change how the agent **runs a command**, such as "look at the raw output before parsing
JSON". Three gaps block such a trial:

1. Checks never see the captured action: its command, its exit code or its failure labels.
2. A next action that fails is recorded as "did not complete normally", so its outcome
   becomes unknown (`finding-evidence.ts`). For a command lesson, that failure *is* the
   outcome.
3. Whether a failure was the situation the lesson addresses is a judgement. Spec 12 makes
   that a calibrated decision; the outcome needs the same.

## Design

A trial's measurement may declare `capture.measures: "action"`.

### Action context, not output

At the action's `after` boundary, the receipt also keeps `action`: the command (at most
2000 characters), `exitCode`, `failureKind` and `errorClass`. These come from the
redacted hook payload. No output text is stored.

- An executed failure (`exit_nonzero` or `unknown`) is a valid outcome, not a problem.
- A call that was declined, rejected by the host or interrupted remains a problem: the
  command never ran, so there is no outcome.
- `sourceFiles` may be empty for action measurements.
- `capture.commandPattern` (optional, a regular expression in the reviewed trial) makes the
  measured action the next command whose text matches, e.g. the next JSON-parsing command.
  Unmatched commands are neither captured nor decided; if none matches before the turn
  ends, the window closes and the outcome is unknown.
- Why a pattern, not a calibrated decision (checked 2026-11-26): 220 recent Bash commands
  (90 pattern matches, 80 unmatched that mention JSON or structured data, 50 others) were
  scored by Decider-2b on "does this command parse JSON?". At the best threshold it
  disagreed with the pattern on 17; adjudicated by hand, the pattern was right on 15,
  including commands piping into a JSON parser, the trial's own situation. Decoding JSON
  is visible in the command text, so the reviewed pattern is the better witness. One miss
  (`JSONDecoder`) was added to the live trial's pattern.

### Outcome decision, asynchronous

If the captured action failed, the hook (which still has the live error text) enqueues an
**outcome job**. It is rendered in the same `command-output@1` format and asks the trial's
own calibrated question with the same band. The Spec 12 worker decides it, records
`finding-outcome-decision@1`, then measures the opportunity, assesses it and closes its
window. A single writer stays the rule.

- Until the outcome decision exists, the hook boundary does not measure that
  opportunity, and the window does not close at a prompt or stop event.
- An outcome job that expires, or a provider error, records an `unknown` decision. The
  worker then measures anyway, and the outcome is unknown, never guessed.
- A next action that succeeded needs no decision; it is measured at once.

### Checks receive the context

During `applicability`, `adherence` and `prediction` checks, LYO writes a context file
(mode 0600, deleted afterwards) and sets `LYO_FINDING_ACTION` to its path:

```json
{ "triggerDecision": {"verdict": "yes", "level": 4.4, "id": "..."},
  "action": {"command": "...", "exitCode": 1, "failureKind": "exit_nonzero", "errorClass": "JSONDecodeError"},
  "outcomeDecision": {"verdict": "no", "level": 1.3, "id": "..."} }
```

`eval/finding-evaluators/action-outcome.mjs` is the shipped evaluator:

| Check | Result |
|---|---|
| applicability | `true` when the enrolling trigger decision was `yes`; otherwise `null` |
| adherence | `null`: not calibrated yet (see below) |
| prediction | exit code 0 → `true`; failed with outcome decision `yes` → `false`; `no` → `true`; otherwise `null` |

The prediction asks: did the agent's next command avoid repeating the situation? The
trial compares that rate between arms. A next command unrelated to JSON passes in both
arms. That lowers power, but cannot bias the comparison.

### Adherence is deferred, not faked

Adherence would ask "did the next command inspect or guard the output before parsing?"
That is a judgement, so it needs its own calibrated question and labelled cases. None
exist yet. Until then, adherence is `null`. The trial outcome (`observedOutcome`) does
not depend on it; only per-application credit does, and that stays unknown.

## Acceptance

1. A next action that fails with a JSON-input failure measures as `fail`. One that fails
   for another cause, or succeeds, measures as `pass`. One that was declined measures as
   `unknown`.
2. A failed action is not measured, and its window is not closed, before the outcome
   decision lands. The worker measures it and closes the window afterwards.
3. Checks receive the context file. It is deleted after the checks, and no output text is
   retained in any receipt.
4. File-based trials behave exactly as before.

## Not in scope

The adherence question and its case set; capturing more than the single next action;
Kimi.
