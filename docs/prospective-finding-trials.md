# Prospective finding trials

An opportunity exists before deciding whether to deliver a finding. This allows the ordinary workflow without added advice to supply an outcome without inventing a delivery receipt.

## Evidence boundary

`finding register` accepts either the existing `deliveryId` or a `prospective` object containing `sessionId`, `trialId`, `model`, `findingVersion`, and `context`. These forms are mutually exclusive. The prospective form requires paired live action capture and retains the same source files, verifier files, eligibility check, and adherence-before check used by existing finding evidence. The action must match the current finding version. Neither registration nor assignment proves that advice reached the model.

An attributed semantic review qualifies the evaluator. `finding assign --opportunity-id <id>` then records a 50/50 advice/no-advice assignment. Retrying that command returns the original decision. A trial cannot enroll the same session twice or enroll it after the finding has been delivered there. Assignment and delivery must precede the captured action. Changed source, changed verifier, or suspended finding prevents a new decision.

The delivery adapter calls `emitFindingOpportunity` only after assignment. The no-advice arm emits nothing and creates no delivery receipt. A successful emission records the exact finding version. A receipt establishes emission, not attention or adherence. An I/O failure between emission and durable receipt remains a delivery uncertainty; it is not evidence of benefit.

Both arms use the same predeclared prediction check. `observedOutcome` records pass/fail/unknown independently of adherence; `outcome` retains the existing, stricter deterministic claim-support meaning. Without an actual delivery, a passing result cannot award lesson support. An assignment without delivery remains an assigned-but-undelivered observation rather than silently becoming a control. A withdrawn or semantically disputed measurement becomes unknown on reinspection.

Prospective observations without delivery are inspectable through `finding inspect`. They are omitted from agent-facing review prompts to avoid exposing withheld advice through a review request.

## Approved sequence and status

1. `feat/finding-opportunities`: prospective records, assignment, delivery, paired measurement, and compatibility with existing validity evidence.
2. `feat/ordinary-lesson-trials`: implemented reusable reviewed trigger/evaluator configuration and automatic opportunity recognition/capture in Codex/Claude hook boundaries.
3. `feat/finding-policy-feedback`: comparisons across new tasks, traceable scoped decisions, later delivery consuming those decisions, and evidence correction. Pending.

The current increment does not establish causal benefit: `incrementalBenefit` remains unknown. Existing task-pair comparisons require identical task fingerprints; arbitrary new tasks must not be relabeled as those pairs. Ordinary-session trial analysis needs its own declared eligibility, session/exposure handling, outcome window, and missingness treatment. Token cost is a diagnostic, not a substitute for useful outcomes.

Completion requires a real chain from opportunity through outcome and revision to a later session using the revision, followed by another observation. Synthetic tests establish implementation behavior only. A complete loop can conclude that a lesson is unhelpful; evidence of useful learning requires improved later outcomes.

## Ordinary-session adapter

Register a reviewed definition once with `lyo finding trial-register --input trial.json --store <central-lessons.db>`; inspect definitions with `lyo finding trials --store <central-lessons.db>`. This is configuration of a reusable mechanism and evaluator, not per-ticket registration. See `finding-trials.ts` for the strict schema and `tests/helpers/finding-trial-fixture.ts` for a synthetic example.

A definition fixes the finding version, repository roots, model, exact diagnostic tool/input, source paths relative to each workspace, absolute verifier paths, claim/checks, and attributed semantic review. A non-interrupted failure of that diagnostic creates a prospective opportunity; a checked precondition must still pass before random assignment. Missing model identity, changed verifiers, and suspended/revised findings cannot enroll. The opportunity retains the definition hash and triggering tool identity/hashes. An ineligible registration remains unassigned and inspectable; it contributes no comparative result.

The advice is returned as host hook context after the diagnostic, before the agent chooses its next action. This does not modify a system prompt or rewrite an already dispatched tool call. The first later tool call of the declared name is bound by its actual input and call ID at pre/post boundaries. The same evaluator measures either arm. A missing, interrupted, or mismatched action remains unknown. Repeated hook calls neither rerandomize nor emit the lesson twice; spool replay cannot discover a trial in hindsight.

The trial controller owns delivery for registered findings, suppressing their ordinary banners and agent-facing review requests. An enrolled session also skips the separate native recovery intervention. Operators retain `finding inspect` and legacy `finding pending` access. No live definition has been enabled by the implementation tests; a production trial needs a real reviewed trigger and outcome evaluator. A copied review remains the original reviewer's assertion about that unchanged evaluator, not a new independent semantic judgment.
