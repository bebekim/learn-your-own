# Findings in ordinary work: checked evidence and revision

Current local main package: `0.4.3-adaptive.5`, including the ordinary-finding-feedback implementation.
See the [semantic audit and rollout](../evidence/ordinary-finding-feedback-2026-09-10/assessment.md)
for validation and installed-command evidence.
For the first ordinary-work trial, use the [restart handoff](first-real-task-handoff.md),
which includes a live-capture preflight and the current evidence limitations.

The feedback path now requires retained results from registered local checks:

```text
versioned finding delivery
→ register the application, prediction and evaluator before acting
→ review what the evaluator establishes, citing its retained files
→ live hooks capture the declared tool action before and after execution
→ automatically measure and assess the retained result
→ recompute validity and the next hook delivery
```

A delivered banner remains delivery-only evidence. A passing task is insufficient
on its own. Review labels cannot contradict the registered measurements.

## Ordinary-session workflow

The hook names the finding, delivery and store. Start by inspecting the finding:

```sh
rtk proxy lyo finding inspect --finding-id <id> --store <path>
rtk proxy lyo finding register --input opportunity.json --store <path>
rtk proxy lyo finding inspect --finding-id <id> --store <path>
rtk proxy lyo finding semantics --input semantics.json --store <path>
# Perform the exact registered tool action. Hooks capture, measure and assess it.
rtk proxy lyo finding pending --store <path>
```

Each delivery includes a `registrationTemplate`. Fill in a unique application ID,
task ID, claim kind (`deterministic` or `improvement`), conditions, prediction,
falsification condition, evaluator identity/version,
three check commands, the verifier's dependency files and the source files it
measures. The action is the exact delivered advice and cannot be substituted.
`cwd` must identify the workspace of that delivery. Keep `--store` explicit across
commands; the telemetry corpus and the delivery ledger remain separate databases.

A registration has this shape (illustrative placeholders, not runnable checks):

```json
{
  "id": "application-1",
  "findingId": "finding:example",
  "deliveryId": "session-delivery:example",
  "taskId": "target-parser-task",
  "cwd": "/absolute/workspace",
  "claim": {
    "kind": "deterministic",
    "conditions": "The target parser contract is being changed.",
    "action": "The exact advice emitted in this delivery.",
    "prediction": "The declared target contract holds after applying the advice.",
    "falsifiedBy": "The intact target-contract evaluator explicitly reports false."
  },
  "checks": {
    "applicability": "node /absolute/check.mjs applicability",
    "adherence": "node /absolute/check.mjs adherence",
    "prediction": "node /absolute/check.mjs prediction"
  },
  "verifierFiles": ["/absolute/check.mjs"],
  "sourceFiles": ["/absolute/workspace/src/parser.ts"],
  "evaluator": {"id": "target-contract", "version": "1"},
  "timeoutSeconds": 5,
  "capture": {
    "runtime": "codex",
    "toolName": "apply_patch",
    "toolInput": {"command": "<exact planned patch>"}
  }
}
```

Commands run locally through the existing verifier runner. Each must exit zero
and emit exactly one JSON object: `{"satisfied": true}`, `false`, or `null`.
A nonzero exit, timeout or malformed output means an unknown check result. A
counterexample requires a successfully executed evaluator explicitly reporting
`false`; a crashed test process cannot invalidate the advice.

Registration runs applicability and initial adherence checks and retains source
and evaluator snapshots. Measurement runs adherence and prediction checks, retains
their outputs and the measured source snapshot, and detects changed verifier files
or source mutation during checking. The declared files must cover the evaluator's
inputs/dependencies. Files are retained inline (at most 1 MiB each). Source files
may be absent before an action creates them; verifier files must exist.

Adherence must be false before the action and true afterward to establish a new
checked application. If it was already true, or either observation is unknown,
LYO cannot credit a later application. Caller discipline still matters: register
before the actual action. Automatic capture additionally requires paired live
host events, a shared tool-call ID, exact tool name/input, runtime/session/workspace,
and an unchanged starting source. Missing or rewritten inputs remain pending or unknown.

Inspection exposes registration, retained file contents, action boundaries, measurement,
`semanticReviewTemplate`, assessment history and `reviewTemplate`. Fill the semantic
review with an attributed reviewer (`human` or `agent`), `verdict` (`accepted` or
`disputed`), the prospectively declared `claimKind`, and a rationale with retained
`verifierPaths` for each of applicability, adherence and prediction. Explain why
the prediction follows from the delivered advice; an unrelated success check is
insufficient. State evaluator limitations. An agent review is identifiable and is
not an independent verifier. The reviewer cannot change claim kind after results.
Old registrations without a declared kind remain unqualified; start a new prospective
opportunity instead of retrospectively upgrading them.

After paired Codex/Claude hooks, the collector executes the registered checks and
records an assessment automatically. Without accepted semantics all conclusions
stay unknown; raw outputs remain inspectable. Improvement claims retain predicate
observations but their content-validity outcome and incremental benefit stay unknown.
A later semantic review changes the evidence dependency hash; the next live hook
supersedes the old automatic assessment using the retained measurement.

`capture` is optional for explicit CLI use. Without it, `finding measure` and
`finding feedback` remain available, with the same semantic gate and no host-order
claim. `capture.toolInput` is the exact canonical hook JSON, including optional
arguments the host sends. Codex reports `Bash` and `apply_patch` inputs in `command`;
Claude uses its own tool arguments. Registered finding actions bypass the proxy
recovery experiment's command rewriting. Other hooks may still rewrite inputs;
those cannot silently validate the original action.

No model call invents an evaluator or semantic judgment. The ordinary-session
agent must declare the relevant decision and review the checks. This increment
automates the collection, measurement, assessment and pending-review delivery after
that declaration, not the discovery of a correct evaluator for arbitrary advice.

## What changes in the next prompt

| Checked evidence | Current effect |
|---|---|
| Accepted semantics, deterministic claim, applicable, followed, prediction supported | Retain one checked application for that version/context |
| Inapplicable on this application | Record `scopeReviewFeedbackIds`; do not exclude every task sharing a repository/activity |
| Accepted semantics, deterministic claim, applicable, followed, prediction contradicted | Suspend that wording as `needs-revision` |
| Unknown or unusable measurement | Award no support or contradiction |
| Withdrawn or corrupt evidence used by a wording revision | Suspend dependent wording as `needs-reassessment` |

Multiple applications of one delivery can be reviewed separately. The same
measurement cannot be reused for another delivery. Multiple registrations of one
host action count once for the same finding, using runtime/session/tool-call identity. Corrections to a review do not
create another evidence unit. Application counts are not counts of independent
transfer trials, causal benefit, or automatic scope promotion.

Initial selection still uses canonical Git common-directory/directory identity,
the declared activity and explicit activity tags. This fix removes automatic
repository-wide exclusions inferred from individual misfires. Semantic scope
revision, task-aware trigger selection and broader-scope trials remain open.

## Correct evidence or revise advice

Correct a review's metadata with a new review naming the current review in
`supersedes`; its labels must still match the retained measurement. Correct a
mistaken semantic interpretation with a new `finding semantics` receipt naming
the previous semantic review in `supersedes` and setting `verdict: "disputed"`.
This invalidates prior assessment credit and dependent revisions. Correct a broken
measurement by withdrawing it:

```sh
rtk proxy lyo finding withdraw --input correction.json --store <path>
```

The input contains `evidenceRef`, `author` and `rationale`. Withdrawal is append-only
and idempotent for identical input; it does not rewrite outputs or rerun the check.
Current credit disappears, and dependent wording is marked for reassessment before
routine delivery. All historical evidence and unaffected applications remain
inspectable. A fresh evaluation requires a new registered opportunity; an old
measurement cannot be edited or silently measured again with a different check.

A content revision uses `finding revise --input revision.json --store <path>` with
`id`, `findingId`, `previousVersion`, new `intervention`, `feedbackIds`, `author` and
`rationale`. Its premises must be current checked contradictions of that version.
The replacement is provisional; old support does not transfer to it. Withdrawal
or supersession of a premise also suspends descendant wording. Re-grounding a
suspended derivation and qualified semantic scope revision remain explicit further
work; this increment does not invent replacement premises.

## Evidence and trust boundaries

The delivery store's existing `learning_trace` journal holds registration,
measurement, semantic judgments, live action boundaries, withdrawal, version-2
assessment records and pending-review prompt receipts. Payload hashes, row ordering,
workspace/delivery/version binding and registered file snapshots are checked.
Historical unqualified assessments remain visible in `feedback` and
`unverifiedFeedbackIds`; they no longer drive validity or scope. Derived wording
without current checked premises requires reassessment. No live data was migrated.

These checks establish integrity and execution against a declared evaluator.
Attributed semantic review is required, but it does not mathematically prove that
the evaluator expresses the lesson's meaning, covers all
relevant cases, detects actual agent behavior correctly or is independent. A
constant or incorrectly specified check can still be a bad evaluator. Its quality
requires review and later validation; semantic dispute and withdrawal provide correction paths.
This is a deterministic predicate-checking path, not a statistical benefit test.

Only declared local files are fingerprinted; interpreter versions, external
services and undeclared dependencies are not attested. The ledger is a trusted
local writer boundary, not tamper-proof storage against its owner. Hashes detect
inconsistent retained records; they cannot authenticate a malicious replacement
of the entire history.

Completed registrations and measurements are idempotent. An interrupted
registration/check may need recovery or re-execution; no exactly-once shell
execution is claimed. Live capture runs before deferred spool replay; replay never
measures current files as an earlier event's result. A captured post-action state
is frozen before checks execute. Recovery checks that source and evaluator files
still match that capture; otherwise the result stays unknown. Already completed
measurements are never silently rerun. A missing post-event stays pending, even if
the files later appear successful.

Automatic checks have a one-second timeout each; at most one new measurement runs
per live hook boundary. Every matching action snapshot is captured before any
check runs. Remaining captured work is durable and recovered by later hooks in the
same canonical workspace, including a new session. Source drift during recovery
is an explicit evidence problem. PostToolUse context and SessionStart/UserPromptSubmit delivery surface
pending assessments, semantic disputes, scope review and content review, once per
queue state per session. It works even when the contradicted advice is suppressed.
No clean SessionEnd is required. `finding pending --all` lists the complete store queue. Completed measurements
from other repositories are surfaced for review without revisiting those repositories
or running their checks again. Missing action evidence remains tied to its workspace;
no result is reconstructed merely because work moved elsewhere.

Broader scope evaluation, generated scope/wording revisions, independent reviewer
qualification and demonstrated benefit remain open. Already emitted prompt text
cannot be removed. Upgrade the CLI and session hook together; older hooks do not
read these decisions. ECA/Bob retain their existing telemetry/delivery coverage;
this paired finding-capture path currently supports Codex and Claude.

Relevant code: [registered checks](../src/lyo/selection/session-finding-evidence.ts),
[feedback/state](../src/lyo/selection/session-findings.ts),
[hook](../src/lyo/selection/session-hook.ts), [CLI](../src/cli/commands/findings.ts).
[Evidence tests](../tests/session-finding-evidence.test.ts),
[feedback tests](../tests/session-finding-feedback.test.ts) and
[built package tests](../tests/package.test.ts) exercise the path.
The [chain recheck](../evidence/finding-evidence-validation-2026-09-10/assessment.md)
records the four corrected audit boundaries and their remaining limits.
