## Problem Statement

Lyo records a large amount of agent work telemetry: prompts, hook events, tool calls, commands, file activations, and turn/session boundaries. This creates a useful activity record, but it does not yet create durable learning. The current record can answer what happened, but it usually cannot answer what the user was trying to prove, which procedures worked, what failures repeated, which verifiers defined progress, or whether future attempts became faster, cheaper, and higher quality because of prior attempts.

The user wants Lyo to support repeatable task families, such as developing a database from scratch, where the first attempt establishes a baseline and later attempts reuse compiled learning. The desired outcome is not vague variation between attempts. The desired outcome is measurable learning delta: shorter time, lower token cost, fewer interactions, fewer human approvals, fewer failed verifier loops, and equal or better verified milestone completion.

The core problem is that Lyo needs to become a learning compiler. It should compile raw telemetry into reusable future-work artifacts: procedures, critics, verifiers, context packs, and policy. Those artifacts should then be linked into later attempts and evaluated against the baseline.

## Solution

Add a learning compiler layer to Lyo. The compiler will transform recorded telemetry into structured episodes, infer the purpose and risk of each episode, extract candidate learning artifacts, gate those artifacts with evidence, and make promoted artifacts available to later attempts through replay resolution.

The learning compiler should not be based on an ad hoc command taxonomy. Its foundation is trace semantics plus an effect system: raw hook events are normalized into actions with operations, resource reads/writes, risk, status, lineage, and evidence. Compatibility labels such as inspect, edit, test, git, and external are derived views over those effects, not the core grammar.

Reducers and run tape cells are the durable state-machine target, not the semantic parser. The compiler should interpret telemetry into normalized actions, episodes, semantic facts, and dry-run learning drafts. Only reviewed or evidence-gated artifacts should later be persisted through append-only reducer paths.

The system will be organized around five agreed layers:

- Benchmark layer: defines repeatable task families, variants, attempts, milestones, and verifier specifications.
- Telemetry layer: records prompts, hooks, tool calls, commands, file changes, verifier outputs, and turn/session boundaries.
- Learning layer: compiles telemetry into procedures, critics, verifiers, context packs, and policy.
- Replay layer: resolves scoped learning artifacts and injects them into future agent runs.
- Evaluation layer: compares attempts and reports learning delta.

The compiler analogy is explicit:

- Source: raw telemetry.
- Lexer/tokenizer equivalent: hook normalization into canonical event facts.
- Effect analysis: normalize tool-specific events into actions with resource reads/writes, status, risk, facets, lineage, and evidence.
- Parser equivalent: parse normalized traces into episodes and work loops.
- AST/IR: attempt, milestone, episode, action, verifier, failure, fix, policy, and protocol records.
- Semantic analysis: purpose, preconditions, threats, evidence, failure class, applicability, and risk.
- Optimization: move verifiers earlier, remove wasted exploration, compress context, add critics, reduce approval friction.
- Code generation: dry-run procedures, critics, verifiers, context packs, and policy drafts.
- Linking: bind artifacts to a benchmark family, language, stage, repo shape, tools, and risk profile.
- Execution: deliver artifacts into the next run.
- Evaluation: compare attempt outcomes and artifact effectiveness.

The first version should be part of Lyo, but not inside the durable kernel alone. The kernel remains responsible for evidence and reducer grammar. The learning compiler should live as a bounded module that consumes kernel records and emits typed artifacts. Benchmark execution and agent launching should remain outside the kernel as orchestration.

## Current Implementation Status

As of `0.2.1`, the first read-only compiler layer exists.

Implemented:

- `NormalizedAction` is the core compile-time representation for telemetry.
- Raw hook events can be compiled into normalized actions, compatibility tokens, and parsed work episodes.
- Actions carry primary operation, inferred intent, resource reads/writes, risk, status, confidence, facets, provenance, and command summaries.
- Compatibility labels such as inspect, edit, test, build, git, and external are derived views over actions.
- The effect algebra is implemented with deterministic helpers for empty effect, effect concatenation, action-to-effect conversion, and trace folding.
- Dependency/conflict helpers and temporal predicates are implemented for verified completion, debugging after failure, approval friction, unsafe writes, and stopping after edit without later verification.
- `lyo report --effects --run-id <id>` produces single-run trace/effect reports with summary counts, predicates, evidence preview, effect signature, and conflict findings.
- `lyo report --semantic --lower --run-id <id>` produces dry-run semantic lowering plans.
- `lyo audit --dir <path>` scans existing `.agent-learning` SQLite ledgers read-only and reports corpus coverage, unknown actions, parked unknowns, verification rates, and misclassification candidates.
- Deterministic classifier coverage exists for common inspect, test, build, package, database, local CLI, Docker Compose, xcrun simulator-list, Emacs batch, archive, Git, npm registry, and external deploy command families.
- Ambiguous commands remain explicit `unknown` actions. Legacy/local command families can be parked so current classifier work is not dominated by stale local tooling.

Current empirical baseline from a read-only audit over `/Users/marcus.kim/repositories/individual`:

```text
15 scanned ledgers
875 runs
20,869 hook events
11,118 normalized actions
53.28% normalized action rate
3.18% actionable unknown action rate
1.68% parked unknown action rate
53.13% verified edit rate
75 runs stopped after edit without later verification
17 unsafe write runs
1 skipped database
```

Not implemented yet:

- Benchmark-family records, variants, repeated attempts, and milestone definitions.
- Verifier identity and milestone-verifier tracking across repeated attempts.
- LLM-assisted semantic annotation over normalized traces.
- Evidence-gated promotion of procedure, critic, verifier, context-pack, and policy artifacts.
- Append-only persistence for compiled learning artifacts.
- Replay resolution that injects scoped artifacts into future runs.
- Evaluation that compares attempt deltas across time, tokens, interactions, approvals, failed verifier loops, and verified milestone throughput.
- Subagent, spawned-task, and child-process lineage beyond available hook/tool IDs.
- A richer resource model for local processes and long-running services.

## User Stories

1. As a Lyo user, I want to define a repeatable benchmark family, so that I can compare multiple attempts at the same class of work.

2. As a Lyo user, I want to define benchmark variants, so that I can test whether learning generalizes beyond memorizing one exact task.

3. As a Lyo user, I want each attempt to have an explicit goal, so that telemetry can be interpreted against intended progress.

4. As a Lyo user, I want each attempt to define milestones, so that progress can be measured in smaller verified units.

5. As a Lyo user, I want each milestone to have a verifier specification, so that completion is based on evidence rather than assistant claims.

6. As a Lyo user, I want raw hook telemetry segmented into episodes, so that long sessions become understandable units of work.

7. As a Lyo user, I want episodes classified by phase, so that I can distinguish orientation, diagnosis, implementation, verification, debugging, cleanup, and blocked work.

8. As a Lyo user, I want Lyo to identify which commands and edits belong to an episode, so that learning artifacts have clear provenance.

9. As a Lyo user, I want Lyo to infer what each episode was trying to achieve, so that later learning is based on purpose rather than command sequences alone.

10. As a Lyo user, I want Lyo to identify preconditions for successful steps, so that future attempts know what must be true before acting.

11. As a Lyo user, I want Lyo to identify threats introduced by a step, so that future critics can catch risky plan shapes earlier.

12. As a Lyo user, I want Lyo to classify failures structurally, so that repeated bugs become recognizable bug classes.

13. As a Lyo user, I want Lyo to extract procedure candidates from successful work, so that future attempts can start from known-good operating sequences.

14. As a Lyo user, I want procedures to include step purpose, requirements, threats, and verifiers, so that they are more useful than checklists.

15. As a Lyo user, I want Lyo to extract critic candidates from repeated or costly mistakes, so that future attempts can catch those mistakes earlier.

16. As a Lyo user, I want critics to be scoped to benchmark family, stage, language, repo shape, and risk class, so that they do not become noisy global advice.

17. As a Lyo user, I want Lyo to extract verifier candidates, so that progress checks can move earlier in later attempts.

18. As a Lyo user, I want Lyo to extract compact context packs, so that future runs receive only high-value prior knowledge.

19. As a Lyo user, I want context packs to include source evidence and applicability, so that old knowledge can be trusted or rejected.

20. As a Lyo user, I want Lyo to extract policy candidates, so that low-risk inspect, test, build, and scoped edit actions can proceed with less repeated approval.

21. As a Lyo user, I want policy to distinguish safe local actions from destructive, external, credentialed, deploy, or high-cost actions, so that approval friction drops without removing safety.

22. As a Lyo user, I want candidate artifacts to pass an evidence gate before promotion, so that Lyo does not promote unsupported summaries.

23. As a Lyo user, I want an artifact to retain links to supporting episodes, commands, verifier results, and human judgments, so that I can audit why it exists.

24. As a Lyo user, I want artifacts to carry confidence, so that early weak learning is not presented as settled knowledge.

25. As a Lyo user, I want to review and approve candidate learning artifacts, so that the first version remains human-supervised.

26. As a Lyo user, I want Lyo to resolve only applicable artifacts for a new attempt, so that replay context stays focused and token efficient.

27. As a Lyo user, I want replay resolution to explain why each artifact was included, so that I can debug noisy or missing learning.

28. As a Lyo user, I want Lyo to record when artifacts were delivered to a later run, so that future evaluation can measure whether they helped.

29. As a Lyo user, I want Lyo to compare attempt N against attempt N+1, so that I can see whether learning reduced time, tokens, interactions, approvals, and failed verifier loops.

30. As a Lyo user, I want Lyo to measure verified milestone throughput, so that progress is tied to useful completed work rather than raw activity.

31. As a Lyo user, I want Lyo to distinguish activity metrics from learning metrics, so that a larger trace is not mistaken for improvement.

32. As a Lyo user, I want Lyo to report when an artifact created friction without benefit, so that bad critics and procedures can be demoted.

33. As a Lyo user, I want repeated benchmark attempts to use controlled variants, so that the system tests generalization rather than rote replay.

34. As a Lyo user, I want Lyo to preserve raw evidence separately from compiled artifacts, so that future compiler versions can recompile better learning from the same source data.

35. As a Lyo user, I want the learning compiler to work on existing ledgers, so that historical telemetry can bootstrap early descriptive artifacts.

36. As a Lyo developer, I want the learning compiler to be a deep module with a simple interface, so that it can be tested independently of CLI orchestration.

37. As a Lyo developer, I want artifact schemas to be explicit and typed, so that replay and evaluation do not depend on ad hoc markdown parsing.

38. As a Lyo developer, I want benchmark and attempt records to be first-class reducer concepts, so that repeated task families can be analyzed consistently.

39. As a Lyo developer, I want compiler output to be deterministic for the same input where possible, so that tests can compare behavior reliably.

40. As a Lyo developer, I want heuristic compiler passes to emit confidence and rationale, so that uncertain inferences remain visible.

41. As a Lyo developer, I want CLI commands for learning, replay resolution, and evaluation, so that the loop can be used without writing custom scripts.

42. As a future Lyo user, I want optional autonomous improvement to be built on top of the artifact system, so that automation does not arrive before the learning grammar is stable.

## Implementation Decisions

- The learning compiler belongs inside Lyo as a bounded learning module, not as a separate product at first.

- The durable kernel remains responsible for evidence records, reducer grammar, and artifact state transitions.

- Reducer grammar is a durable backend target, not the first semantic parser. The compiler may consume raw hook events and reducer records, but it should normalize them into effectful actions before deriving episodes or learning artifacts.

- Lyo's mathematical foundation should be trace semantics, effect algebra, and temporal rules. Labels such as inspect, edit, and test are derived predicates over effects, not a mutually exclusive or complete foundation.

- Compiler persistence must be append-only. Dry-run learning drafts should be evaluated on real telemetry before any persistent artifact or tape lowering is introduced.

- LLMs should be used as schema-constrained semantic annotators after deterministic normalization, effect analysis, and parsing, not as the parser or final judge.

- Deterministic validators should check LLM-produced annotations for valid enum values, required evidence references, legal state transitions, confidence, scope, and replay applicability.

- The final judge of a learning artifact is replay evaluation against later attempts, not the LLM rationale that proposed it.

- Benchmark execution, launching agents, and managing repeated attempts are orchestration responsibilities and should not be part of the kernel.

- The initial artifact types are procedure, critic, verifier, context pack, and policy.

- A procedure is not a simple checklist. Each procedure step should include purpose, requirements, threats, verifier references, and applicability scope.

- A critic is a future-facing check derived from a structural bug pattern or repeated costly behavior. Critics should be scoped and may be executable, heuristic, or advisory.

- A verifier defines progress. Milestone verifiers are preferred over only final verifiers because they support learning during the run.

- A context pack is compressed prior knowledge with source evidence, applicability rules, and a token budget.

- A policy artifact defines what can proceed without repeated approval and what still requires explicit approval.

- Candidate artifacts are not automatically trusted. They must pass an evidence gate before promotion.

- Evidence gates should support human approval, verifier-backed support, repeated success, and confidence scoring.

- Replay resolution should be scoped by benchmark family, variant, stage, language, repo shape, tool availability, and risk profile.

- Evaluation should compare attempts using learning delta, not just raw activity change.

- The primary evaluation metric should be verified milestone throughput: verified milestones completed relative to time, tokens, interactions, approvals, and failed verifier loops.

- The system should preserve raw telemetry as source material and allow recompilation as the compiler improves.

- The first implementation should focus on a local, repeated benchmark family such as database-from-scratch before expanding to broad project work.

- The system should support existing Codex telemetry first, because the available corpus is currently Codex-heavy.

- Claude-specific subagent lineage can be added later as an adapter enhancement, but it is not required for the first learning compiler.

- Exact source code from prior attempts should not be treated as the main learning artifact. The transferable artifacts are work structure, procedures, critics, verifiers, context, and policy.

- The learning compiler should expose a small interface: compile an attempt, produce candidate artifacts, promote artifacts, resolve replay artifacts, and evaluate deltas.

- The CLI should expose three primary flows: learn from an attempt, resolve replay artifacts for a future attempt, and evaluate attempt deltas.

- The implementation should borrow compiler structure from the local Go examples: a typed AST/IR, symbol-table-like scope resolution for repositories/runs/milestones/artifacts, semantic-cube-like compatibility checks for action/risk/policy combinations, and codegen-like artifact emission.

## Testing Decisions

- Tests should focus on external behavior: given a known telemetry fixture, the compiler emits expected episodes, candidate artifacts, replay results, and evaluation deltas.

- Tests should avoid asserting private implementation details of classifier internals unless those internals are part of a stable public contract.

- Reducer tests should verify schema state transitions for attempts, milestones, artifacts, artifact evidence, replay applications, and evaluation records.

- Compiler tests should use fixture telemetry that includes inspect-edit-verify loops, repeated failures, missing verifier behavior, and successful milestone completion.

- Compiler tests should start from SQLite-backed telemetry fixtures and reducer/tape fixtures, not raw transcript summaries. Raw hook telemetry is the compiler source, while reducer grammar remains the durable backend target.

- LLM-assisted semantic passes should be tested behind stable fixtures or mocked outputs, with deterministic validators responsible for accepting or rejecting candidate annotations.

- Replay tests should verify that only scoped artifacts are resolved for a matching attempt and that unrelated artifacts are excluded.

- Evaluation tests should compare two attempts and verify computed learning delta across milestone throughput, time, tokens, interactions, approvals, and verifier failures.

- CLI tests should follow the existing pattern of invoking the CLI against temporary SQLite ledgers and parsing JSON output.

- Historical-data tests should validate that existing hook telemetry can be compiled into descriptive episodes even when explicit attempt, milestone, or outcome records are missing.

- Policy tests should verify that safe local actions can be marked auto-allow while destructive, external, credentialed, deploy, or high-cost actions remain approval-gated.

- Demotion tests should verify that artifacts can be marked harmful or noisy when later evaluation shows friction without benefit.

## Out of Scope

- Building a full agent runtime.

- Automatically implementing benchmark tasks.

- Automatically launching Codex or Claude for repeated benchmark attempts in the first version.

- Hosted hiring/interview product workflows such as invitations, HR dashboards,
  candidate identity, sealed report delivery, and company rubric management. A
  local read-only candidate at-bat evaluator is tracked separately as an
  implementation target.

- Full OS child-process tree capture.

- Full autonomous overnight self-improvement without human review.

- Treating exact prior source code as the primary reusable learning artifact.

- Building a hosted SaaS service.

- Supporting every agent runtime equally in the first version.

- Replacing human judgment for high-risk policy or artifact promotion.

## Further Notes

The existing telemetry corpus is large enough to bootstrap descriptive profiling. It includes many sessions, turns, hook events, prompts, commands, and path activations. However, it is weak on explicit learning records such as run goals, run tapes, outcomes, preference pairs, protocols, and verifier-linked milestone completion.

This PRD addresses that gap by making learning an explicit compiler pipeline. Lyo should not merely remember what happened. It should compile what happened into artifacts that can change future behavior and then measure whether that change helped.

The first successful version should make a repeated task family visibly improve over attempts. A database-from-scratch benchmark is a good starting point because it naturally decomposes into milestones such as compile baseline, insert/select, persistence, parser behavior, storage boundaries, and corruption checks.
