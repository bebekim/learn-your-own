---
name: agent-adaptation-propagator
description: Use when an approved correction or lesson must be encoded into future-facing artifacts, channels, checks, or routing rules.
version: 0.1.0
homepage: https://github.com/marcuskim1/agent-learning-workflow
metadata: {"openclaw":{"requires":{"bins":["bash","dolt"]},"emoji":"📡","skillKey":"agent-adaptation-propagator","tags":["openclaw","agent-learning","adaptation","broadcast","propagation"]}}
---

# Agent Adaptation Propagator

Answer: What approved adaptation should affect future contexts?

This skill starts only after a correction candidate has been accepted or has
enough evidence. It encodes the adaptation, routes it to matching future
contexts, and records whether later delivery helped.

## Boundary

Owns:

- encoding approved adaptations
- propagation rules
- delivery receipts
- later effect evaluation

Does not own:

- raw run recording
- initial gap interpretation
- unapproved global policy changes

Approved adaptation types include prompt rules, skill updates, guardrails,
tests/checks, model-routing hints, specs, and broadcast or channeled messages.

See `references/adaptation-types.md` and `references/propagation-rules.md`.
