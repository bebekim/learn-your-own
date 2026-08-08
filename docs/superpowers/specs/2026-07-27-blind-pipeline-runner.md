# Blind Pipeline Runner: The Separation Spec

Date: 2026-07-27
Status: as-built documentation (fills the gap left by the contract spec's
"no stage runner" scope exclusion)
Code: `src/runner/`, commits `5da5044`, `951cd90`, `c378b67`, `c4bee3a`,
`1b5cb2e`, `4ea2585`

## Purpose

Two LLMs produce code and tests for the same specification while being
**physically unable to see each other's work**. The point is breaking
correlated blind spots: one agent writing both artifacts shares its own
misreadings of the spec; two isolated agents disagree — and the disagreement
map is the product.

## The invariant (enforced, not instructed)

```
code writer cannot see tests
test writer cannot see code
both see the spec
the runtime sees all
the verifier judges against frozen tests
```

Enforcement is structural, in three independent ways:

1. **Static check** — `checkBlindness(plan)` (`src/contract/plan.ts`) refuses
   to execute a plan whose stage authorities violate the invariant: the code
   writer's `forbiddenRead` must cover every test-writer output path, and
   vice versa; both must list the spec as a shared read.
2. **Sandboxing** — each stage runs in `stages/<stageId>/sandbox/` containing
   *copies of only its declared `authority.read` paths* (`materializeSandbox`,
   `src/runner/files.ts`). The filesystem view IS the boundary.
3. **No tools for single-shot executors** — OpenRouter/Upstage stages are one
   chat completion with inputs inlined in the prompt. The model cannot read
   anything because it has no tools; blindness is not a rule it follows but a
   capability it lacks.

## The stages

A plan (`lyo.plan.v1`) declares stages with roles and executor bindings:

| Role | What it does | Executor kinds |
|---|---|---|
| `code-writer` | implements the spec | `kimi-cli` (agentic, sandboxed cwd), `openrouter` / `upstage` (single-shot) |
| `test-writer` | writes the frozen test suite from the spec alone | same kinds |
| `verifier` | no LLM — deterministic `node --test` on the merged tree | none (code) |

Each stage's executor binding is `{kind, model, temperature?}` — part of the
plan, hashed like everything else. Model diversity is the experiment's point:
current lineup is solar-pro4 (code) vs glm-5.2 (tests) vs claude-sonnet-5
(judge, learn step only). (solar-open2 ran the original S-series; deprecated
by Upstage 2026-08-04 and replaced by solar-pro4 with no contract change.)

Available alternates (verified on OpenRouter): `upstage/solar-pro-3` as
test-writer (it ran the early CSV runs), `moonshotai/kimi-*` family for
either role. Swap = one line in the plan's stage executor binding.

## The flow (`runPipeline`, `src/runner/run-pipeline.ts`)

1. Validate plan + spec against the contract; verify the spec's sha256
   matches the plan's `specRef`; run `checkBlindness`.
2. Materialize per-stage sandboxes (declared reads only).
3. Compile separated prompts (`compileSeparatedCodeAndTestPromptArtifacts`)
   with per-executor addenda (file-block format for single-shot, sandbox
   paths for agentic).
4. Run code-writer ∥ test-writer in parallel, stateless, once each.
5. Single-shot outputs arrive as path-tagged fenced blocks; only blocks
   under declared write paths touch disk (`filterDeclaredWrites`). Zero
   parseable files → one corrective retry with an explicit example, then
   fail loudly.
6. Hash outputs into code/test manifests (validated). Test manifest is
   `frozen: true` — the suite is generated once and never edited.
7. Verifier merges both output trees into a fresh dir (isolated from any
   ancestor `package.json`), runs `node --test`, parses TAP → counts +
   per-test detail → `verifier-report.json`.
8. **Feedback loop** (optional, `feedbackPolicy.maxRounds`): on `fail`, the
   code writer retries seeing only `{total, passed, failed}` and its own
   previous code — never test names, code, or errors. Stop reasons: `pass`,
   `max_rounds`, `no_change`, `stuck` (two rounds without improvement).
9. Emit `trace.json`: per-stage, per-round records with model, prompt hash,
   input/output artifact refs, timings; `feedback` summary with stop reason.

## Evidence preservation

Every round is fully reconstructible: per-round transcripts
(`transcript.round-N.txt`), per-round output snapshots (`files.round-N/`),
manifest snapshots (`manifest.round-N.json`), raw verifier output
(`verify-tap/tap.round-N.txt`). Failed stages leave their transcript behind
instead of vanishing.

## Where to see it happen

Live runs: `dogfood/csv-task/runs/` and `dogfood/semver-task/runs/` —
each `trace.json` shows the two writers as separate stage records with
different models, and `stages/*/sandbox/` shows exactly what each could see.

It does NOT happen in ambient agent sessions — those are recorded by hooks
but never routed through the pipeline. The pipeline runs only on explicit
invocation with a hand-authored spec, because the spec is the contract both
blind sides read, and auto-generating trustworthy specs is unsolved.

## Known limits (as built)

- The verifier assumes `node --test` + CommonJS by default (pinned
  `verify/package.json`); other frameworks need plan-level declaration.
- Blindness is filesystem/prompt level, not OS-sandboxed — a motivated
  agentic executor with network access could fetch external copies of the
  repo. Threat model: misaligned behavior is out of scope; the boundary is
  for blind-spot decorrelation, not adversarial containment.
- The corrective retry and format-tolerant parser exist because model output
  formats vary run to run (four variants observed from one model).
