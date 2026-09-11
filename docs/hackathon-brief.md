# Lyo: application and demo brief

Prepared 11 September 2026. This is a general technical application draft; it
makes no claim about a particular hackathon's eligibility, format or judging rules.

## One sentence

Lyo is a local feedback layer that helps AI coding agents test which lessons
belong in future prompts, using scoped trials and traceable outcome evidence.

## What are you building?

AI coding agents can save advice from previous work, but a saved note does not
show whether the advice helped or whether it fits the next task. Lyo turns that
note into a testable intervention. It records the lesson's scope and evaluator,
delivers it through Codex or Claude hooks, captures the subsequent action and
outcome, and changes future delivery as evidence accumulates. A successful
prospective comparison can promote a lesson within its tested scope; later
failure or corrected evidence can pause it. Everything is retained in local
SQLite. The current prototype has a working controlled feedback demo and ordinary
session trial infrastructure. The next milestone is a useful lesson demonstrated
on independent real coding tasks.

## Show the mechanism

Run the [README demo](../README.md#run-the-demo), then explain these transitions:

1. **Candidate:** “Use `trim()` to reject blank input.” This is plausible advice.
2. **Counterexample:** U+0085 survives `trim()` but is blank under the demo's
   explicit target contract. The real parser check fails.
3. **Feedback:** Lyo records the contradiction and stops delivering that wording.
4. **Revision:** a scripted correction targets the stated Unicode contract.
5. **Later application:** the revision passes the same contract and receives
   one supported observation, with the entire chain inspectable in SQLite.

The fixture supplies actions and reviewer judgments. Say that directly: it is a
reproducible demonstration of the controller, not an independent agent experiment.
The output keeps `incrementalBenefit: "unknown"` because the demo does not measure
what an unguided agent would have done.

For a second technical view, run:

```sh
node --test tests/finding-trial-policy.test.ts
```

That test exercises fixed advice/no-advice comparison, scoped promotion, monitoring
and pause after a later failure. Its outcomes are controlled test inputs.

## What is distinctive about the implementation?

- The unit is a versioned intervention with scope, action and predicted outcome.
- Delivery, adherence, correctness and incremental benefit have separate meanings.
- Ordinary hooks supply prospective action boundaries; replay cannot invent them.
- Corrected evidence can invalidate dependent advice and delivery decisions.
- Turn/compaction refresh restores guidance without counting repetition as learning.

This is learning in external lesson and policy state, not model-weight training.
It does not require a general explanation graph or distributed network to run.

## Evidence and next milestone

The source baseline is `0.4.3-adaptive.8`: 672 passing tests, one skipped, and
passing typecheck at the context-refresh rollout. Configured Codex/Claude command
checks passed with isolated events. [Evidence](../evidence/context-refresh-2026-09-11/README.md)

The retained coding transfer screen was inconclusive and exposed a verifier gap.
There is no demonstrated general coding uplift to report yet. The next experiment
must show that a reviewed intervention improves a meaningful declared outcome on
independent ordinary tasks, followed by monitored reuse and a broader-scope test.

This brief includes no user-growth, revenue, market-size or performance claim
beyond the repository's retained evidence. Add such metrics only with their source
and measurement scope. Use the [current status](development-status.md) for the full
implementation and limitation map.
