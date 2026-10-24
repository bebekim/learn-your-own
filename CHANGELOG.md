# Changelog

## Unreleased

- Move the remaining top-level modules under `src/lyo/` (behavior unchanged): pure types, behavior and classification into `lyo/domain/`; the ledger, its schema (now `ledger-schema.ts`), db and reducers into `lyo/storage/`; hook adapters into `lyo/hooks/adapters/`; and `contract`, `hooks`, `compiler`, `corpus`, `runner`, `eval`, `activation`, `measurement` and `cli` as `lyo/` feature folders. `src/cli.ts`, `src/index.ts` and `src/version.ts` stay as the package entry points, so the public exports and bins are unchanged. The LYO cycle check now covers the moved code; two type-only cycles were removed (candidate at-bat report types and the runner `ExecutorFactory`). Remove the unused `src/types/federation.ts`. `lyo eval control` hashes its own source as its instrument identity, so that hash changes with the new import paths.
- Remove the Shepherd telemetry boundary: the `lyo telemetry inspect|convert-shepherd|compile|consume|serve` commands and the telemetry exports from the package entry (`decodeTelemetry`, `shepherdExportToTelemetry`, `startTelemetryServer`, `consumeTelemetryOutbox` and related types). The compiler's own telemetry-run functions are unchanged. Existing ledgers keep their unused `telemetry_cursors` table.

- Add opt-in action-scoped finding delivery (`LYO_ACTION_SCOPE_FILE`): after an agent edit or shell call, a calibrated Jev Noul question decides whether a finding's activity applies; matching findings are delivered once per session after the trial check, with a `scope` field on the receipt. Ships the transfer-review calibration (held-out: 20/22 caught, 2/80 false alarms); one call per plan, a per-session cap and a 1.5 s timeout bound cost.
- Add `lyo decide calibrate`: Noul threshold bands against labelled cases per stratum (false positives, recall, unknowns), with retained, reusable decisions and an explicit insufficient-sample flag below 20 positives or negatives.
- Add a `TypedDecisionProvider` interface for Choice/Score/Noul decisions, a TypeSafe Jev adapter (`POST /v1/systemone`, `GET /v1/models`, pinned `jev-1.14.0`, contract-checked responses, 429/529 backoff), unknown-preserving verdict bands, and `lyo decide` / `lyo decide models`. Enabled only by `TYPESAFE_API_KEY`; not yet wired into hooks or trials. See `docs/typed-decisions.md`.
- Add `lyo lab run` / `lyo lab report` (Spec 9): parallel paired advice/no-advice runs of registered tasks in isolated worktrees, analysed with the task-stratified exact test. Whole tasks are admitted against the token budget before launch; changed verifier files make an outcome unknown. Tested with a scripted executor only.
- Add session-unit trials: `enrollment: { unit: "session", maxPerRepository }` with the required `evaluation.method: "stratified-exact"`, an exact repository-stratified randomization test of no effect (`minimumEffect: 0`). Validity needs fair assignment and no interference between sessions, not independent outcomes. The cap applies only while the cohort is collecting.
- Add an opt-in `evaluation.method: "exact-binomial"` for prospective trials: exact unconditional bounds on the pass-rate difference, needing about a fifth of the Hoeffding sample at equal power. It assumes independent outcomes; definitions without `method` keep Hoeffding.
- Withhold legacy lessons with no validated outcome from session banners; banner delivery cannot earn them credit. `LYO_SESSION_UNVALIDATED_LESSONS=1` restores the previous behavior.
- Anchor `--*-from-event-cwd` hook records at the checkout root, so events after the agent changes into a subdirectory reach the workspace ledger instead of a stray `.agent-learning/`.
- Type-check all TypeScript tests by default, with an explicit exclusion list for nine existing files; JavaScript tests remain unchecked.
- Repoint documentation links to finding modules moved into `src/lyo/interface/` and `src/lyo/domain/`.

## 0.4.3-adaptive.9 (evidence architecture)

- Extract finding assessment, lifecycle and trial-policy rules into the domain, with application-owned ports for assessment, revision, selection and live-boundary ordering.
- Enforce inward domain/application imports and remove LYO runtime and type-import cycles; preserve existing entry points, receipt identities and correction behavior.
- Keep trial-managed advice withheld from ordinary banners and count support only for the delivered version and context.
- This refactor changes code ownership, not the threshold for claiming useful learning. General coding benefit remains unvalidated.

## 0.4.3-adaptive.8 (context refresh)

- Refresh the standing proxy-versus-witness mandate and current eligible lessons on SessionStart and UserPromptSubmit, including repeated compactions.
- Retain explicit activity tags across compaction/resume in the same workspace; a new prompt or clear resets them. Recheck current finding validity and bind delivery references to their workspace/context.
- Restore previously delivered trial advice only while its assignment, model, files, policy and unstarted outcome window remain valid. Never expose withheld advice or reopen a previous turn's trial.
- Exclude delivery-only session banners from run-level validation credit; retain the existing registered-evidence gate for finding outcomes.
- Wire both refresh events in newly initialized workspaces and preserve all guidance fragments in ECA's shared delivery adapter.
- Repeated context is an intervention mechanism, not proof of adherence or useful learning.

## 0.4.3-adaptive.7 (prospective trial rollout)

- Register reviewed reusable finding trials and enroll eligible ordinary Codex/Claude sessions before their next action.
- Retain randomized advice/no-advice outcomes independently of adherence, with closed unknown outcomes and control-exposure guards.
- Use fixed prospective comparisons to change scoped delivery, monitor promoted applications, and revoke decisions after corrected evidence.
- Preserve trial, trigger, finding-version, measurement, and policy provenance; replacement scopes start with fresh evidence.
- Implementation checks are synthetic; no production trial or demonstrated real-task benefit is claimed.
- Include the prospective trial guide in the local installation archive.

## 0.4.3-adaptive.6 (local feedback-loop rollout)

- Reject new finding applications from suspended or superseded deliveries.
- Retain finding version and validity at the live action boundary; preserve legitimate late outcomes for the version used.
- Retain a runnable SQLite counterexample → revision → later delivery exercise with real parser checks. Independent prompt benefit remains unproved.
- Keep provenance, staged validation and state-dependent rechecking; defer builders, auctions and distributed coordination.

## 0.4.3-adaptive.5 (local main rollout)

- Consolidate the task/finding feedback implementation and real-session evidence onto main.
- Ship the first-trial handoff with the package and start from the normal project directory.
- Include report/native-feedback tests in typechecking; separate report data types to meet the file-size guardrail without changing evaluation behavior.
- Preserve the existing evidence limits: ordinary command-status gaps and demonstrated intervention benefit remain unresolved.

## 0.4.3-adaptive.4 (local rollout)

- Require attributed evaluator-semantic review and prospectively fixed claim kinds before finding validity can change.
- Capture declared Codex/Claude actions at live paired hooks; automatically measure and assess retained results, deduplicate observations and recover pending reviews across sessions.
- Preserve unknown and improvement-trial outcomes; invalidate assessment dependencies on semantic disputes.
- Keep declared finding actions out of proxy recovery command rewriting.


## 0.4.3-adaptive.3 — local experimental release

- Deliver approved observed findings by repository identity or explicit activity tags, with evidence references and unvalidated-usefulness labels.
- Allow newly applicable findings later in a session; retain delivery-only traces without awarding lesson credit. Older hooks cannot mistake these traces for ordinary lessons.

## 0.4.3-adaptive.2 — local experimental release

- Derive a candidate from a retained task failure and repair, then test the claimed change by removal and restoration under the frozen verifier.
- Retain the model request, response, costs and failed analyses. A different verifier failure cannot substantiate the claimed original cause.
- Preregister a fixed candidate-advice versus no-advice trial through the existing task workflow; export the candidate in the existing lesson-library format and retain comparison verdicts without automatic promotion.
- Accept a model response enclosed in a Markdown JSON fence; explicitly recheck a retained response with `--reuse-analysis`, preserving the failed record and counting its inference cost once.
- A live approved model request identified an edit that passed local failure/removal/restoration checks. The generated advice remains broad; later-task benefit is unverified.
- Allow an explicit evaluation budget when creating a fixed candidate trial, so a small transfer test need not inherit the source task's budget. Ship the task-workflow guide in the local tarball.
- Retain one cross-repository screen: revised advice used more tokens, both arms exceeded budget, and a later Unicode audit exposed a verifier gap. No promotion or follow-on run.

## 0.4.3-adaptive.1

- Add a registered task feedback cycle: native decision delivery, independent acceptance/regression checks, host token usage, persisted feedback, frozen policies, and later-task evaluation.
- `lyo task run` registers and launches Codex or Claude, retains the host trace, and collects its task receipt. Task commands default to the configured central database.
- Register comparison pairs and a total token-cost limit before work starts; count training costs and preserve incomplete evidence. Registered tasks train acceptance within budget instead of check recovery.
- Expose native task acceptance as unknown separately from check-recovery rewards.
- Eval report v2 accepts explicit unknown task outcomes, reports known/unknown counts, and computes success rates only over known outcomes; rates and intervals are null when none are known. Existing boolean episode inputs remain supported.
- Keep promotion inconclusive when either comparison arm has unknown acceptance. Interrupted local acceptance checks also remain unknown.

## 0.4.3-adaptive.0

- Preserve Kimi Code CLI identity when events arrive through the Claude-compatible hook command.
- Keep Kimi completion without a status signal unknown, including when normalizing older Claude-labelled payloads.
- Exclude Kimi from the native Claude recovery experiment; its measurement and delivery contract is not supported by that experiment.
- Local prerelease for hook rollout, including the fixes in 0.4.2. No claim of useful learning from everyday tasks.

## 0.4.2

- Add an opt-in persistent feedback controller, frozen evaluation, and a real-process calibration runner.
- Connect Codex and Claude recovery experiments to the central ledger with decision, delivery, and measurement receipts.
- Keep unfinished parallel retries unknown, isolate results by turn and working directory, and make prompt retries with a turn ID idempotent.
- Allow one central evaluation cutoff across host controllers. Codex output without status remains unknown in telemetry.
- Include the automatic workspace connection and IBM Bob hook support from the preceding local releases.
- These changes establish measurement and evaluation; they do not demonstrate that recovery guidance improves real tasks.

## 0.4.1

- Connect recovered session verifier failures to scoped advice and delivery/outcome receipts; retain numeric tool status through redaction and recognize RTK verifier commands.
- Block duplicate promotion/credit, unrelated lesson grouping, future-to-past credit, quarantined delivery, incomparable run comparisons and missing-cost eval wins. Snapshot all lesson delivery vehicles and include judge/corrective-retry usage.
- Distinguish real agent evaluation from verifier smoke checks. Add repeated matched-pair gates and an explicit inconclusive result, plus the recorded SemVer experiment (no demonstrated benefit).
- Correct removed explanation-graph capability claims and distinguish estimator disagreement from causal error.
- API changes: `recordLessonOutcome` requires `runId`; `loadLessons` excludes quarantined lessons unless `includeQuarantined` is set. Eval summary measurements can be `null`, comparisons can be `incomparable`, and gates can be `inconclusive`. Credit diagnostics rename `meanAbsDerivativeError` to `meanAbsWeightDifference`.

## 0.4.0

This minor release adds the workspace scaffolding and wrap commands, new
hook adapters, the offline eval layer, the blind pipeline with an
evidence-gated learning loop, and the prompt-kind telemetry and episode
compression work.

### What changed

- Workspace scaffolding: `awok init` for full workspace setup, plus
  `awok wrap kimi` / `awok unwrap kimi`.
- New hook adapters: `gemini-hook` (Gemini CLI), `agy-hook`
  (Antigravity CLI), and `dcode-hook` (Deep Agents Code).
- Offline eval layer: task fixtures and validator, lesson replay eval,
  learned verifier rule store, baseline runner, eval report and gate.
- Blind pipeline: sandboxed stage executors, artifact contracts (zod),
  block-format rules as a versioned, evidence-carrying artifact,
  sequential likelihood-ratio evidence gating, `falsifiable_by`
  requirement, confidence-gated merge decisions, and judge calibration.
- Lesson vehicles (prose, skeleton-patch, spec-constraint) and
  outcome-aware lesson selection with demotion.
- Behavior signals: deterministic command classification with family
  grouping, behavior-phase inference, zone-association outcome tracking,
  and deployment-action extraction.
- Prompt-kind layer: heuristic prompt classification, log-LR belief
  accumulation, measurement report, and evidence backfill.
- Telemetry and cost: token usage and cost in trace stage records,
  `turn_id` on model calls with cost attribution, prompt episode
  compression with cost-waste metrics, and the work-arc continuation
  rule.
- Fixed the `ended_at` loop: session end is now recorded from
  SessionEnd hooks.
- Reorganized `src/lyo/` into subdirectories.

## 0.3.0

This minor release ports the LYO learning layer from the zeroshot fork into
the kernel as first-class TypeScript modules; the learning brain now lives
here, and execution engines (zeroshot, session hooks) consume it as a
package.

### What changed

- New `src/lyo/` modules (ported from CommonJS/better-sqlite3 to strict ESM
  TypeScript on `node:sqlite`, zero native dependencies):
  - `lesson-store.ts` - lesson-delta event log, Beta-Bernoulli counters,
    Wilson promote/quarantine gates, Thompson selection, decision log with
    selection propensities, schema migrations v1-v4, `v_lesson_library` and
    `v_lyo_pair_stats` views, learning traces + preference pairs
  - `selection-policies.ts` - pluggable selection policy interface
    (`thompson-beta@1` default), Marsaglia-Tsang sampler, registry
  - `reflector-policies.ts` - pluggable reflector interface (`template@1`
    default), registry, validation-feedback formatting
  - `elaborator-reflector.ts` - async LLM reflector (`elaborator@1`) via
    OpenRouter with template fallback
  - `model-inversion.ts` - Greptile-style cross-family reflector routing
  - `failure-classifier.ts` - deterministic validation-failure taxonomy
- Re-exported from the package root (`src/index.ts`).

## 0.2.1

This patch release improves adoption after the `0.2.0` telemetry compiler
release.

### What changed

- Updated `lyo --help` to list:
  - `lyo report --effects --run-id <id>`
  - `lyo report --semantic --lower --run-id <id>`
  - `lyo audit --dir <path>`
- Documented coverage-directed classification in the README:
  - run `lyo audit --dir`
  - inspect `topUnknownCommands`
  - add deterministic rules for the highest-frequency clear misses
  - rerun audit
  - measure `normalizedActionRate` and `unknownActionRate`
- Moved deterministic classifier guidance into
  `docs/deterministic-classification.md` so the rule catalog can grow outside
  the README.
- Added deterministic classifier coverage for common package verification and
  build commands:
  - `npm run typecheck`
  - `npm run lint`
  - `node --test`
  - `pnpm test`
  - `npm run build`
- Added deterministic classifier coverage for classic command families:
  - read-only inspection commands such as `lsof`, `ps`, `stat`, `strings`, and
    `jq`
  - archive inspection such as `tar -tzf`
  - syntax checks such as `node --check`
  - Apple test/build commands such as `xcodebuild test`
  - package builder scripts such as `node scripts/pack-npm.mjs`
- Added conservative classifier coverage for audit-driven clear cases:
  - read-only SQLite inspection such as `sqlite3 ... "select ..."`
  - mutating SQLite statements such as `delete`, `drop`, and `.read`
  - dbt validation and build commands such as `dbt parse`, `dbt test`, and
    `dbt build`
  - Xcode project generation via `xcodegen generate`
- Added read-only metadata classification for local reports, package registry
  reads, help/version probes, and shell output probes while keeping mutating
  package commands unknown.
- Added parked unknown reporting for legacy/local command families such as
  `bd ...`, keeping them unclassified while moving them out of actionable
  `topUnknownCommands`.
- Added deterministic classifier coverage for the next actionable audit targets:
  - local `lyo audit` and packaged CLI audit/report probes
  - `xcrun simctl list ...`
  - `npm run pack:local`
  - `npm publish ...`
  - `docker compose up ...`
  - read-only timestamp probes such as `date ...`
  - Emacs batch parse, byte-compile, and read-only message/princ probes
- Improved the local audit corpus to 3.18% actionable unknown actions, with a
  separate 1.68% parked unknown action rate for legacy/local command families.
  The latest read-only audit over `/Users/marcus.kim/repositories/individual`
  scanned 15 ledgers, 875 runs, and 20,869 hook events.
- Added the first read-only style learning report:
  - `lyo learn style`
  - `lyo/style-learning/v1`
  - aggregate model-call/token usage
  - prompt-driven, manually orchestrated, loop-assisted, and loop-driven style
    distribution
  - verifier/debugging and unverified-edit learning signals
  - reviewable procedure, critic, context-pack, and instrumentation candidates
  - no persistence or scoring rubric changes
- Added first-class dry-run association learning:
  - `lyo learn associations --dir <path> --dry-run`
  - `lyo/association-learning/v1`
  - source-scope to verifier hypotheses from historical hook telemetry
  - support, weakening, defeater, freshness, novelty, and provenance evidence
  - explanation-graph belief reports for each generated hypothesis
  - promotion candidates and blockers for deciding which hypotheses are ready
    for later artifact delivery
  - compact promotion-oriented output via `--compact`
- Improved association learner adoption details:
  - immutable read-only ledger open fallback for historical SQLite files
  - project-root anchoring for absolute paths under common source roots
  - top-level file scopes such as `src/index.ts`
  - verifier command canonicalization for quiet pytest variants
  - separate window-level policy warnings from broader run-level policy
    warnings
- Refactored ledger discovery for repo forests:
  - added `discoverAgentLearningLedgers` with workspace root, relative workspace,
    and nesting depth metadata
  - kept `findAgentLearningDatabases` as the stable path-only compatibility API
  - documented nested child workspace behavior with a focused test fixture
  - made dependency, build, coverage, framework-cache, and virtualenv skip
    policy explicit to avoid copied or generated `.agent-learning` ledgers
  - surfaced rich scanned-ledger metadata in effect audit and association
    learning reports while preserving `scannedDatabases`
- Split CLI learning presentation and command-family tests:
  - moved compact learning output shaping into `src/cli/presenters/learning.ts`
  - moved learn, report, and audit CLI tests into command-family test files
  - extracted reusable association ledger seeding fixtures for CLI tests
- Added shared CLI test execution helpers:
  - `runLyo` for raw CLI output
  - `runLyoJson` for parsed JSON responses
  - expected-failure support for tests that assert structured CLI errors
- Split the remaining generic CLI suite by workflow family:
  - hooks
  - context/runs/model calls
  - tape/harness
  - activation
  - kept `cli.test.js` as a small smoke suite

## 0.2.0

This release moves Lyo from a passive learning ledger toward a trace and
effect-based telemetry compiler. The durable reducer core remains intact, but
there is now a read-only compiler layer that can explain agent work from real
hook telemetry.

### What changed

- Added a compiler frontend for hook telemetry:
  - raw hook events
  - normalized ordered actions
  - derived compatibility tokens
  - parsed work episodes
  - semantic observations
  - dry-run lowering plans
- Added `NormalizedAction` as the core compile-time representation.
- Added a resource/effect model over actions:
  - resources read
  - resources written
  - commands executed
  - ordered evidence refs
  - operation, intent, risk, status, confidence, and facets
- Added effect algebra helpers:
  - `emptyEffect`
  - `concatEffects`
  - `actionToEffect`
  - `foldTrace`
- Added dependency and conflict helpers:
  - `areIndependent`
  - `areConflicting`
  - `findConflicts`
  - `hasExternalSideEffects`
- Added derived action predicates:
  - `isInspectAction`
  - `isEditAction`
  - `isTestAction`
  - `isExternalAction`
- Added temporal predicates:
  - `hasVerifiedCompletion`
  - `hasDebugging`
  - `hasApprovalFriction`
  - `hasUnsafeWrite`
  - `hasStoppedAfterEditWithoutVerification`
- Added `lyo report --effects --run-id <id>` for single-run effect reports.
- Added `lyo audit --dir <path>` for read-only corpus audits over existing
  `.agent-learning/*.sqlite` ledgers.
- Added adoption-facing audit fields:
  - `summaryText`
  - `summaryLines`
  - `normalizedActionRate`
  - `unknownActionRate`
  - `lowConfidenceActionRate`
  - `topUnknownCommands`
  - `topMisclassificationCandidates`
- Added dry-run semantic lowering plans for verifier, milestone, procedure,
  critic, policy, and context-pack candidates.
- Fixed path-only local writes so they are marked `risk: low`.
- Fixed inferred verify/build commands so they read `local_repo:.`.

### What works now

Lyo can now answer questions like:

```text
What did this run read?
What did this run write?
Which commands did it execute?
Did it verify after the last edit?
Did it inspect or edit after a failed verifier?
Did it stop after editing without a later verifier?
Did it touch risky or external resources?
Which commands are not yet classified well?
```

The real local audit command has been run successfully against historical
ledgers under `/Users/marcus.kim/repositories/individual`. It found:

```text
16 ledgers
850 runs
20,375 hook events
10,854 normalized actions
53% normalized action rate
66% verified edit rate
47 runs stopped after edit without verification
11 unsafe write runs
0 skipped databases
```

### What still needs work

- Classifier quality remains a near-term gap, but the remaining top unknowns are
  now more specific: local process/server startup, simulator launch, generic
  `node -e` scripts, project-specific `uv run ...` commands, and Mix/Elixir
  commands.
- Local process and long-running service effects need a richer resource model
  before they can be classified cleanly.
- Failed-verifier detection depends on the available hook status/exit-code
  signals and needs more coverage across real ledgers.
- Subagent lineage, child-process hierarchy, and spawned task relationships are
  not fully modeled yet.
- Learning artifacts are still dry-run only; append-only persistence for
  compiled procedures, critics, verifiers, context packs, and policies still
  needs a reviewed schema and reducer path.
- Benchmark/replay loops for repeated task attempts are not implemented yet.
- The public API is still not stable.

### Verification

The 0.2.0 work has been validated with:

```sh
npm run typecheck
npm test
node src/cli.ts audit --dir /Users/marcus.kim/repositories/individual
```

At the time of the latest spec refresh, the full suite passed with `80/80`
tests green.
