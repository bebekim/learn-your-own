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

## Learning Ledger

Initialize a Dolt-backed semantic learning ledger for a workspace:

```sh
scripts/init-learning-ledger.sh /path/to/workspace work "databricks,spark,sql,python" "databricks-production,spark-sql,secrets,business-review"
```

Generate a simple report:

```sh
scripts/agent-learning-report.sh /path/to/workspace
```

Register the immediate repositories and worktrees in a workspace:

```sh
scripts/register-repo-contexts.sh /path/to/workspace work
```

Generate learning recommendations from repeated run patterns:

```sh
scripts/learning-review.sh /path/to/workspace
scripts/learning-review.sh /path/to/workspace --record
```

Beads remains the task queue. The ledger stores run observations for
calibration, model routing, missing ingredients, reviews, and functional
broadcasts.

## What To Commit Publicly

Safe to commit:

- `templates/`
- `scripts/`
- this README

Do not commit:

- generated target-repo specs
- private Beads databases
- company docs
- secrets or credential-bearing files
- customer or production identifiers
