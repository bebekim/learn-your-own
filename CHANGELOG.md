# Changelog

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
