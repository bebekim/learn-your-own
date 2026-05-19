---
name: agent-gap-interpreter
description: Use when recorded agent-run evidence must be compared against a declared goal to identify gaps, causes, and candidate corrections.
version: 0.1.0
homepage: https://github.com/marcuskim1/agent-learning-workflow
metadata: {"openclaw":{"requires":{"bins":["bash","dolt"]},"emoji":"🧭","skillKey":"agent-gap-interpreter","tags":["openclaw","agent-learning","feedback","gap-analysis","cybernetics"]}}
---

# Agent Gap Interpreter

Answer: What gap between goal and practice does this reveal?

This skill interprets recorded evidence after `agent-observer` has captured the
run. It may compare, classify, and form candidate corrections. It does not
propagate adaptations.

## Boundary

Owns:

- goal versus practice comparison
- gap statements
- severity and confidence
- cause hypotheses
- evidence and counterevidence
- candidate correction descriptions

Does not own:

- raw run recording
- artifact updates
- broadcast delivery
- model/router policy changes

See `references/gap-taxonomy.md` and `references/evidence-standards.md`.
