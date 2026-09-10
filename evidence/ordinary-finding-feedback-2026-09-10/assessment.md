# Ordinary finding feedback: reverse design and semantic audit

Branch: `feat/ordinary-finding-feedback`, based on `23ea3f4`.
Package: `0.4.3-adaptive.4`. No npm publication or main-branch merge in this increment.

## Work backward from the result

| Boundary | Required observable behavior | Implementation and proof |
|---|---|---|
| D: next ordinary work receives justified guidance | A checked deterministic counterexample suppresses the old advice and surfaces a review; uncertainty cannot award support | [Session hook](../../src/lyo/selection/session-hook.ts), [packaged/configured-command probe](verify-rollout.mjs) |
| D-1: decide what can change | Current evidence dependencies determine validity; inapplicability requests scope review; disputed premises invalidate assessment credit and derived wording | [Finding state](../../src/lyo/selection/session-findings.ts) |
| D-2: assess the declared claim | Retain attributed semantic review, cited verifier snapshots and limitations. A failed improvement trial is not a deterministic contradiction. Keep incremental benefit unknown | [Semantic review](../../src/lyo/selection/session-finding-semantics.ts), [semantic regressions](../../tests/session-finding-semantics.test.ts) |
| D-3: collect the necessary observations | Bind a prospectively declared action to live before/after hooks, exact call identity and file snapshots; capture before deferred spool replay; recover only compatible retained evidence | [Action capture](../../src/lyo/selection/session-finding-capture.ts), [workflow](../../src/lyo/selection/session-finding-workflow.ts), [capture regressions](../../tests/session-finding-capture.test.ts) |

The D-3 → D-2 → D-1 direction is execution; D → D-1 → D-2 → D-3 is the design
order. The implementation reuses the append-only finding journal, existing local
verifier runner, host adapters and feedback/state replay. No model service,
dependency, new database or general graph framework was added.

## Semantic review findings

The prior implementation checked evidence integrity but accepted evaluator
booleans as semantic judgments. It did not distinguish a deterministic requirement
from a probabilistic improvement claim. This let an unrelated but intact predicate
affect advice validity without an attributed review of its meaning.

The new path requires separate rationales for applicability, adherence and
prediction, each citing retained verifier files. The claim kind is declared before
the action; a later review cannot change it after observing results. Missing,
disputed or inconsistent semantics preserves raw measurements but prevents new
validity judgments. A reviewer can still make an incorrect judgment: this is an
auditable trust boundary, not mathematical proof of natural-language correctness.
Agent judgments remain identified as agent judgments, not independent verification.

Review of the [three installed findings](../scoped-session-findings-2026-09-10/findings.json):

| Finding | What its source establishes | What an ordinary-session assessment must not infer |
|---|---|---|
| Compare source/target semantics and boundary cases | The prior guided repair mishandled U+0085; JavaScript `trim()` leaves that character intact. The [local Node probe](semantic-probe.json) reproduces the narrow runtime fact | Comparing contracts is a process recommendation. A later failed target test does not by itself refute the recommendation or prove it was followed. The prediction must identify the particular defect expected to be prevented/detected, and adherence needs separate evidence of the comparison |
| Audit coverage, fix ambient guidance and separate execution from approval time | The reported comparison omitted a relevant Unicode case and had uncontrolled guidance/timing | More tests, a passing suite, or a completed checklist does not establish semantic coverage or a controlled comparison. Each named control needs evidence; the combined recommendation is an improvement hypothesis |
| Set an enforceable learning-trial budget and account for all costs | Earlier runs exceeded allowances and reported incomplete implementation/orchestration costs | Finishing under budget does not prove the cap was enforced; a post-run total is not a pre-execution stop. Cap enforcement needs a refusal/stop test and accounting needs complete receipts. Neither alone establishes useful learning |

These findings remain unvalidated recommendations. This increment does not
retrofit deterministic guarantees onto them, revise their source text, widen their
scope or manufacture positive outcomes. The narrow Unicode fact is not proof that
the compound intervention improves agent work.

## Ordinary workflow and recovery

An agent/human declares the opportunity and exact planned canonical tool input
before acting, and reviews the evaluator with `finding semantics`. The hooks then
capture the action, measure it and record an assessment. Pending semantic/content/
scope review is injected at PostToolUse and at later session/prompt delivery.
Prompt receipts deduplicate each queue state per session and remain delivery-only.

One live action counts once even if multiple registrations cite it. A missing pre
or post event, mismatched call/session, changed starting source, changed verifier,
or source drift before crash recovery cannot award support. Completed measurements
are reused rather than rerun. A later semantic review can supersede an earlier
unknown automatic assessment from its original retained evidence. No clean
SessionEnd is needed. The next session reads the same delivery store. Retained
measurements can be reviewed in a different repository, without re-executing the
old task; the cross-repository recovery regression proves this distinction.

Automatic checks run with at most one second per command, with at most one new
measurement per live hook. All matching action snapshots are retained before any
evaluator executes. Further work is recovered by later hooks in that workspace;
if no hook arrives, it stays pending. Spool replay itself does not run evaluators.
Declared actions are excluded from the proxy recovery experiment's command rewrite;
this prevents one controller from changing the action another is measuring.

The [Codex](https://learn.chatgpt.com/docs/hooks) and
[Claude](https://code.claude.com/docs/en/hooks) contracts expose tool-call identity
at before/after hooks and model-visible additional context after tools. The
package probe uses those shapes with actual local file changes and isolated stores.
It does not launch a model or write fixture observations into the user's library.

## Validation and rollout

[Full validation](validation.json): 649 tests, 648 passed, one sandbox localhost
skip, zero failures, with `--test-concurrency=2`. The default-concurrency run hit
the existing corpus-report 1500ms subprocess timeout; its threshold was not changed.
After removing duplicated package fixture setup, all eight package/capture checks
passed again, and final typecheck passed. [Opcore](robustness.json) passed with
zero errors and 14 retained warnings. Coverage still has unsupported JavaScript
surfaces and degraded Python/Rust tooling; those are not claimed as clean checks.

[Local installation](installation.json) upgraded the CLI and hook together from
`0.4.3-adaptive.3` to `0.4.3-adaptive.4`. All 183 installed source files match the
tested staged package. [Configured-command verification](rollout.json) passed for
both Codex and Claude, including immediate review context and suppressed next
delivery. The hook JSON definitions, ECA/Bob settings and global agent instruction
hashes stayed unchanged. Codex's general `config.toml` changed during verification;
this work did not edit it, and its current hook states are retained separately.
The prior package is backed up locally. No fixture was added to the user's library,
no coding model was launched, and no npm-registry publication was performed.
`verify-rollout.mjs` checks both built-package and configured installed commands:
delivery → registration → semantic review → paired action → automatic assessment
→ immediate review prompt → duplicate callback → suppressed next delivery plus
recoverable review. Its outputs are mechanical fixture evidence, not useful learning.

The full-suite regression exposed a separate availability bug: a finding-store
lookup failure prevented the native controller from running. Read-only lookups
and independent failure handling fixed that boundary; no robustness rules changed.

## Remaining limits

- Registration and semantic interpretation are still agent/human work. Hooks do
  not infer a sound evaluator from arbitrary advice, nor prove that the agent
  followed an injected prompt. The before/after predicate and its relationship to
  the planned tool action remain explicitly reviewed assumptions.
- Only declared files are fingerprinted. Undeclared dependencies, interpreter/
  environment changes and concurrent outside edits are not a hermetic execution
  proof. Source drift detected during collection/checking yields unknown.
- Improvement hypotheses require registered controlled comparisons. Successful
  deterministic observations are not independent trials or established benefit.
- Content and scope review requests are delivered, but new wording, semantic scope
  predicates, broader trials and re-grounding suspended derivations are not generated
  automatically. Repository/activity selection remains the existing bounded scope.
- ECA/MLX and Bob retain their prior capture/delivery coverage. The new paired
  finding-action assessment path supports Codex and Claude. Go remains separate.
- Local database writers/reviewer identities are trusted. Hashes detect inconsistent
  records, not a malicious owner replacing a whole history. Already emitted advice
  cannot be retracted from a model's context.

The operational link is testable and live-installable; independently useful
learning and generalization remain unproven.
