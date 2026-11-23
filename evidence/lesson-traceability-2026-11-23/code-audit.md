# What the current lesson machinery establishes

Source inspected at repository commit `93442fa`. This is a code-mechanism audit, not a claim that each retained historical lesson was produced by this exact code version. Historical attribution requires the lesson's CREATE/EDIT receipts and referenced source events.

The retained inventory separates four `historical-corpus-analysis` / `local-evidence-review@1` lessons, two `session-bridge` lessons, and two `elaborator@1` lessons. The bridge rules below describe the current mechanism; they are not the authoring history of all six verifier reminders. See [per-lesson audit](README.md) and [CREATE/EDIT snapshot](lesson-snapshot.json).

## Recovery reminders

The bridge reads result events in `(created_at, rowid)` order and accepts a command observation only if a recognized verifier command has a usable runner summary or command status. Conflicting summary/status signals are skipped. Piped verifiers require a retained summary. [Observation extraction](../../src/lyo/bridge/session-bridge.ts#L34), [status resolution](../../src/lyo/bridge/session-bridge.ts#L51).

For each of the first three distinct failed verifier command strings in the session, it finds the first observed failure and the last observed result. A passing last result creates a candidate with two references and a fixed reminder to rerun that check after editing. [Candidate construction](../../src/lyo/bridge/session-bridge.ts#L106).

A student-followable account can therefore say: **a result for this command was classified as failed, and a later result for the same normalized command in this session was classified as passed**. The student must still inspect how those classifications were produced. The retained reference is a locator; its name does not validate its contents.

The construction does not require a source repair diff, an unchanged verifier, a reproducible task state, a controlled removal/restoration test, or a held-out outcome. It also does not retain working-directory identity in the command-observation tuple. Alternative explanations include environment recovery, changed tests, changed inputs, a misleading summary, or different invocations normalized to the same command. Missing, filtered, delayed and post-closure observations can change the apparent timeline.

A stale session boundary is explicitly an inference of completeness after twelve quiet hours; the bridge does not mark the session ended. An existing v2 receipt prevents later re-observation. Thus an empty or final-looking summary is not evidence that the entire activity has been observed. [Closure assumptions](../../src/lyo/bridge/session-bridge.ts#L73), [stale-session selection](../../src/lyo/bridge/session-bridge.ts#L84).

## CREATE, EDIT and counting

A new lesson gets candidate status, zero helpful/harmful counts, and an append-only CREATE delta with the supplied explanation, intervention, actor/model metadata and run provenance. The store requires a failure class; it does not require a structured proof of the explanation. [Creation boundary](../../src/lyo/storage/lesson-store.ts#L419), [CREATE payload](../../src/lyo/storage/lesson-store.ts#L487).

An existing candidate/active lesson with the same failure class and normalized cue receives an EDIT delta and unioned run provenance. Its original explanation and intervention remain unchanged. The newer proposed text and references exist in the EDIT payload rather than the displayed lesson row. A complete explanation must traverse **all CREATE/EDIT deltas**, then resolve each evidence reference; reading only the current explanation loses later observations. [Merge behavior](../../src/lyo/storage/lesson-store.ts#L449).

The bridge cue hashes `(repoPath, command)` and skips repeat processing if the same session is already in provenance. Its returned `createdLessonIds` can include an existing lesson returned by a merge, so that field is not necessarily a count of newly inserted lessons. [Bridge deduplication](../../src/lyo/bridge/session-bridge.ts#L116), [store return on merge](../../src/lyo/storage/lesson-store.ts#L479).

`uses` counts inserted injection/application rows, deduplicated by lesson/run/trigger identity. It is not a count of adherence, successful teaching, or improved outcomes. [Application recording](../../src/lyo/storage/lesson-store.ts#L670).

## Generic explanations and their source paths

The elaborator prompt asks an LLM to propose an abstract explanation and transferable intervention from validator feedback. The output parser checks text fields and length, and clamps optional confidence. It does not verify whether the cited evidence entails the explanation. [Proposal prompt](../../src/lyo/reflection/elaborator-reflector.ts#L59), [parser](../../src/lyo/reflection/elaborator-reflector.ts#L88).

The template reflector instead wraps the validator feedback directly. Candidate replay can also import supplied lesson text. Those are alternative code paths. In this audited store, the two generic lessons' CREATE records specifically attribute them to `elaborator@1`, `openai/gpt-4o-mini`, and run `azure-beacon-8`; the original task and validator messages are retained. That establishes recorded attribution, without independently proving which historical implementation version ran. [Template](../../src/lyo/reflection/reflector-policies.ts#L51), [replay import](../../src/lyo/eval/replay.ts#L81).

## Refutation and benefit are different claims

For a scoped reminder, first separate:

- **Historical observation:** this check reported failure on the referenced invocation. Counterevidence would show misclassification, a reference to another invocation, or an infrastructure/argument failure being presented as an implementation defect.
- **Recovery interpretation:** the repair fixed that failure. Changed tests, changed inputs or environmental recovery undermine this inference; controlled removal/restoration against the same evaluator can distinguish these explanations.
- **Applicability:** the check covers the proposed later edit. A demonstrated uncovered behavior, obsolete command or absent test can dispute that scope without denying the historical event.
- **Benefit:** delivering the reminder improves later work. This needs a predeclared comparison with sound outcomes and costs. An inconclusive comparison leaves benefit unknown; it does not refute every possible narrower use.

The ordinary session bridge records `observed-pass`, `observed-fail` or `unobserved`, with `causalCredit: false`. [Observation-only outcomes](../../src/lyo/bridge/session-bridge.ts#L145).

The separate registered-finding path supplies stronger argument records: successful evaluator execution with explicit strict JSON, accepted attributed semantics, applicability and before/after adherence checks, and preserved unknown outcomes. An individual application still has `incrementalBenefit: unknown`. A reviewer citation establishes that a judgment was recorded, not that the evaluator is semantically correct or causally independent. [Evaluator result boundary](../../src/lyo/interface/session-finding-evidence.ts#L19), [semantic-review boundary](../../src/lyo/interface/session-finding-semantics.ts#L7), [assessment limits](../../src/lyo/domain/finding-assessment.ts#L15).

Session banners withhold zero-credit lessons by default unless explicitly enabled. Historical delivery/uses therefore must not be read as evidence of present eligibility. [Banner selection](../../src/lyo/selection/session-hook.ts#L115).
