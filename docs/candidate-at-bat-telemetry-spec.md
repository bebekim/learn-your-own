# Candidate At-Bat Telemetry Spec

## Purpose

Modern AI-assisted coding interviews should not primarily ask:

```text
Can this candidate generate code?
```

The better question is:

```text
Can this candidate turn ambiguity, tokens, tools, and model output into
shippable evidence at a high rate?
```

This spec frames each recorded interview session as an **at-bat**. The goal is
to measure whether the candidate repeatedly produces verified progress, and to
identify the technique behind that conversion.

## Core Claim

Code generation is no longer the scarce skill. The scarce skill is making
generated work shippable.

If token spend does not convert into verified progress, the investment is low
quality. Lyo should therefore measure the conversion funnel:

```text
tokens
-> actions
-> edits
-> verifiers
-> passing evidence
-> shippable outcome
```

## Baseball Mapping

| Baseball concept | Lyo interview concept |
| --- | --- |
| At-bat | Recorded candidate session |
| Pitch sequence | Task ambiguity, constraints, failures, tool responses |
| Swing decision | Prompt, command, edit, delegation, verifier choice |
| Contact quality | Test/build/typecheck result, diff quality, diagnosis quality |
| Reaching base | Verified useful progress |
| Strikeout | Stops without evidence, breaks build, ignores failures, wanders |
| Runs produced | Shippable outcome or durable progress toward one |
| Batting style | Candidate's working technique under AI assistance |

The purpose is not to reward theatrical live performance. It is to find
candidates who consistently get on base.

## High-Percentage At-Bat

A strong AI-assisted engineering session usually follows a shape like:

```text
orient
-> define target
-> inspect existing system
-> make a small change
-> run verifier
-> read failure
-> revise
-> rerun verifier
-> broaden verification
-> summarize evidence
-> stop cleanly
```

This is a high-percentage at-bat because the candidate steadily increases
shipping confidence.

## Low-Percentage At-Bat

A weak session often looks like:

```text
large prompt
-> large generation
-> little inspection
-> no targeted verifier
-> no failure diagnosis
-> claim done
```

This may produce code, but it does not produce shipping confidence.

## What Lyo Should Measure

For each at-bat, Lyo should compute metrics from the trace/effect model.

### Evaluation Context

Raw telemetry is not enough to score an interview fairly. Lyo also needs the
task context that tells the evaluator what the candidate was trying to improve
and how hard the attempt should have been.

Each evaluated attempt should include:

```text
baseline
  What was true before the candidate started?
  Example: tests already passing, build already broken, known flaky verifier.

task_complexity
  How difficult is the task relative to the benchmark set?
  This should start as rubric metadata, not an inferred model score.

expected_pattern
  What style of work should this task reward?
  Examples: verifier-first, exploratory diagnosis, data-quality investigation.

success_criteria
  What evidence would count as a shippable outcome?

allowed_tools
  Which agents, CLIs, network resources, and external writes were permitted?
```

Without this context, a candidate can look productive by fixing a local symptom
while making the overall system worse. The evaluator should compare the final
evidence against the starting state and the task rubric, not against raw action
counts alone.

### Conversion

```text
verified_progress
  Did the session produce a passing verifier after meaningful work?

ship_readiness
  Did the evidence satisfy the task's stated success criteria?

token_to_evidence_ratio
  How much verified progress was produced per token/turn/tool call?
```

### Swing Discipline

```text
inspect_before_edit
  Did the candidate inspect relevant files/systems before changing them?

small_batching
  Were edits made in reviewable increments?

risk_control
  Did the candidate avoid or justify destructive/external actions?

clarification_quality
  Did the candidate ask for missing constraints when ambiguity mattered?
```

### Contact Quality

```text
verifier_quality
  Were tests/builds/typechecks/probes relevant to the change?

failure_recovery
  After a failed verifier, did the candidate inspect, diagnose, patch, and rerun?

evidence_freshness
  Was verification run after the final edit?

claim_evidence_alignment
  Did the candidate's final summary match actual evidence?
```

### Situational Hitting

```text
targeted_then_broad
  Did the candidate use a targeted verifier first and a broader verifier later?

repo_adaptation
  Did the candidate follow local project conventions and existing architecture?

context_efficiency
  Did the candidate gather enough context without drowning the session in reads?
```

### Timing And Churn

Lyo should derive timing and resource-churn metrics from the action trace before
changing the core algebra. The append-only trace remains the source of truth;
reports can expose bounded summaries and count maps.

Useful timing metrics include:

```text
time_to_first_inspect
time_to_first_edit
time_to_first_verifier
edit_to_verifier_delay
failure_recovery_latency
total_session_duration
```

Useful churn metrics include:

```text
write_counts_by_resource
command_counts_by_kind
resource_touch_counts
repeated_edit_hotspots
```

Set-based effects remain useful for footprint and conflict analysis. Repeated
writes should be added as derived counts first, not by replacing the canonical
effect model.

### Outcome Classes

The evaluator should distinguish failed work from disciplined stopping. A clean
stop can be a positive signal when the candidate preserves the workspace,
explains the blocker, and avoids unsupported claims.

Initial outcome classes:

```text
verified_progress
  Meaningful work followed by relevant passing evidence.

regression
  The candidate made changes and left the system worse than the baseline.

unverified_claim
  The candidate claimed completion without fresh evidence after the final edit.

clean_stop_with_justification
  The candidate stopped because the task was unsafe, impossible, underspecified,
  or blocked, and explained the evidence without damaging the workspace.

blocked_without_resolution
  The candidate stopped without a verifier, useful diagnosis, or clear next step.
```

## Technique Signatures

Lyo should not only score a candidate. It should describe the candidate's
technique.

Examples:

```text
Verifier-first engineer
  Defines or finds success criteria early.
  Runs targeted tests quickly.
  Stops only with evidence.
```

```text
Explorer
  Reads more before editing.
  Often avoids wrong turns.
  May be slower but safer.
```

```text
Prompt-heavy generator
  Produces code quickly.
  May defer verification.
  High upside but higher variance.
```

```text
Debugger
  Strongest after failures.
  Reads error output carefully.
  Uses tight fail -> inspect -> patch -> rerun loops.
```

```text
Risky shipper
  Moves fast and changes broadly.
  May need strong team guardrails around deploys, deletes, and external writes.
```

These signatures should be evidence-backed, not personality guesses.

## Trace/Effect Basis

The at-bat score is computed from the same core model:

```text
NormalizedAction trace
-> effect summary
-> temporal predicates
-> interview metrics
-> rubric comparison
```

Useful predicates include:

```text
hasVerifiedCompletion(trace)
hasDebugging(trace)
hasUnsafeWrite(trace)
hasStoppedAfterEditWithoutVerification(trace)
```

Additional interview predicates should include:

```text
inspectBeforeFirstEdit(trace)
targetedVerifierAfterEdit(trace)
broadVerifierAfterTargetedPass(trace)
claimWithoutEvidence(trace)
failureIgnored(trace)
largeUnverifiedEdit(trace)
```

## Data Engineering Relevance

Data engineering interviews are a strong fit because the work naturally maps to
resource effects:

```text
read source
-> transform
-> write destination
-> verify rows/schema/invariants
-> debug failures
```

Good data-engineering at-bats should show:

```text
source inspection before transformation
schema and row-count awareness
invariant checks
idempotency/rerun thinking
partition and freshness awareness
controlled writes
clear rollback or recovery path
```

This makes the telemetry useful for both engineering quality and style fit.

## Interview Product Mode

In interview mode, Lyo should primarily:

```text
record
normalize
summarize
score
compare to rubric
produce an evidence report
```

It should not actively coach the candidate during the recorded evaluation,
unless the company explicitly chooses a coaching-enabled mode.

The default interview mode should avoid:

```text
suggesting next actions live
auto-completing the candidate's process
hiding weak verification habits
turning the interview into model-assisted autopilot
```

### Evaluate Mode Vs Learn Mode

Interview scoring and learning feedback have different safety requirements.
They should be separate modes.

```text
evaluate
  Stable, versioned, explainable.
  Uses fixed rubrics and deterministic predicates.
  Produces candidate/team-fit evidence.
  Does not silently change scoring rules.

learn
  Adaptive and offline by default.
  Mines technique signatures, procedure candidates, verifier candidates,
  context-pack candidates, and critic candidates.
  Produces reviewable proposals, not automatic interview-score changes.
```

Learning can improve future rubric versions, but only through explicit
promotion, versioning, and human review. This keeps interview evaluation fair
while still allowing Lyo to become more useful over time.

## Output Shape

A candidate at-bat report should include:

```json
{
  "reportVersion": "lyo/candidate-at-bat/v1",
  "mode": "evaluate",
  "sessionId": "session-123",
  "taskId": "etl-debugging-v1",
  "taskContext": {
    "taskComplexity": 6,
    "expectedPattern": "verifier-first debugging",
    "successCriteria": [
      "targeted test passes",
      "broader test or build still passes",
      "final summary cites evidence"
    ],
    "baseline": {
      "existingTestsPass": true,
      "buildSucceeds": true,
      "knownIssues": []
    }
  },
  "outcome": "verified_progress",
  "finalClaim": {
    "posture": "cites_evidence",
    "mentionsVerifier": true,
    "mentionsBlocker": false,
    "summary": "Done. pytest tests/test_parser.py passed after the fix.",
    "evidenceRefs": [
      "hook:event-stop"
    ]
  },
  "scorecard": {
    "verifiedProgress": true,
    "stoppedAfterEditWithoutVerification": false,
    "inspectBeforeEdit": true,
    "cleanStopWithJustification": false,
    "failureRecovery": "strong",
    "riskControl": "moderate",
    "claimEvidenceAlignment": "strong"
  },
  "conversion": {
    "turns": 18,
    "toolCalls": 42,
    "edits": 5,
    "verifierRuns": 4,
    "verifierPasses": 2
  },
  "timing": {
    "timeToFirstEditMs": 180000,
    "timeToFirstVerifierMs": 420000,
    "meanEditToVerifierDelayMs": 90000,
    "failureRecoveryLatencyMs": 150000
  },
  "resourceChurn": {
    "writeCountsByResource": {
      "src/pipeline.ts": 3,
      "tests/pipeline.test.ts": 2
    },
    "repeatedEditHotspots": [
      "src/pipeline.ts"
    ]
  },
  "techniqueSignature": [
    "debugger",
    "verifier-first"
  ],
  "evidenceRefs": [
    "hook:event-1",
    "hook:event-2"
  ]
}
```

`finalClaim.posture` is a deterministic, conservative classification over the
available Stop hook or assistant response summary. Initial values are
`claims_done`, `cites_evidence`, `blocked`, `asks_for_followup`, and `unknown`.
The v1 evaluator should not treat this as full semantic judgment; it should use
it to distinguish unsupported completion claims from evidence-citing summaries
and justified clean stops.

## Non-Goals

This system should not claim to measure all engineering ability.

It does not directly measure:

```text
long-term maintainership
team communication over weeks
product judgment outside the task
deep architecture taste from one session
```

It measures a narrower but valuable thing:

```text
how well a candidate uses AI-assisted coding loops to produce shippable
evidence under interview constraints
```

## Product Thesis

The best candidates may not look like traditional "five-tool" live coders.
They may be calm, methodical, verifier-oriented, and quietly high-conversion.

Lyo's job is to find those candidates.

The scoreboard is not how much code they generated.

The scoreboard is:

```text
Did they get on base?
How often?
With what technique?
Would that technique fit this team's way of shipping?
```
