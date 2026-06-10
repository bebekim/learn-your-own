# Style Learning

Lyo's learning surface is separate from scoring. The first learning report is
read-only and answers:

```text
How does this user tend to work with LLMs and coding agents?
```

It aggregates local telemetry across runs and reports:

- LLM/model usage: model calls, token totals, estimated cost, model counts, and
  model-lane counts.
- Workflow style distribution: prompt-driven, manually orchestrated,
  loop-assisted, loop-driven candidate, or insufficient evidence.
- Vibecoding loop signals: prompts, actions, edits, verifiers, verified edit
  runs, debugging runs, unverified edit stops, unsafe writes, and loop artifact
  touches.
- Reviewable learning candidates: procedures, critics, context packs, policies,
  verifiers, or instrumentation improvements.

Run it against a local ledger:

```sh
lyo learn style --db .agent-learning/learning.sqlite
```

The report version is:

```text
lyo/style-learning/v1
```

## What It Learns

The v1 report does not persist anything. It proposes learning candidates such
as:

- Preserve verifier/debug loops when telemetry repeatedly shows edit -> verify
  -> debug -> pass.
- Add a critic when local edits often stop without a later verifier.
- Convert repeated prompt-driven or manually orchestrated work into explicit
  loop prompts, scripts, or review gates.
- Carry loop artifacts forward as a context pack when runs touch prompts,
  specs, tests, or agent-loop files.
- Improve model-call instrumentation when token counts are missing.

Each candidate includes:

```text
id
kind
title
rationale
confidence
support
evidenceRunIds
```

## What It Does Not Do Yet

Style learning is not a scoring rubric. It does not rank candidates or judge
engineering quality by itself.

It also does not yet:

- persist learning artifacts;
- inject learned procedures into future runs;
- track explicit child-agent lineage;
- reliably record every human approval or continuation decision;
- cluster long-term style automatically;
- compare before/after replay attempts;
- use an LLM judge.

Those belong after the read-only learning report has been validated on real
historical telemetry.

The next learning target is the append-only cybernetic association learner:

- [Cybernetic Association Learner](cybernetic-association-learner.md)
