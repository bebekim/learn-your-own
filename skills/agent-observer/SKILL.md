---
name: agent-observer
description: Use when starting, finishing, or auditing an observable agent task where run evidence must be captured before interpretation.
version: 0.1.0
homepage: https://github.com/marcuskim1/agent-learning-workflow
metadata: {"openclaw":{"requires":{"bins":["bash","dolt"]},"emoji":"📼","skillKey":"agent-observer","tags":["openclaw","agent-learning","observation","run-recording","model-routing"]}}
---

# Agent Observer

Record what happened. Do not infer lessons, classify gaps, promote broadcasts,
or rewrite future policy.

## Boundary

This skill owns observation only:

- run identity
- declared goal and stop condition
- expected process and risk class
- execution context
- model, token, cost, and routing facts
- verification outcome
- compact trace events

## Runtime

At task start:

```bash
scripts/task-start.sh .agent-learning/task-manifest.yaml
```

At task finish:

```bash
scripts/task-finish.sh .agent-learning/task-manifest.yaml
```

Fill the manifest recording fields before finishing. See
`references/recording-contract.md`, `references/manifest-fields.md`, and
`references/platform-support.md`.

## Platform

Current runtime support is macOS, Linux, and Windows through WSL or a compatible
Unix-like shell. Native Windows PowerShell/CMD is a future adapter concern. The
portable contract is the manifest and ledger schema, not the Bash scripts.

## Rules

- Record evidence before interpretation.
- Keep observations descriptive.
- Preserve model identity with token/cost usage.
- Record verification even when the run failed or stopped early.
- Leave gap interpretation to `agent-gap-interpreter`.
- Leave adaptation and propagation to `agent-adaptation-propagator`.
