# First model-derived task intervention

Date: 2026-09-10 (Australia/Sydney). Branch: `feat/task-derived-interventions`.

**One proposed repair mechanism survived a real local intervention check. The
usefulness of the generated advice remains unmeasured.** There are no later-task
attempts for this candidate and no validated helpful/harmful credit.

## Observation and intervention

The source was the completed Codex task `pilot-20260909-train-command` from the
[earlier pilot](../native-task-cycle-2026-09-09/assessment.md). Its retained patch
changes the shared validation boundary in `src/eval/tasks.ts`:

```diff
- if (typeof value !== 'string' || value.length === 0) {
+ if (typeof value !== 'string' || value.trim().length === 0) {
```

After explicit approval, one request sent the [prepared packet](approved-request.json)
to OpenRouter's `openai/gpt-4o-mini`. A request equality assertion prevented a
different packet from being sent. The model named that exact edit as its proposed
cause. LYO replayed the original source and retained patch, removed only the named
edit, then restored it, using the same independent verifier throughout:

| Source state | Acceptance | Existing valid behavior |
| --- | --- | --- |
| Original | Failed: missing expected exception | Passed |
| Recorded repair applied | Passed | Passed |
| Named edit removed | Same failure, with identical verifier evidence | Passed |
| Named edit restored | Passed | Passed |

The [intervention record](intervention.json) contains all four outputs. This
supports the edit's role under this verifier, with the rest of the patch held
fixed. It does not establish that all invalid strings are covered, that the
explanation is universally causal, or that advice transfers to another task.

## What the model actually proposed for later delivery

> Teach the importance of validating input data to ensure it meets specific criteria, such as non-empty strings, to prevent errors in processing.

That is the exact frozen advice, also exported as a [candidate lesson](candidate.md).
The model identified a specific repair but generalized it into broad advice.
The delivered sentence omits both the whitespace check and the requirement to
preserve accepted values. Its local mechanism check therefore provides stronger
evidence about the code edit than about the usefulness of its prose.

The advice has not been rewritten or declared helpful. The [trial policy](policy.json)
can deliver it verbatim against no advice in a preregistered comparison. A fresh
ticket/repository and independent acceptance check are still needed. Previously
completed pilot tasks cannot establish fresh transfer evidence. Task family,
model, tools and budget matching remain explicitly declared; semantic matching
and ordinary-workflow deployment are not supplied by this experiment.

## Failure recovery and cost

The model wrapped its valid JSON in Markdown fences. The original parser rejected
it, retaining the full response and usage in a failed analysis. A regression test
reproduced the failure before a minimal fence-handling fix. The explicit
`--reuse-analysis` option then rechecked the retained response locally: it issued
no second model request and preserved the failed record.

| Cost component | Tokens |
| --- | ---: |
| Original source task | 304,223 |
| One model request, recorded on the failed analysis | 1,644 |
| Local recheck: additional model tokens | 0 |
| Source plus derivation, used by the trial policy | 305,867 |

The [analysis records](analyses.json) link the recheck to the original failed
analysis. Their elapsed time is included in the policy's 127,474 ms alongside
the source task. The implementation work and broader historical corpus cost
are outside this policy's accounting. No economic benefit is established.

The central ledger retains the candidate and policy. Its [report](report.json)
is inconclusive, with zero registered later attempts. The installed hooks remain
on `0.4.3-adaptive.1`; this feature is still on its development branch.

## Reproduce without a model request

With Node 24+, the branch's dependencies installed, and the original source
commit available in Git, run from the branch checkout:

```sh
rtk proxy node evidence/native-task-intervention-2026-09-10/replay.mjs
```

The script checks receipt and candidate hashes, the approved request, response
provenance and single inference charge. It then creates a disposable worktree,
applies the retained patch, and repeats the four mechanism checks with the
archived verifier and model response. It makes no network or central DB calls.
Dependency versions and the surrounding execution environment are reused,
rather than fully attested. The retained source record and verifier make this
replay independent of the original temporary verifier location.

The reproduction passed. The implementation suite passed 613 tests with one
sandbox skip; type checking passed. See [validation](validation.json) for the
final build and robustness results. Fixture tests establish workflow contracts;
the actual local replay establishes the result in the table above.
