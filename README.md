# Agent Learning Workflow

A sanitized template for turning agent-assisted coding into a learning system.

This repository contains only reusable workflow machinery:

- Beads-first task selection
- spec preflight
- isolated Night Shift execution prompts
- morning-review learning loop
- guardrail and authority-conflict rules
- lightweight workflow checks

It intentionally does not contain project specs, company docs, Jira tickets,
customer names, production identifiers, secrets, or business-specific data.

## Mental Model

The workflow is a cybernetic loop:

```text
environment signal
-> spec / Bead
-> preflight
-> agent implementation
-> checks
-> morning review
-> codified lesson
```

The important move is the final one. Repeated corrections become specs, docs,
tests, guardrails, or workflow checks so future runs behave differently.

## Install Into A Repo

From this template repo:

```sh
scripts/install-workflow.sh /path/to/target-repo
```

The installer copies generic workflow files only. It does not copy any existing
project specs or docs into this template.

## What To Commit Publicly

Safe to commit:

- `templates/`
- `scripts/install-workflow.sh`
- this README

Do not commit:

- generated target-repo specs
- private Beads databases
- company docs
- secrets or credential-bearing files
- customer or production identifiers
