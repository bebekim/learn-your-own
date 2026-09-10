# Specific lesson transfer screen — 2026-09-10

Decision: stop this candidate screen. No promotion, reruns, or validated
helpful/harmful credit. The one registered pair did not demonstrate benefit,
exceeded its budget, and exposed a limit in both the lesson and our verifier.

## 1. Make the advice actionable

The approved revision says:

> When a string must contain meaningful text, validate its trimmed length while preserving the original accepted value.

Candidate `77b7d36b8d920fa091db94920f615ad9bd589de3a615361cb03b8a72254d6de4`
preserves its parent and inherits the original source repair's
[removal/restoration evidence](../native-task-intervention-2026-09-10/assessment.md).
This is an assistant-authored refinement with explicit provenance, not another
model discovery. The existing record format and controller were reused; no
general revision service was added.

The original source task cost 304,223 tokens, the model reflection cost 1,644,
and the complete assistant turn that drafted this sentence cost 136,402.
The trial therefore retains **442,269 source and learning tokens**. Cached
input is included in input totals, not added again. Rechecking the previously
retained response incurred no new inference charge.

## 2. Run one registered comparison

Two fresh copies of `clean-domain-driven@3ce3438` received the same catalogue
validation ticket, model (`gpt-6-astra`), tools, budget, and frozen verifier.
Both attempt registrations and their comparison preceded either launch.
The task controller delivered `{}` to baseline and the exact sentence above
to treatment, using `fixed-action@1`. The original repository stayed clean.

| Observation | Baseline | Lesson |
| --- | ---: | ---: |
| Frozen acceptance / regression | pass / pass | pass / pass |
| Input + output tokens | 157,307 | 167,608 |
| Cached input, already included | 137,856 | 146,304 |
| Declared token allowance | 100,000 | 100,000 |
| Within registered budget | false | false |
| Registered wall time | 133,865 ms | 525,769 ms |
| Host's final focused suite | 13 passed | 14 passed |

The treatment used 10,301 more tokens (6.5%). Both traces contain a failing
focused test before the edit and passing tests after it. Evaluation spent
**324,915 tokens**, exceeding the protocol's 200,000 total. The token allowance
is a post-completion check, not an enforced provider cap; the prompt did not
keep either host within it.

Automatic approval review initially rejected treatment because sending this
checkout and prompt to the external model needed specific authorization.
The user approved that exact transfer, and the original treatment then ran
once. No rejection was bypassed. Its registration timestamp was preserved;
the approval wait makes the registered wall-time comparison unsuitable for
assessing the lesson. Launch-to-measurement intervals were about 101 and
122 seconds, respectively, and include verification; these are descriptive,
not a replacement preregistered timing measure.

Both hosts also ran the installed session hook and received the same two
legacy candidates in different orders. Thus baseline means no advice from
the task controller, not an otherwise memory-free host. Independent host
choices differed too: treatment read an additional diagnosis skill. One pair
cannot separate those effects or estimate repeatable savings.

### A passing verifier missed a real difference

Baseline used `.regex(/[^\s\p{White_Space}]/u)`, whereas treatment used
`.refine(value => value.trim().length > 0)`. A local post-completion audit
confirmed that U+0085 matches the runtime's Unicode `White_Space` property
but survives `trim()`. Baseline rejects it in all three fields; treatment
accepts it in all three. The frozen verifier omitted this case.

This exposes an applicability limit: the source task's JavaScript trimming
semantics do not cover every interpretation of Unicode whitespace in the
new task. The sentence is too broad for this transfer. The audit is explicitly
post hoc: it does not rewrite the original pass receipts, change the frozen
verifier, or establish that guidance caused the defect. It does prevent us
from treating those passes as evidence of complete task acceptance.

## 3. Decide whether to spend more

The registered report is **inconclusive** because it requires at least two
matched pairs. Separately, the one-pair screening protocol **failed** its
budget rule. These are different decisions; neither supports promotion.
Source, learning, and both evaluation arms total **767,184 tokens** for
**zero validated useful lessons**. Tokens per validated lesson has no finite
value while that denominator is zero.

That total excludes implementation, setup, and analysis. The separately
retained `orchestration-checkpoint.json` counts this root task's actual
per-response usage, deduplicated by response ID. It is a lower bound through
its timestamp; later reporting is excluded. It includes cached tokens and is
not a dollar-cost estimate. Earlier project development costs remain outside
both totals. This work has itself been far too expensive to justify this
single narrow lesson on learning efficiency.

Keep the candidate as experimental evidence. No daily deployment was enabled
and no extra paid run is justified by this result. Before another experiment,
the concrete issues are: enforce spending limits during execution, check the
lesson's semantic preconditions against the target contract, freeze ambient
lesson delivery, and separate approval waiting from execution timing.
These are prerequisites for a credible next test, not features implemented
by this screen. The immediate feedback decision is to stop spending on this
candidate, with its receipts and counterexample retained.

## Code, checks, and artifacts

- `src/lyo/control/task-feedback.ts`: optional evaluation budget in `trial`,
  validated through the existing registration schema; acquisition cost stays.
- `tests/task-intervention.test.js`: the CLI test first failed for the missing
  budget, then exercised delivery and comparison under the smaller budget.
- `src/eval/task-report.ts`: existing report and promotion checks, unchanged.
- Local package `0.4.3-adaptive.2` is installed at the path already used by
  Codex and Claude hooks. Hook-definition hashes were preserved; no publication.
  The separate Codex `config.toml` hash changed during the screen, with cause
  unverified. No configuration was intentionally edited or restored. See
  `rollout-after.json`; do not interpret rollout as full configuration identity.

Validation: 613 tests passed, one sandbox localhost skip. Final review reproduced
and fixed a null-budget validation bug; all six intervention tests then passed,
as did typecheck and package construction. Opcore source validation passed with one new complexity
warning (CLI dispatcher 11 versus 10). Ripwire quality delta did **not** pass:
four gating historical-churn findings remain on `TaskFeedback`, `taskCommand`,
`trial`, and `usage`. These were retained as an explicit tradeoff for the small
compatible budget change; no metrics or checks were suppressed.

`baseline.json` and `learned.json` retain registrations, native delivery,
full host traces, measured source diffs and receipts. `report.json` is the
central report. `unicode-audit.json` preserves the additional observation.
`finish.mjs` can repeat the local audit while the disposable checkouts exist;
it does not launch a host or alter finalized measurements. For a portable
offline consistency check using Node 24:

```sh
rtk proxy node evidence/specific-lesson-transfer-2026-09-10/check.mjs
```
