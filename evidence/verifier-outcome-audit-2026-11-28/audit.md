# Verifier outcome audit (Spec 17, Phase 1) — 2026-11-28

Read-only queries against `.tmp/lyo-corpus-20260613.sqlite` and `.tmp/work-corpus-20260627.sqlite`
(immutable mode). Aggregates and key names only; no prompt, payload value or output text.

## Findings

1. **No failure events exist in either corpus.** Event names present: `tool.before`, `tool.after`,
   `prompt.submit`, `turn.stop`, `session.start`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
   `Stop`, `SessionStart`. Neither `PostToolUseFailure` nor `tool.failure` appears.

2. **Work corpus (2026-06-27) has no `PostToolUse` at all.** All 1,164 succeeded verifies come
   from `tool.after` with model `gpt-5.5`; 9 are `attempted` from `tool.before`.

3. **Lyo corpus (2026-06-13) mixes two paths.** 78 verifies come from Claude `PostToolUse`;
   1,304 come from `tool.after` (Codex-style).

4. **No exit code in the payload.** `tool_response` keys in both corpora are only `sha256`,
   `output_size`, `truncated`, `recorded`. `exitCode` is `null` on every verify command. A
   derivation that needs an exit code cannot run on these rows.

5. **The stored outcomes predate the current rule.** `src/lyo/hooks/normalizer.ts`
   (`inferHookCommandStatus`) returns `unknown` for `tool.after` when the runtime is codex, bob or
   kimi, and `runtimeFromPayload` defaults to `codex`. The corpora store `succeeded` for these rows,
   so they were produced before that rule. The repair commit `5a72bd4` is dated 2026-11-16, after
   both corpora (2026-06-12/13 and 2026-06-27).

6. **A later sample agrees with the fix.** `zeroshot-lyo/.agent-learning/learning.sqlite` holds
   22 `command_activations` from 2026-07-20 with classification `unknown` and status `succeeded`.
   That is still before 2026-11-16, so it does not settle the question for current recording.

## What this means for Spec 17

- **Claude path:** `PostToolUse` can give `pass`. No `PostToolUseFailure` has ever been captured,
  so `fail` is unobserved, not disproven. Base rates from Claude runs would show pass only.
- **Codex path:** with no exit code and no failure event, every Codex verify derives to `unknown`.
  Re-deriving the existing corpora gives `unknown` for every Codex row. That is the honest answer,
  not a bug to fix in the importer.
- **Open question 1 becomes central:** pass/fail for Codex needs a signal the host sends. Until a
  capture of a real Codex failure shows one, Codex gate outcomes stay `unknown`.

## Not yet verified

- The live recorder has not been replayed on a current Codex failure. Finding 5 rests on reading
  the code, not on running it. A replay needs a TypeScript runner; none is installed under
  `node_modules/.bin` (no `tsx` or `ts-node`).
- Whether any current host emits `PostToolUseFailure` is unknown from these corpora.

## Next step proposed

Amend Spec 17 before Phase 2: state that Codex verifies derive to `unknown` until a failure signal
is captured, and make "capture one real Codex failed verify and check its payload" the first
Phase 2 task.
