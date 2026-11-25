# Typed decisions

Lyo has one interface for typed questions about a piece of content:
`TypedDecisionProvider` (`src/lyo/application/typed-decisions.ts`). Questions use the
Choice, Score and Noul primitives shared by TypeSafe Jev and Laya
(`src/lyo/domain/typed-decision.ts`). The implemented provider is
TypeSafe Jev (`src/lyo/decisions/jev.ts`). Nothing in Lyo's hooks or trials calls it yet.

## TypeSafe endpoints

From `https://api.typesafe.ai/openapi.json` (API version 0.2.0), checked live on
24 October 2026:

| Endpoint | Use |
|---|---|
| `GET https://api.typesafe.ai/v1/models` | Aliases available to the account (`jev-latest`, `jev-preview`). |
| `POST https://api.typesafe.ai/v1/systemone` | `{ model, state, questions }` → `{ model, answers, usage }`, one answer per named question. |

Authentication is `Authorization: Bearer <key>`. Requests are limited to a 32 MiB
body and, by default, 64k tokens per request and 32k per question. `429` and `529`
are retried with backoff, following `retry-after`. Box questions, images and the long-context
header are not supported by this adapter.

## Configuration

- `TYPESAFE_API_KEY` (or `JEV_API_KEY`) enables the provider. Without a key, nothing is sent.
- `LYO_JEV_MODEL` overrides the model. The default is the versioned `jev-1.14.0`, not
  the moving `jev-latest` alias, and every record keeps the model that actually answered.

```sh
lyo decide models --env-file ~/repositories/individual/.env
lyo decide --input request.json --env-file ~/repositories/individual/.env
```

`--env-file` loads variables with Node's `process.loadEnvFile` without overriding
ones already set.

## Calibration

`lyo decide calibrate --cases cases.jsonl --questions questions.json --out decisions.jsonl`
asks each Noul question about each labelled case. Cases are JSONL rows of
`{ id, text, stratum?, labels: { <question>: true | false | "ambiguous" } }`. Every
decision is appended to `--out` and reused on later runs with the same questions, so
re-analysis costs nothing. For each question and stratum, the report shows labelled
positives, negatives and ambiguous cases. For each threshold band (0.3/0.7, 0.2/0.8,
0.1/0.9) it also shows false positives, recall and how many cases stay unknown. It
reports `sufficient: false` until there are at least 20 labelled positives and 20
negatives, and no threshold should be chosen before then.
A random stratum estimates the real false-positive rate; a keyword-enriched stratum
only helps estimate recall.

### Trace a confusion matrix

```sh
lyo eval matrix --cases cases.jsonl --questions questions.json --decisions decisions.jsonl --question transfer
```

Use the same case and question files supplied to `lyo decide calibrate` and its retained `--out` file. Choose the deployed thresholds with `--no` and `--yes`. The defaults are 0.3 and 0.7. For the shipped transfer-review band use `--no 0.3 --yes 0.5`. Use `--stratum` to inspect one labelled population. No provider or API key is required.

The rows show LYO’s answer and the columns show the supplied label. Add `--cell FP` or `--cell FN` to list case IDs. Add `--case ID` to read the original case, its supplied evidence fields, question, model, score and decision hash. A label’s authority depends on how the case was reviewed. For causal questions, record the independent check and its evidence reference in the case file.

Abstentions appear by label. Cases with missing or ambiguous labels form a separate group. Among the remaining cases, a missing decision or a mismatch in the input or questions belongs to `unmeasured`. New calibration records include the input hash. Older Jev records can be matched through their original request hash. Each case contributes to exactly one group.

Add `--rates` to calculate rates over the four decided, labelled cells. Sensitivity is TP/(TP+FN), specificity is TN/(TN+FP), and Youden’s index is their sum minus one. A zero denominator gives an undefined rate (`null` in `--json`). The original calibration report’s recall and false-positive rate include abstentions in their denominators.

## Action-scoped finding delivery

Findings normally reach a session through explicit `[lyo:<activity>]` tags or a
matching repository. Action scope adds a third route. After an agent's `Edit`,
`Write`, `MultiEdit`, `NotebookEdit` or `Bash` call, the Claude/Codex hook asks a calibrated Noul question about
that action. If the answer clears the band's `yes` threshold, the matching findings
are delivered as hook context.

- **Opt-in.** Set `LYO_ACTION_SCOPE_FILE` in the hook environment to a config such as
  `eval/action-scope/transfer-review.json`. Without it, nothing is sent.
- **Calibrated activities only.** Each activity needs its question, band and a
  calibration record with at least 20 labelled positives and 20 negatives. The
  shipped config holds the 25 October 2026 transfer-review calibration: 0.3/0.5 band,
  held-out batch caught 20 of 22 with 2 false alarms in 80. Experiment design is not
  included because its held-out check failed, and learning budget never occurred.
- **Same input as calibration.** The action is rendered with the agent's latest plan
  text from the transcript, in exactly the calibrated format. Changing that format
  invalidates the thresholds.
- **Cost bounds.** One call per new agent plan in a session, reused for later actions
  under the same plan; at most `maxCallsPerSession` calls (default 30); a
  `timeoutMs` limit (default 1500) with no retries. A failed or slow call leaves the
  activity unknown.
- **Delivery semantics.** Asking happens first, but delivery waits until the trial
  check: a trial-managed session receives nothing. A finding is delivered at most once
  per version per session, and not when its repository already brings it into
  context. The delivery receipt carries `scope` with the decision reference, so
  inferred deliveries stay distinguishable from tagged ones. Decision records keep
  hashes, scores, model and usage, never the plan or code.

## What a decision establishes

- **Disclosure.** Each request sends its `state` to TypeSafe. Its legal page states a
  data processing agreement and no training on customer data; zero data retention
  is an enterprise option. Send only content that may leave the machine.
- **Confidence is not accuracy.** A Choice or Score `confidence` is computed from the
  spread of the model's own probabilities; a Noul is the model's probability of yes.
  Neither is a calibrated chance of being right on Lyo's content until it is measured
  against labelled cases from that use.
- **Undecided stays unknown.** `noulVerdict` returns unknown between the caller's `no`
  and `yes` thresholds, and `choiceVerdict` returns unknown below a confidence floor. A
  failed call throws; callers treat that decision as unknown.
- **Where it is safe to use first.** A decision that only gates *eligibility* before
  random assignment, such as whether a finding applies to a prompt, cannot bias a
  trial's comparison: both arms share the same rule. A decision used as an
  *outcome*, such as adherence judged from a trace, is a measurement in its own right
  and needs its own validation.
