## Problem Statement

Lyo can already record and normalize AI-assisted coding telemetry into actions,
effects, semantic summaries, and workflow-style reports. That makes it possible
to describe what happened in a session, but it does not yet provide a stable
interview evaluation artifact that answers the product question:

```text
Can this candidate turn ambiguity, tokens, tools, and model output into
shippable evidence at a high rate?
```

Modern AI-assisted coding interviews should not primarily score whether a
candidate can generate code. Code generation is increasingly cheap. The scarce
skill is operating the agent loop well: inspecting the existing system, making
bounded changes, selecting useful verifiers, recovering from failures, avoiding
unsafe writes, and stopping with evidence that matches the final claim.

The existing effect and workflow-style reports are necessary but not sufficient
for this product surface. They lack task context, baseline state, success
criteria, outcome classes, and an interview-specific report shape. Without that
context, raw action counts can be misleading. A candidate fixing a local symptom
in an already-broken system, or generating a large unverified diff, should not
look equivalent to a candidate who produces fresh evidence against the stated
success criteria.

This PRD defines a read-only Candidate At-Bat evaluator as the next
implementation target. It turns a recorded session plus task context into a
versioned, explainable evaluation report.

## Solution

Add a Candidate At-Bat evaluation layer on top of the existing normalized action
trace, effect report, and workflow-style report.

The evaluator should treat each recorded candidate session as an at-bat:

```text
task ambiguity and constraints
-> candidate prompts and tool choices
-> normalized actions and effects
-> edits and verifier runs
-> passing or failing evidence
-> outcome and technique signature
```

The first version should be local, deterministic, read-only, and explainable. It
should not coach the candidate, persist learning artifacts, or change scoring
rules automatically. It should produce a JSON report that hiring teams can
inspect and compare across sessions with a stable report version.

The evaluator should require external task context because telemetry alone
cannot determine fairness. The task context should describe:

- baseline state before the candidate starts
- task complexity
- expected working pattern
- success criteria
- explicit verifier specs for evidence that counts
- allowed tools and risk boundaries

The evaluator then combines that task context with current telemetry-derived
signals:

- normalized actions
- effect summary
- temporal predicates
- workflow-style classification
- verifier pass/fail evidence
- resource churn
- timing and batching metrics

The output should classify the outcome, populate a scorecard, compute conversion
and timing metrics, describe technique signatures, and include evidence
references for auditability.

The report should also expose a conservative `finalClaim` block derived from
Stop hook evidence or assistant response summaries when available. This block
should classify whether the candidate claimed completion, cited verifier
evidence, explained a blocker, asked for follow-up, or left the claim unknown.
It is deterministic evidence annotation, not an LLM semantic judgment.

## User Stories

1. As a hiring team member, I want a recorded AI-assisted coding session scored
   against task success criteria, so that I can evaluate shippable evidence
   without watching the session live.

2. As an interviewer, I want the report to include the task baseline, so that I
   can distinguish genuine improvement from activity on an already-broken
   system.

3. As an interviewer, I want the report to include task complexity, so that I
   do not compare an easy verifier task directly against a difficult debugging
   task.

4. As an interviewer, I want success criteria to be explicit, so that the report
   can judge evidence against the actual requested outcome.

5. As an interviewer, I want required verifier commands to be explicit and
   language-agnostic, so that Python, Ruby, Java, C++, and other ecosystems can
   define the evidence that counts without changing Lyo's classifier.

6. As an interviewer, I want allowed tools and risk boundaries captured, so that
   external writes, deploys, deletes, and credentials are evaluated in context.

7. As a candidate evaluator, I want to know whether the candidate inspected
   before editing, so that I can identify whether they respected the existing
   system.

8. As a candidate evaluator, I want to know whether the candidate verified after
   meaningful edits, so that completion is based on fresh evidence.

9. As a candidate evaluator, I want to know whether the candidate stopped after
   editing without verification, so that unsupported completion claims are
   visible.

10. As a candidate evaluator, I want the report to distinguish verified progress
   from unverified claims, so that generated code is not mistaken for shipped
   work.

11. As a candidate evaluator, I want the report to distinguish regression from
    incomplete work, so that harmful changes are not treated as neutral.

12. As a candidate evaluator, I want the report to recognize clean stopping with
    justification, so that disciplined refusal or blocker discovery can be a
    positive signal.

13. As a candidate evaluator, I want failure recovery measured, so that I can
    identify candidates who use test failures as useful information.

14. As a candidate evaluator, I want evidence freshness measured, so that final
    claims can be compared against the last edit and last verifier.

15. As a candidate evaluator, I want claim-evidence alignment, so that final
    summaries can be checked against actual telemetry.

16. As a candidate evaluator, I want conversion metrics such as tool calls,
    edits, verifier runs, and verifier passes, so that I can compare how much
    effort turned into evidence.

17. As a candidate evaluator, I want timing metrics such as time to first edit
    and time to first verifier, so that I can understand working cadence.

18. As a candidate evaluator, I want edit-to-verifier delay measured, so that I
    can see whether the candidate keeps feedback loops tight.

19. As a candidate evaluator, I want resource churn metrics, so that broad,
    repeated, or unstable edit patterns are visible.

20. As a candidate evaluator, I want repeated edit hotspots reported, so that I
    can see where the candidate churned.

21. As a candidate evaluator, I want technique signatures, so that the report
    describes how the candidate works, not only whether they passed.

22. As a candidate evaluator, I want to distinguish verifier-first, explorer,
    prompt-heavy generator, debugger, and risky shipper signatures, so that I
    can compare candidate style to team expectations.

23. As a candidate evaluator, I want workflow-style signals such as loop-driven
    or prompt-driven work included, so that modern agentic workflows are
    differentiated from manual prompt-heavy sessions.

24. As a candidate evaluator, I want all major findings linked to evidence
    references, so that the report is auditable.

25. As a candidate evaluator, I want the report to expose limitations and
    missing signals, so that weak telemetry is not overstated.

26. As a Lyo user, I want the evaluator to be read-only, so that historical
    interview ledgers can be scored without mutating them.

27. As a Lyo user, I want scoring rules to be versioned, so that reports remain
    comparable and explainable over time.

28. As a Lyo user, I want evaluate mode separated from learn mode, so that
    offline learning cannot silently change interview scoring.

29. As a Lyo developer, I want the evaluator to reuse the normalized action and
    effect model, so that interview evaluation does not create a parallel
    telemetry grammar.

30. As a Lyo developer, I want the evaluator to reuse workflow-style analysis,
    so that loop-driven and prompt-driven patterns are computed consistently.

31. As a Lyo developer, I want the evaluator implemented as a deep module with a
    small interface, so that CLI behavior and report generation can be tested
    independently.

32. As a Lyo developer, I want task context parsing and validation to be
    explicit, so that malformed rubrics fail clearly.

33. As a Lyo developer, I want tests built from SQLite-backed telemetry
    fixtures, so that the evaluator is validated against the same source shape
    used by real Lyo sessions.

34. As a Lyo developer, I want outcome classification tested independently from
    formatting, so that later report fields can evolve without breaking core
    scoring behavior.

35. As a Lyo developer, I want no persistence in the first implementation, so
    that evaluation remains safe while the report shape is still being
    calibrated.

36. As a future product owner, I want this local evaluator to be separate from
    HR delivery workflows, so that the technical scoring layer can mature before
    hosted invitations, sharing, identity, and dashboards are built.

## Implementation Decisions

- The first implementation is a read-only evaluator, not a coaching system.

- The evaluator lives above the existing compiler/effect/reporting layer. It
  consumes normalized actions and existing report outputs rather than parsing
  raw hook events independently.

- The first public report version is `lyo/candidate-at-bat/v1`.

- The first mode is `evaluate`. Learn mode is explicitly out of scope for the
  first implementation, though the report should be shaped so future learning
  proposals can consume it offline.

- The CLI should expose the evaluator through the existing report command using
  an at-bat flag and a required task-context input.

- Task context should be supplied as a local JSON file for the first
  implementation. This avoids adding database schema or hosted configuration
  before the report has been validated.

- Task context must include a task identifier, task complexity, expected
  pattern, success criteria, allowed tools, and baseline fields.

- Task context may include verifier specs. A verifier spec should include an
  identifier, command pattern, verifier kind, required flag, and optional match
  mode.

- Verifier specs are language-agnostic. Examples include `pytest` for Python,
  `bundle exec rspec` for Ruby, `mvn test` or `gradle test` for Java, `ctest`
  for C++, `go test`, `cargo test`, `xcodebuild test`, typecheck commands, and
  build commands.

- When verifier specs are present, verified progress requires all required
  verifier specs to pass after the final meaningful edit. A passing unrelated
  verifier must not satisfy the required evidence.

- The at-bat report should expose `shipReadiness`, `verifierQuality`,
  `matchedVerifiers`, and `missingRequiredVerifiers`.

- The at-bat report should expose `finalClaim` with posture, verifier mention,
  blocker mention, summary, and supporting evidence references.

- Baseline fields should start as rubric metadata, not inferred telemetry. The
  first version should accept baseline values such as existing tests passing,
  build succeeding, and known issues.

- The evaluator should produce a single JSON object containing report version,
  mode, run identifier, task context, outcome, scorecard, conversion metrics,
  timing metrics, resource churn, technique signatures, evidence references,
  and limitations.

- Outcome classification should start with five classes:
  `verified_progress`, `regression`, `unverified_claim`,
  `clean_stop_with_justification`, and `blocked_without_resolution`.

- `verified_progress` requires meaningful work followed by relevant passing
  evidence after the final meaningful edit.

- `unverified_claim` should be emitted when edits occur and the run stops
  without fresh verifier evidence after the final edit, or when task-context
  required verifiers are missing despite unrelated verifier activity.

- `regression` requires evidence that the final state is worse than baseline,
  such as a required verifier failing after the candidate's work when the
  baseline says the corresponding verifier or build previously passed. If
  baseline evidence is unavailable, the evaluator should avoid overclaiming
  regression and report a limitation.

- `clean_stop_with_justification` should be conservative in v1. It should only
  be emitted when telemetry contains enough stop or final-summary evidence to
  support the classification. The first implementation should require a blocker
  posture, no unsafe write, and no local edits.

- `blocked_without_resolution` is the fallback when there is no verified
  progress, no justified clean stop, and no clear regression.

- The scorecard should expose booleans or small enums for verified progress,
  stopped-after-edit-without-verification, inspect-before-edit, clean stop,
  failure recovery, risk control, and claim-evidence alignment.

- Timing metrics should be derived from action provenance timestamps. If
  timestamps are missing or inconsistent, the report should emit null values and
  list a limitation.

- Resource churn should be derived as report-time counts over the action trace.
  The canonical effect model should remain set-based; write frequency and
  repeated hotspots are derived report fields.

- Technique signatures should be evidence-backed labels, not personality
  guesses. Initial signatures should include verifier-first, explorer,
  prompt-heavy generator, debugger, risky shipper, loop-assisted, and
  loop-driven candidate.

- Workflow-style classification should be incorporated as one input to
  technique signatures. It should not replace outcome scoring.

- Risk control should use existing unsafe-write, external-action, and
  approval-friction predicates plus task-context allowed tools.

- Success criteria matching should be conservative in v1. The evaluator can
  report that verifier evidence exists, but it should not claim semantic
  satisfaction of free-text success criteria unless the criteria can be mapped
  to concrete verifier commands or evidence references.

- Evidence references should include the minimum supporting action and hook
  identifiers for major conclusions.

- The evaluator should include a limitations array whenever it cannot infer
  token counts, final claims, baseline state, exact verifier relevance, or
  subprocess lineage.

- No database schema changes are required for the first implementation.

- No append-only persistence is required for the first implementation.

- No LLM judge is required for the first implementation. If an LLM-assisted
  judge is added later, it must operate after deterministic normalization and
  must emit schema-constrained annotations with evidence references.

- Hosted HR workflows are outside this implementation target. Email
  invitations, candidate identity, sealed database transfer, dashboards, and
  company rubric management should be separate product layers.

## Testing Decisions

- Tests should validate external report behavior from telemetry fixtures and
  task-context inputs, not private classifier internals.

- Unit tests should cover outcome classification for verified progress,
  unverified claim, blocked without resolution, and conservative regression.

- Unit tests should cover scorecard fields such as inspect before edit,
  stopped after edit without verification, failure recovery, risk control, and
  claim-evidence alignment.

- Unit tests should cover final-claim posture for unsupported completion claims,
  evidence-citing completion summaries, and justified blocker stops.

- Unit tests should cover timing and churn metrics, including missing timestamp
  behavior.

- Unit tests should cover technique signature selection for verifier-first,
  explorer, prompt-heavy generator, debugger, risky shipper, and loop-driven
  candidate patterns.

- CLI tests should invoke the report command against temporary SQLite ledgers
  and a temporary task-context JSON file, then parse the JSON output.

- CLI tests should verify that missing task context fails with a clear error.

- CLI tests should verify that malformed task context fails with a clear error.

- Regression tests should prove that running the evaluator does not write to
  historical ledgers.

- Report-version tests should verify that the output includes the exact
  `lyo/candidate-at-bat/v1` version string.

- Evidence tests should verify that major outcome and scorecard conclusions
  include supporting evidence references when available.

- Limitation tests should verify that missing token counts, missing final
  claims, missing baseline evidence, and missing timestamps are exposed rather
  than silently ignored.

## Acceptance Criteria

- A user can run a local at-bat report for a specific run and task-context file.

- The report is valid JSON and includes report version, mode, run identifier,
  task context, outcome, scorecard, conversion, timing, churn, technique
  signatures, verifier relevance fields, final-claim evidence, evidence
  references, and limitations.

- The evaluator reuses the existing normalized action, effect, semantic, and
  workflow-style layers.

- The evaluator performs no database writes.

- The evaluator does not provide live coaching or next-action suggestions.

- The evaluator does not require network access.

- The evaluator does not require an LLM.

- Typecheck passes.

- The full test suite passes.

## Out of Scope

- Hosted interview session orchestration.

- Sending recorded sessions to HR teams.

- Candidate identity, authentication, invitations, or signed reports.

- Tamper-proof storage or sealed database transfer.

- Company dashboard UI.

- Live candidate coaching during evaluation mode.

- Automatic rubric mutation from learned behavior.

- Persistent learning artifacts.

- LLM-based semantic judging.

- Full subprocess tree capture beyond currently available telemetry.

- Measuring long-term maintainership, product judgment across weeks, or team
  communication outside the recorded session.

## Further Notes

This PRD intentionally keeps the first at-bat evaluator close to the current
Lyo architecture. The existing telemetry compiler already gives the necessary
source material:

```text
NormalizedAction trace
-> effect summary
-> temporal predicates
-> workflow-style report
-> candidate at-bat report
```

The evaluator should be useful even before Lyo becomes a full interview product.
It gives the project a concrete implementation target that turns current
compiler work into a product-facing artifact: a versioned evidence report about
how a candidate uses AI-assisted coding loops to get on base.
