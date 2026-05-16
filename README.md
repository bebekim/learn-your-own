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

Create a new agent-managed repo folder in one command:

```sh
scripts/mkdir-agentic.sh ~/repositories/individual/synthetic-persona
```

This creates the folder, initializes Git, installs workflow files, ensures the
workspace ledger exists, initializes shared Beads with `bd init --skip-agents`,
installs Codex Beads guidance with `bd setup codex`, creates an initial Bead,
writes `.agent-learning/task-manifest.yaml`, registers the repo context, and
starts the first observable run. Use `--no-start` to stop after manifest
creation.

Generated repo-local files are rendered from Jinja-style templates in
`templates/scaffold/`. The repo `AGENTS.md` stays thin: it documents the parent
instruction hierarchy and repo-specific context instead of duplicating global or
workspace policy.

Start and finish an observable task run from a manifest:

```sh
cp templates/.agent-learning/task-manifest.yaml /path/to/task-manifest.yaml
$EDITOR /path/to/task-manifest.yaml
scripts/task-start.sh /path/to/task-manifest.yaml
scripts/task-finish.sh /path/to/task-manifest.yaml
```

The manifest is the execution contract. Beads owns task identity/status, the
manifest owns task-instance scope and planned execution, specs own correctness,
guardrails own permission boundaries, and Dolt owns observed run facts.

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
