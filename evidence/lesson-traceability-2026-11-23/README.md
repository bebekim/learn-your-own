# Can a student follow why each lesson was made?

Audit snapshot: 23 November 2026; report finalized 24 November 2026.
Implementation inspected: `93442fa`.
Reviewer: Codex agent. These are attributed judgments, not independent causal verification.
Scope: all eight rows in the personal lesson store at the captured read snapshot.
No stored lesson was revised, suspended, promoted or awarded credit. Ordinary host
hooks continued collecting this investigation. No evaluation model runs were launched.

## Finding

Every lesson has an identifiable authoring route. None currently has a complete,
recheckable argument establishing its broad future usefulness. The differences matter:

| Lesson | What can be followed | What remains unsupported | Audit disposition, not a store mutation |
| --- | --- | --- | --- |
| `les_027d0f11760e91e3` — satisfy all criteria | Original task, validator messages, model author and delivery | Compliance with mutually incompatible criteria | Revise/review before benefit testing |
| `les_93ca0ad689249c97` — make functions stateless | Same original task and validator's stateful workaround rejection | Statelessness as a general solution to conflicting outputs | Revise/review before benefit testing |
| `les_4d38b41d6661609c` — REP-675 check | Historical reviewer, two sessions, exact recorded call/output references | Original outputs cannot currently be rechecked; repair cause and transfer | Preserve as historical attestation; recover sources before stronger claims |
| `les_6507fb874b5106ac` — REP-671 check | Historical reviewer and two recorded session pairs | Same retention and causal gaps | Same |
| `les_5786abb453e33871` — REP-674 check | Historical reviewer and two recorded session pairs | Same retention and causal gaps | Same |
| `les_decf0d0bec470f39` — REP-621 check in REP-655 | Historical reviewer and two recorded session pairs | Same gaps; delivery is not observed benefit | Same |
| `les_5572502d207f95ea` — REP-744 check | Local hook events and stale-session bridge receipt | Retained events lack a successful test summary/status; failure may be infrastructure | Reassess what the historical bridge claimed |
| `les_542317744bf1b7ea` — transcript-import check | Local failure/pass test summaries, command, session and source ledger | Repair causality, test coverage and future benefit | Strongest candidate for a narrowly scoped next investigation |

All eight remain `candidate` in the captured store. Its 606 application records are
81 `pending` and 525 `unobserved`; helpful and harmful counts are zero. This is absence
of recorded outcome credit in this snapshot, not proof that nobody benefited.
`uses` counts delivery/application bookkeeping. It does not establish adherence.
See [lesson snapshot](lesson-snapshot.json) and [code audit](code-audit.md).

## A lesson's argument must have separate links

A student should be able to follow this chain and challenge any link:

1. **Claim and scope:** exactly what advice is asserted, under which conditions.
2. **Observed premises:** source identities, dates, inputs, outputs and measurement
   meanings; preserve the smallest sufficient, privacy-safe source evidence.
3. **Inference:** why those premises support this claim, with explicit assumptions.
4. **Alternatives and counterevidence:** competing causes and actual contrary
   observations, including what was not measured. A missing observation is not an
   executed false evaluator result.
5. **Refutation and revision:** what result would challenge which link, what checks
   would distinguish the alternatives, and which downstream wording depends on it.
6. **Current conclusion:** supported local fact, attributed interpretation,
   provisional recommendation, disputed claim or unknown benefit. These are different.

An argument can be fully traceable and conclude that a claim is unsupported. The
purpose is to let a student assess the reasoning, not persuade them past uncertainty.

## 1. “Always ensure all acceptance criteria are addressed”

ID: `les_027d0f11760e91e3`. Created by `elaborator@1`, model
`openai/gpt-4o-mini`, from run `azure-beacon-8`. The CREATE record retains the proposed
explanation and wording. Source ledger: `~/.zeroshot/azure-beacon-8.db`.

**Premises that survive:** original issue message
`msg_f0e1afa0f5e38de33e4dd3216f4a4f6f` requires `greet('Ada')` to equal
`Hello, Ada!` and also to begin with `Hi, `. Worker progress
`msg_88457798109b91201f856ead6bc26d68` explicitly flags the contradiction.
Validator message `msg_8372acba2681d20f321d944c9072c479` rejects choosing only the
second output and also identifies the conflict. These are retained message claims;
this audit did not rerun the original implementation. The contradiction in the
written contract can be checked directly: `Hello, Ada!` does not start with `Hi, `.

**Inference problem:** the explanation blames failure to satisfy all criteria.
Under the stated same-input deterministic contract, a function returning a string
cannot satisfy both. More careful implementation alone cannot make that conjunction
true. The worker's recorded conflict diagnosis is material counterevidence to a
simple inattentiveness account. The general advice to review criteria is reasonable,
but this incident does not establish its future effectiveness.

**Defensible narrower candidate:** identify mutually exclusive required results
for the same input and ask the requirement owner to resolve the contract before
claiming completion. This is a proposed revision, not an automatically validated lesson.

**How to challenge it:** recover a missing condition that distinguishes the calls,
authorized contract revision, or a different specified return type. That would change
the incompatibility argument. To establish benefit, test the proposed intervention
on later requirement-conflict tasks with a separately reviewed outcome evaluator.

The source messages are in [source checks](source-checks.json). This lesson was later
emitted in `USER_GUIDANCE_AGENT` message `msg_0edc16a39bf98cc907cf05901696193b`.
The earlier rejected `LYO_FEEDBACK` belongs to a different intervention whose lesson
list was empty; it cannot be attributed to this lesson. See
[local source checks](local-source-checks.json), `generic_followup`.

## 2. “Design functions to be stateless when outputs depend on input order”

ID: `les_93ca0ad689249c97`. Same author/model/run as lesson 1. Its CREATE record
attributes failure to the stateful nature of `greet.js`.

**Retained observation:** validator message `msg_ede0a91553de97043b2e8cef7044efb4`
reports first call `Hello, Ada!`, second call `Hi, Ada!`, and rejects alternating
answers as a way to satisfy the incompatible requirements.

**Inference problem:** replacing that stateful workaround with a stateless function
still cannot satisfy the written conjunction. Moreover, genuinely order-dependent
contracts sometimes require state or an explicit state parameter. This source
supports rejection of this workaround, not a universal preference for statelessness.
The two generic lessons derive from the same task; they are not independent replications.

**Defensible narrower candidate:** varying an answer by hidden call order does not
resolve two incompatible requirements that both apply to the same call. Do not claim
a passing alternating sequence satisfies a per-call contract.

**Refutation boundary:** an explicit alternating-call requirement or explicit state
input would make the contract different. Later task benefit remains unknown. A test
of this candidate must include both incompatible specifications and legitimate
stateful specifications, so it does not reward blanket removal of state.

## 3–6. Historical verifier reminders

These four lessons were created by `historical-corpus-analysis` with reflector
`local-evidence-review@1`, not by the current session-bridge template. Each retains
two session pairs, exact transcript paths, line numbers, call IDs, declared exit
codes, working directories and output SHA-256 values. The historical report still
exists at `~/.lyo/learning-runs/2026-09-09T031457Z-work/candidates.json`; its current
SHA-256 is recorded in [local source checks](local-source-checks.json).

| Lesson ID | Recorded check | Top-level failure → recovery pointers |
| --- | --- | --- |
| `les_4d38b41d6661609c` | `uv run pytest tests/test_rep675_transactional_comms_view.py` | `hook-46b14cf72d6aff1f3afa4489` → `hook-a2f59fd29b4f07da139e5d73` |
| `les_6507fb874b5106ac` | `uv run pytest tests/test_rep671_acquisition_completed_view.py` | `hook-71d96bece56aabbea106ccbf` → `hook-8c34a0584c429455d7ec3d2f` |
| `les_5786abb453e33871` | `uv run pytest tests/test_rep674_life_support_registered_view.py` | `hook-05b8c5aeb1831e20514df57f` → `hook-928cedeef36746231204a320` |
| `les_decf0d0bec470f39` | `uv run pytest tests/test_rep621_crystalbrook_monthly_invoice_delivery.py` in REP-655 | `hook-5332e927e1c141eb029860bf` → `hook-d2ec4c0af8b9058bd1627b03` |

**Observed today:** the referenced hook rows resolve in the central corpus; local
source copies checked also exist. Those digests retain no numeric exit status or
test-summary counts for the top-level pairs. All eight original transcript files
are absent at their recorded paths. A filename search under current Codex sessions
found no matching files for the selected known session IDs; `archived_sessions` is
absent. This is a bounded search, not proof that no backup exists anywhere.

The sixteen declared failure/recovery transcript checks therefore have **unknown**
hash and header verification, not sixteen observed mismatches. A retained hash cannot
reconstruct a missing output. The historical review is a traceable attestation;
this audit cannot independently re-establish its exit-code observations.

**Argument a student can assess for each reminder:** if the historical status
reading was accurate and the check still measures relevant behavior, running that
check may detect similar failures after later edits. Two reported recovery sessions
motivate a provisional repository-specific reminder. They do not identify the repair,
prove it caused recovery, or establish that reminding an agent improves later work.

For REP-675, relevance is specifically to the transactional-comms check; for REP-671,
to acquisition-completed behavior; for REP-674, to life-support registration; and for
REP-655, to the particular REP-621 invoice-delivery test. These filenames are scope
locators, not a verified account of each test's coverage. Renaming, deleting or
weakening the test, or changing its dependency environment, may invalidate that scope.

**Alternatives:** dependency/environment recovery, fixture or verifier changes,
flaky behavior, or mismatched working directories could produce a fail/pass pattern.
The archived and active REP-655 ledgers contain duplicate copies of the same event
IDs and payload hashes; copies are not independent observations.

**Next distinguishing checks:** recover the exact source outputs or a trusted
minimal completion envelope; retain source/test versions; verify the failure class
was an assertion relevant to the lesson; and compare later advice/no-advice tasks.
A contrary current test result challenges the current recommendation only in its
stated scope; it does not erase a historical event. These four are not yet ready to
serve as clean examples of fully followable evidential arguments.

## 7. REP-744 plan-switch validation reminder

ID: `les_5572502d207f95ea`. Actor: `session-bridge`.
Advice: run `pytest tests/test_rep744_plan_switch_validation.py -v` after final edits.

**Retained chain:** the lesson points to failure `hook-598e2abbc03a6a5cc27fba2f`
and recovery `hook-75f704e15927099d3d37582e`. The local ledger and corpus agree on
those payload hashes. A `native-session-observation` receipt classifies the first
as failed and later commands as passing, with `closure: stale` and `causalCredit: false`.

**Witness limitation:** the original failure callback retains an `internal` error
digest, not an assertion diagnosis; the final callback retains neither numeric exit
status nor test-summary counts. The retained shell commands also change from
`python3 -m pytest` to `uv run python -m pytest`. The bridge canonicalizes both into
the same verifier command. That loses a potentially important environment distinction.
The bridge's old pass label is derived evidence, not an additional independent witness.

**Conclusion:** there was a failed tool callback and a later completed callback;
the presently retained primary fields do not establish the stated test-failure/test-pass
story. An infrastructure/launcher problem remains plausible. Reassessment should
recover source status and failure meaning before strengthening this lesson.

**Refutation/probe:** a preserved assertion summary would establish a test failure;
a launcher/dependency failure would support a different lesson. A passing check in a
different environment does not by itself establish repair of the first failure.

## 8. Transcript-import verification reminder

ID: `les_542317744bf1b7ea`. Actor: `session-bridge`.
Advice: run `node --test tests/transcript-import.test.ts` after the final edit.

**Retained observation:** two events resolve in the local source ledger under
`.claude/worktrees/account-ban-chat-backup-4cf3f3/.agent-learning/learning.sqlite`:

- `hook-8ba550db1af60e351181a089`: retained Node summary `passed: 3, failed: 1`.
- `hook-4fb2f848fdc9a71324b225d1`: retained Node summary `passed: 4, failed: 0`.

They share session `0850dc6c-1c63-42c5-b1a2-cb04d3c05cac` and working directory.
Their output-filter pipelines differ; the bridge extracts the same underlying
verifier. The end-of-session receipt binds these references with `causalCredit: false`.
The corpus lookup misses these IDs, while the source ledger retains them: a concrete
example of why an empty central search is not evidence that no verification occurred.

**Inference:** under the collector's summary-provenance assumptions, this test
reported a failure and later reported all four passing. That supports the narrowly
worded historical reminder that the check detected a failure during this work.
The files were on a separate feature branch; the test is not present on audited main.
The candidate scope must bind to that subsystem/branch or its later landed equivalent.

**What it does not establish:** which change fixed the failing test, whether tests
were weakened, complete importer correctness, agent adherence on a later task, or
benefit from delivering this reminder. Output text could in principle be replayed or
mixed; retained summary counts alone do not independently authenticate execution.

**Next distinguishing checks:** retain the exact source and verifier revisions,
inspect the relevant repair and failure category, run the check on broken/restored
source where possible, and only then register a later-task comparison. A changed
verifier, different branch or unreproduced failure must remain visible. This is the
strongest current source-observation chain, not a validated beneficial intervention.

## Deliverable and experiment decision

The existing lesson store contains provenance, partial observations and proposals;
it does not yet make these complete arguments available as one coherent explanation.
The next product increment should expose a lesson argument view with observed premises,
inference, alternatives, counterevidence, scope, current limits and dependency links.
Do not backfill missing evidence with plausible prose.

Before testing benefit, review the two generic explanations against their
incompatible source contract and repair the source retention/scope gaps for a
selected reminder. These audit judgments are not registered evaluator counterexamples. The import-test
reminder is the best current starting point for a mechanism audit because it retains
explicit test counts. It is not automatically selected for a paid trial. No model
budget was needed or spent on new evaluation runs here; this agent's orchestration
usage was not measured and is not being represented as zero total cost.

## Reproduction and limits

Primary audit artifacts:

- [lesson-snapshot.json](lesson-snapshot.json): all eight lessons, CREATE/EDIT
  history, retained hook metadata and aggregate application outcomes.
- [source-checks.json](source-checks.json): original contract/validator excerpts,
  sixteen attempted historical transcript checks and two locally resolved events.
- [local-source-checks.json](local-source-checks.json): top-level source-ledger
  comparisons, intervention/feedback identities and historical-report fingerprint.
- [code-audit.md](code-audit.md): source-linked generation and credit rules.
- [manifest.json](manifest.json): SHA-256 values of the data and collector scripts.

The three retained Python collectors are read-only and make no provider requests.
They open SQLite with `mode=ro`, and the main collector also uses `query_only` and
read transactions. Run from the repository root on the original machine. They use
`/tmp/lyo-traceability-*.json` intermediate outputs; the committed snapshots aggregate
application rows and restrict source excerpts. SQLite WAL access may require host
filesystem approval. No private raw tool output is copied into this report.

The lesson-store and corpus snapshots were opened separately, not atomically as a
pair. Original stores can grow after this audit. Missing corpus rows, missing paths,
zero credit and missing assessments have different meanings; none is automatically
proof of absence of the underlying activity. The raw source records themselves are
trusted local records, not tamper-proof independent evidence. The conclusions above
are limited to this snapshot, its inspected sources and the declared interpretations.

## Validation of this audit artifact

Artifact checks verified all snapshot hashes, the eight-lesson count, the 606
application total and outcome breakdown, the missing-source/unknown distinction,
the retained 3/1 → 4/0 test counts, collector syntax and local Markdown links.
A second agent reviewed the report against the snapshots and source rules.
Typecheck passed. The complete 749-test suite passed with test concurrency 2.
An earlier default-concurrency run passed 748 and failed one existing eligibility
test; its four-test file then passed in isolation. The cause of that transient
failure was not established. These checks validate artifact consistency and the
repository gate, not the lessons' semantic validity or future benefit.
