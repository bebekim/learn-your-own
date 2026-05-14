# Workspace Profiles

Use workspace profiles to keep learning local to the right environment.

## Layers

```text
global
  Universal agent workflow patterns.

work
  Work-only patterns: Databricks, Spark, SQL, production data risk, and
  business stakeholder review.

individual
  Personal-project patterns: Python, TypeScript, Lisp, dbt when relevant,
  local apps, and personal libraries.
```

## Broadcast Rule

Broadcast lessons to the narrowest valid layer:

| Lesson Type | Target Layer |
| --- | --- |
| Generic loop detection, token estimation, model routing | global |
| Databricks, Spark, production SQL, business guardrails | work |
| Python, TypeScript, Lisp, dbt, local development | individual |
| One repository family only | repo-local docs or `AGENTS.md` |
| One task only | Bead note or spec |

## Repo Context

Each run should identify:

```yaml
workspace_scope: global | work | individual
repo_family:
repo_path:
worktree_path:
branch:
current_commit:
bead_id:
spec_path:
dominant_stack:
guardrail_pack:
environment_risk:
```

For worktrees such as `nectr-data-lake-rep-*`, use the same `repo_family`
across the canonical repository and its worktrees. The worktree path is the
specific task context; the family groups learning across related runs.

## Circle Of Competence

Competence is contextual. Estimate it against:

- workspace scope
- repository family
- dominant stack
- task shape
- stakeholders and acceptance owner
- known tools and test commands

If a task is marked `inside` but estimate error remains high, the claimed
competence is stale or too broad.
