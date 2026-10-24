# Session telemetry, finding outcomes and applicability revision

State: partial — registered finding evidence and feedback implemented;
real usefulness and learned generalization unvalidated (2026-09-11).
Current baseline: main `f39ed6c`, source package `0.4.3-adaptive.8`.

Soundness audit: `feat/finding-evidence-contract`, against implementation `70a5e9e`.
That audit identified four gaps. The [runtime recheck](../evidence/finding-evidence-validation-2026-09-10/assessment.md)
now covers registered-check evidence validation, task-local misfires, duplicate
evidence and withdrawal propagation. The [ordinary-session increment](../evidence/ordinary-finding-feedback-2026-09-10/assessment.md)
adds attributed semantic review, live paired-action capture, automatic assessment
and pending-review recovery. Declaring the opportunity/evaluator and judging its
semantics still require an agent or human; the target contract exceeds this implementation.

## Objective

Later outcomes must revise the validity of learning and the context in which it
is inserted. Start from that decision and work backward to the necessary evidence:

```text
next delivery eligibility
← current finding version + validity + context exclusions
← reviewed applicability, adherence and outcome
← exact emitted finding/version/context + later evidence
```

Cost is a constraint. The primary acceptance target is a reliable connection from
later evidence to learning/context revision and subsequent ordinary work.

## D-3 → D-2 → D-1 target contract (partially implemented)

D is an ordinary workflow that improves through learning and corrects its advice
or applicability from subsequent evidence. D-3 supplies observations, D-2 assesses
what they establish, and D-1 determines the next eligible intervention. Evidence
must not acquire a stronger meaning merely by crossing one of these boundaries.

### D-3: one declared opportunity and its evidence

Before the relevant action, retain a versioned claim: **when** these conditions
hold, **do** this action, **expect** this observable result, with a declared
falsification condition and evaluator. State whether the claim concerns a
deterministic requirement or an improvement measured over repeated trials.

Bind the opportunity to the emitted finding/version, separately versioned scope,
host/session, task/decision and starting source state. Use a durable opportunity ID;
one banner can be relevant to several distinct decisions within a session. A
delivery ID alone is not an application ID. The owning delivery store must remain
explicit when collecting observations from the central telemetry database.

Retain precondition observations, action evidence, the relevant check results and
their source/event identities. Resolve references to retained local records or
fingerprinted artifacts; an arbitrary nonempty reference is not checked evidence.
Reuse existing artifact hashes and registered-verifier machinery. Check identity,
content integrity, event order and the source/verifier versions actually measured.
Wall-clock proximity, matching command names and repository identity cannot
substitute for this binding. Uncertain ordering or incomplete capture stays unknown.

A prediction registered after the action is retrospective evidence, not a
prospective test. Observing a passing check does not establish that the recommended
action was followed. Changed source/verifier data must produce an explicit evidence
problem, never silently evaluate a different claim.

### D-2: assess only what D-3 establishes

An assessment references the opportunity and exact evidence snapshot, evaluator
identity/version and rationale. Keep these conclusions separate:

| Conclusion | Evidence required |
|---|---|
| Applicable / inapplicable / unknown | Observations of the declared conditions at this opportunity |
| Followed / not followed / unknown | Relevant action evidence, not the banner or the agent's completion status |
| Prediction supported / contradicted / unknown | Relevant intact verifier evidence for the claim and measured source state |
| Incremental benefit established / unknown | Qualified comparison evidence, not merely a successful application |
| Evidence usable / incomplete / disputed | Reference resolution, provenance, ordering and evaluator checks |

Inapplicability at one opportunity says nothing by itself about all later tasks
in that repository. An unrelated task failure does not contradict a lesson.
Unknown applicability or adherence prevents a content-validity judgment. If the
conditions, action or evaluator are disputed, preserve that dispute; do not force
a choice between defective advice and defective context.

Mechanical facts can be collected automatically. Semantic judgments need an
explicit reviewer with cited evidence until the evaluator itself is qualified.
An LLM proposal is not an independent verifier. Existing manual attestations must
remain identifiable and cannot silently become checked evidence through migration.
Human override, if retained, must remain distinguishable from automatic assessment.

Deduplicate evidence units by their actual observation/opportunity identity, not
review IDs or reference strings alone. Multiple deliveries/reviews can cite one
result without creating additional independent support. Repeated attempts on one
task remain related evidence; they do not become independent transfer trials.
Keep trial assignment and no-guidance/withheld decisions with their outcomes.
Evidence only from selected successful deliveries cannot justify applicability
outside those observed conditions. Use explicit boundary trials to reassess an
exclusion; otherwise a mistaken exclusion can prevent the observations that would
correct it.

### D-1: constrain the update to the assessed claim

The decision consumes the exact current assessment and its dependency versions.
It must record which evidence changed which wording/scope and why. Its possible
effects are bounded:

| Established evidence | Permitted update |
|---|---|
| One opportunity was inapplicable | Record the misfire and request scope review; do not infer a repository-wide exclusion |
| A scope predicate includes demonstrably wrong situations | Propose a separate scope revision, tested against retained applicable and inapplicable cases |
| Applicable, followed advice has a verified counterexample to its deterministic claim | Suspend the contradicted claim pending review; retain unaffected narrower claims and their evidence |
| One successful application | Retain version/scope-specific evidence; no automatic broader validity or causal-benefit claim |
| A registered broader-scope comparison qualifies | Permit provisional broader use under that trial's criteria while retaining the narrower scope |
| Evidence is unknown, incomplete or disputed | No new support, content revision or generalized exclusion; retain the pending assessment |

An unsuccessful trial is not automatically a counterexample to a probabilistic
improvement claim. Such claims use the evaluator and comparison criteria declared
before trial results. No arbitrary support-count threshold is introduced here.
The separate task comparison remains experimental-only. The registered ordinary
trial comparison is connected to scoped delivery: a completed qualifying cohort
can promote, and later failed/unknown outcomes pause it. Its assumptions and
correction rules are in the [trial protocol](../docs/prospective-finding-trials.md).

Content and scope revisions have separate identities and retain their parents.
Broader-scope failure suspends that broader claim; it does not erase supported
narrower applicability. A newly proposed narrower rule must be tested on later
independent cases, not validated on the counterexample used to construct it.

Corrections propagate through dependencies: evidence → assessment → content/scope
revision → selection decision. A superseded premise marks dependent decisions for
reassessment and prevents routine reuse of that unsupported derivation. Preserve
all history and any unaffected independent evidence. Old-version evidence remains
attached to its original version; no support transfers automatically to replacement
wording. Extend the existing journal replay rather than adding a graph framework.

### Ordinary-session completion and operational proof

After a relevant check completes, durably collect its evidence and expose the
pending assessment at a hook boundary where review can occur. Do not depend solely
on a clean session-end event: interrupted sessions must leave recoverable pending
work that a later hook can surface. Missing feedback or elapsed time is not a
negative outcome. Track eligible opportunities, delivery attempts, observed use,
completed assessments and pending evidence separately.

Retries must be idempotent across collectors, reviews and selection. An emission
without reliable acknowledgement stays delivery-only/uncertain; it cannot establish
adherence. The next hook must read the same store and the current revision. Retain
the exact selected version/context and the reason for a changed decision. Upgrading
the CLI and hooks together is a required live-integration check.

### Ordered TDD acceptance gates

These are complete target requirements; the coverage note below distinguishes
the implemented subset. Build one
vertical slice per gate, red → green → refactor, reusing the existing ledger.

1. **Evidence-bound application:** declare one opportunity before action, capture a
   real retained check/action, assess it and inspect the resulting hook output.
   Missing references, another task's passing check and missing adherence cannot
   award support. Reuse artifact hashing and verifier identity checks.
2. **Task-specific applicability:** two different tasks in one repository/activity
   can have different applicability. A misfire on the first cannot silence the
   second. The assessment must cite the actual precondition observations.
3. **Unique and timely evidence:** duplicated delivery/review/collector events count
   one evidence unit. A prediction added after the action is retrospective. A
   changed verifier/source cannot certify the prior claim.
4. **Content versus scope:** an intact counterexample changes the appropriate claim;
   ambiguous evidence changes neither. A broader failure preserves the narrower
   supported scope. Additional lessons present in the same task do not each acquire
   causal credit from its passing result.
5. **Correction propagation:** supersede an observation or review and inspect the
   affected descendant revision and next delivery. They require reassessment;
   unaffected scopes and evidence remain usable. Preserve existing late-version
   evidence behavior; task-level misfires must not recreate coarse exclusions.
6. **Ordinary-session integration:** replay real-format Codex and Claude hook events,
   including interruption/retry; recover pending review; record assessment; then
   assert the next actual hook output and receipt. Assert all commands use the same
   delivery store. Package checks precede local rollout; live work supplies the
   subsequent usefulness evidence.

The first five gates establish contract integrity under their tested assumptions.
They do not establish evaluator accuracy or agent benefit. Independent later work
and controlled comparison remain the proof needed for promotion/generalization.

Current gate coverage: gate 1 has registered checks, declared snapshots, fixed
claim kinds, attributed semantic review and paired live action evidence; gate 2 has the no-generalized-exclusion
regression but no semantic scope revision; gate 3 has identity, duplicate,
pre-existing-adherence, paired host-call order, and file-integrity guards; missing
hooks and undeclared dependencies remain unknown/unattested;
gate 4 has content suspension and scope-review requests, not broader trials;
gate 5 suspends dependent content on withdrawal, with re-grounding still open;
gate 6 has Codex/Claude live-hook capture, automatic measurement/assessment, durable
pending-review prompts, retry/recovery tests and built/configured-command checks.
Semantic reviewer judgment, dependency completeness and actual useful outcomes
remain trust/evidence boundaries. This does not automatically generate a correct
evaluator, replacement wording or a generalized scope.

## Implemented

- [x] The existing [session bridge](../src/lyo/bridge/session-bridge.ts) retains
      recovered verifier observations without causal credit.
- [x] [Finding delivery](../src/lyo/selection/session-hook.ts) records version,
      canonical context, session, delivery identity and available prompt hash.
- [x] [Feedback](../src/lyo/interface/session-findings.ts) records applicability,
      adherence, outcome, verifier identity, evidence reference and rationale.
- [x] Supported observations are associated with the delivered version/context.
- [x] Inapplicable applications request scope review without excluding other tasks
      sharing a repository/activity.
- [x] Contradicted, applicable, followed advice suspends that version pending revision.
- [x] Unknown/unfollowed outcomes cannot manufacture a validity judgment.
- [x] Content revisions cite current feedback, preserve history and return as
      provisional versions; late outcomes cannot contaminate replacement wording.
- [x] Corrections supersede review metadata; withdrawing a measurement removes
      current credit and suspends wording with dependent premises.
- [x] [Registered local checks](../src/lyo/interface/session-finding-evidence.ts)
      bind the delivered action, application and evaluator/file snapshots. Unknown,
      failed, unrelated or inconsistent evidence cannot award support.
- [x] [CLI inspection](../src/cli/commands/findings.ts) exposes registration/review
      templates, pending applications, measurements and revision history.
- [x] [Behavior tests](../tests/session-finding-feedback.test.ts) and
      [built-executable checks](../tests/package.test.ts) exercise the complete path.

## Evidence boundary and remaining work

- [ ] Obtain independently assessed outcomes from real ordinary sessions and
      demonstrate that these revisions improve subsequent work.
- [x] Automate capture and assessment for explicitly declared Codex/Claude tool
      actions with paired live evidence and reviewed evaluator semantics.
- [x] Surface pending, disputed, content-review and scope-review work in ordinary
      sessions, including interrupted sessions; recovery never substitutes later source.
- [ ] Qualify evaluator semantics independently and automate preparation of correct
      opportunity contracts for arbitrary ordinary work.
- [ ] Refine applicability beyond canonical repository/directory, activity and
      automatic-versus-explicit insertion route.
- [ ] Propose and test broader scopes, retaining supported narrower scopes when a
      broader claim fails. This increment adds no automatic scope widening.
- [x] Connect the registered ordinary comparison to scoped promotion, later pause
      and correction. General scope discovery and useful real effects remain open.
- [x] Refresh the reasoning mandate and currently eligible guidance on user turns,
      compaction and resume; preserve control assignment and application identity.
      Session banners cannot receive legacy validation credit.
- [ ] Extend equivalent adaptive task evaluation to ECA/MLX, Bob and Go.

The former proposal to credit lessons from session efficiency is withdrawn.
A review attestation is not an independently reproduced causal effect. Findings
remain separate from ordinary lesson helpful/harmful counters and legacy gates.

Use the [workflow and input contracts](../docs/scoped-session-findings.md).
Feedback belongs to the chosen delivery store, normally
`~/.zeroshot/lyo-lessons.db`; source observations also exist in the central corpus.
The original `.4` [rollout record](../evidence/ordinary-finding-feedback-2026-09-10/assessment.md)
is historical. The `.8` [refresh record](../evidence/context-refresh-2026-09-11/README.md)
checks built and installed configured commands. Actual host dispatch and useful
later outcomes must be observed separately. The withdrawn efficiency proposal is
retained in the [archive](done/7-session-efficiency-proposal.md).
