# session_prompts.prompt_kind — Classification Gap

**Date:** 2026-08-08
**Priority:** Low (feature enhancement, not a broken pipeline)
**Parent analysis:** `problems/2026-08-08-telemetry-acquisition-gaps.md` (finding 5)

## Summary

The `session_prompts` table has a `prompt_kind` column designed for rich prompt
classification, but only two values are ever written: `user_prompt` and
`assistant_response`. These are structural roles, not semantic kinds — they tell
you *who* spoke, not *what kind of work* the prompt represents. Without semantic
classification, the compiler cannot distinguish a direction-setting opening prompt
from a debugging follow-up from a refactoring request. This limits workflow
pattern analysis and the candidate-at-bat compiler's ability to understand session
shape.

## Schema

`src/schema.ts:125-139`:

```sql
create table if not exists session_prompts (
  prompt_id text primary key,
  session_id text not null references agent_sessions(session_id),
  run_id text,
  turn_id text,
  prompt_index integer not null,
  prompt_role text not null,
  prompt_kind text not null,       -- free text, no CHECK constraint
  prompt_sha256 text,
  prompt_ref text,
  prompt_summary text,
  response_summary text,
  model text,
  recorded_at text not null
);
```

`prompt_kind` is `text not null` with no CHECK constraint — any string is
accepted. The schema was designed to allow open-ended classification, but no
classification logic exists to populate it.

## What Actually Gets Written

### Adapter layer (the only producers)

Both adapters emit exactly two kinds, hardcoded:

**`src/adapters/codex.ts:91-111`** — `UserPromptSubmit` event:
```typescript
promptBoundary = {
  sessionId,
  turnId,
  role: 'user',
  kind: 'user_prompt',           // hardcoded — every user prompt
  promptText: options.includeRawPrompt ? event.prompt : undefined,
  ...
};
```

**`src/adapters/codex.ts:112-128`** — `Stop` event:
```typescript
promptBoundary = {
  sessionId,
  turnId,
  role: 'assistant',
  kind: 'assistant_response',    // hardcoded — every assistant turn
  responseSummary: summarizeText(event.last_assistant_message),
  ...
};
```

**`src/adapters/claude.ts:81-117`** — identical structure, same two hardcoded
values (`'user_prompt'` at line 94, `'assistant_response'` at line 114).

No other adapter or code path emits a `prompt_kind` value. The `prompt_index`
counter (assigned by `nextPromptIndex()` in the reducer) increments sequentially
per session, so `prompt_index = 0` is always the first user prompt — but this
positional information is never used to assign a richer kind.

### Reducer layer (pass-through)

`src/reducers/observation.ts:53-91` — `recordPromptBoundary()`:
```typescript
export function recordPromptBoundary(kernel: LearningKernel, input: RecordPromptBoundaryInput): PromptBoundaryRecord {
  requireFields(input, ['sessionId', 'role', 'kind']);
  // ...
  kernel.db.prepare(`
    insert into session_prompts (..., prompt_kind, ...)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(promptId, ..., input.kind, ...);
```

The type `RecordPromptBoundaryInput` (`src/types/observation.ts:53-66`) declares
`kind: string` — free text, no union type, no validation. Whatever the adapter
sends is inserted verbatim. The reducer does no classification.

### CLI layer (manual override, unused in practice)

`src/cli/commands/observation.ts:56`:
```typescript
kind: args.flagValue('--kind') ?? 'user_prompt',
```

The `lyo observe` CLI command accepts a `--kind` flag but defaults to
`'user_prompt'`. No other CLI command or script passes a custom `--kind` value.
The one `repo-direction` row found in the agent-learning-workflow database (see
gap analysis) was likely inserted via this CLI path manually.

## Consumer Impact

`src/compiler/candidate-at-bat/final-claim.ts:23-31` queries:
```sql
select response_summary as responseSummary
from session_prompts
where (run_id = ? or turn_id = ?)
  and prompt_role = 'assistant'
  and prompt_kind = 'assistant_response'
  and response_summary is not null
order by recorded_at, prompt_index
```

This consumer filters on `prompt_kind = 'assistant_response'` — so it depends on
the current values being correct. If new kinds were introduced for assistant
messages (e.g. `direction_setting` applied to an assistant turn), this query
would silently exclude them. Any new classification scheme must ensure the
`final-claim.ts` consumer is updated to match.

No other consumer in the codebase queries `prompt_kind` (verified via grep
across `src/`).

## Why It Matters

The current two-value scheme conflates **structural role** (`user` vs `assistant`)
with **semantic kind** (`user_prompt` vs `assistant_response`). But `prompt_role`
already captures the structural role — `prompt_kind` was meant to capture
something richer.

Without semantic classification:

- **Cannot identify direction-setting prompts.** The first prompt of a session
  (`prompt_index = 0`) typically sets the overall direction — "build a REST API
  for user management", "investigate why tests are flaky". This is qualitatively
  different from the 15th prompt ("try adding a log line"). The compiler can't
  distinguish them.

- **Cannot track workflow patterns.** A session that starts with a
  direction-setting prompt, then has 3 debugging requests, then a refactoring
  request tells a different story than one with 10 direction-setting prompts.
  Pattern analysis over `prompt_kind` would reveal common session shapes.

- **Cannot correlate prompt types with outcomes.** Are debugging requests more
  likely to end in a blocked final-claim? Are direction-setting prompts more
  likely to end in a done claim? Without classification, this analysis is
  impossible.

- **Cannot weight prompt importance.** The candidate-at-bat compiler treats all
  prompts equally. A direction-setting prompt should arguably carry more weight
  in determining the session's overall trajectory than a mid-session clarification.

## Proposed Classification Scheme

### For user prompts

| Kind | When | Signal |
|---|---|---|
| `direction_setting` | `prompt_index = 0` (first user prompt in session) | Positional — always the opening prompt |
| `task_instruction` | User provides a concrete task with steps or requirements | Content heuristic — imperative verbs, numbered lists, code blocks |
| `debugging_request` | User reports an error, failure, or unexpected behavior | Content heuristic — "error", "fail", "crash", stack traces, "why does" |
| `question` | User asks a factual or exploratory question | Content heuristic — starts with "what", "why", "how", "can you explain" |
| `refactoring_request` | User asks to restructure existing code | Content heuristic — "refactor", "rename", "extract", "move", "reorganize" |
| `correction` | User corrects the assistant's previous output | Content heuristic — "no, I meant", "that's wrong", "not what I asked" |
| `follow_up` | Default for subsequent user prompts that don't match above | Fallback |

### For assistant responses

| Kind | When | Signal |
|---|---|---|
| `assistant_response` | Default — keep as-is for backward compatibility | Fallback |
| `plan_proposed` | Assistant proposes a multi-step plan | Content heuristic — numbered steps, "I'll", "first...then" |
| `code_change` | Assistant writes or modifies files | Tool-use heuristic — Edit/Write tool calls in the turn |
| `investigation` | Assistant reads files, runs commands, explores | Tool-use heuristic — Read/Grep/Glob/Bash tool calls |
| `summary` | Assistant summarizes findings or status | Content heuristic — "in summary", "to recap", "overall" |

## Implementation Approach

### Where to classify

The adapter layer (`src/adapters/codex.ts`, `src/adapters/claude.ts`) is the
natural place — it's where the prompt text is available and where the event
context (event name, prompt_index) is known.

### How to classify

**Positional (simplest, no content analysis):**
```typescript
// In the adapter, when emitting a UserPromptSubmit boundary:
const kind = promptIndex === 0 ? 'direction_setting' : 'follow_up';
```

This alone would add meaningful classification: the first prompt is always
direction-setting, subsequent prompts are follow-ups. The adapter would need
access to the current prompt index (either by querying the DB or by tracking
it in the adapter's session state).

**Content heuristics (medium complexity):**
```typescript
function classifyUserPrompt(text: string, index: number): string {
  if (index === 0) return 'direction_setting';
  const lower = text.toLowerCase();
  if (/\b(error|fail|crash|exception|traceback|why does|why is)\b/.test(lower)) return 'debugging_request';
  if (/^(what|why|how|can you explain|explain)\b/.test(lower)) return 'question';
  if (/\b(refactor|rename|extract|move|reorganize)\b/.test(lower)) return 'refactoring_request';
  if (/\b(no,? i meant|that's wrong|not what i asked|incorrect)\b/.test(lower)) return 'correction';
  return 'follow_up';
}
```

**Tool-use heuristics (for assistant responses):**
Requires looking at the tool calls within the turn. This is more complex because
the adapter sees the `Stop` event, which may or may not include tool-use history.
A simpler approach: keep `assistant_response` as the default and let the compiler
infer the kind from the hook_events table (which records individual tool calls).

### Consumer update

If any new assistant kinds are introduced, `final-claim.ts:28` must be updated:
```sql
-- Current:
and prompt_kind = 'assistant_response'
-- Updated:
and prompt_kind in ('assistant_response', 'plan_proposed', 'code_change', 'investigation', 'summary')
```

Or better, filter on `prompt_role = 'assistant'` only (which it already does) and
drop the `prompt_kind` filter entirely — the role filter is sufficient to
identify assistant messages.

### Type safety

`RecordPromptBoundaryInput.kind` (`src/types/observation.ts:58`) should be
tightened from `string` to a union type:
```typescript
type PromptKind =
  | 'user_prompt' | 'direction_setting' | 'task_instruction'
  | 'debugging_request' | 'question' | 'refactoring_request'
  | 'correction' | 'follow_up'
  | 'assistant_response' | 'plan_proposed' | 'code_change'
  | 'investigation' | 'summary';
```

The schema's free-text column means old data with unknown kinds won't break, but
new writes should be constrained to the union.

## Priority and Sequencing

This is a **low-priority feature enhancement**, not a broken pipeline. The
existing two-value scheme doesn't lose data — every prompt is recorded with its
text/hash/summary. The gap is analytical, not operational.

Recommended sequence:

1. **Positional classification first** (smallest change, highest value): mark
   `prompt_index = 0` as `direction_setting`. This is a one-line change per
   adapter and immediately enables first-prompt-vs-rest analysis.

2. **Content heuristics second** (medium effort): add a `classifyUserPrompt()`
   function. Test with TDD against known prompt patterns.

3. **Assistant classification third** (highest effort, lowest ROI): requires
   tool-use correlation. May not be worth the complexity until there's a concrete
   consumer that needs it.

4. **Schema constraint last** (optional): add a CHECK constraint or migrate
   `prompt_kind` to an enum once the classification scheme stabilizes.

## Files Involved

| File | Role |
|---|---|
| `src/schema.ts:125-139` | Table definition — `prompt_kind text not null` (no CHECK) |
| `src/adapters/codex.ts:91-128` | Codex adapter — hardcodes `'user_prompt'` and `'assistant_response'` |
| `src/adapters/claude.ts:81-117` | Claude adapter — same two hardcoded values |
| `src/reducers/observation.ts:53-91` | Reducer — pass-through, inserts whatever `kind` it receives |
| `src/types/observation.ts:53-66` | Type — `kind: string` (free text, no union) |
| `src/cli/commands/observation.ts:56` | CLI — `--kind` flag, defaults to `'user_prompt'` |
| `src/compiler/candidate-at-bat/final-claim.ts:28` | Consumer — filters on `prompt_kind = 'assistant_response'` |
