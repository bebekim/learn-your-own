# Guardrails

Guardrails protect external systems before an agent acts.

For workspaces with Databricks, Spark, SQL warehouses, production tables,
permissions, jobs, notebooks, or secrets, new agent-executed operations must be
described by a repo-local plan before execution:

```text
.guardrails/plans/<task-name>.json
```

The plan should state:

- goal
- repository
- environment
- risk level
- exact tool steps
- exact SQL statements when SQL is involved
- approval requirement and approval evidence

## Default Rule

Read-only planning is allowed. Production writes, permission changes, job
mutations, secret reads, Spark overwrites, and generated SQL execution require
an explicit verified plan and human approval.

## Preflight Contract

For any non-trivial task touching Databricks, Spark, SQL, production data, jobs,
permissions, external sends, HR workflows, or customer-impacting actions,
preflight must record:

- guardrail plan path
- verifier command
- verifier result
- approval required: yes/no
- approval granted: yes/no
- blocked findings, if any

If the guardrail plan is missing or verification failed, the spec is not ready
for unattended work.

## Learning Contract

Guardrail outcomes should be recorded as run observations:

- plan path
- plan verified
- risk level
- approval required/granted
- blocked tools or SQL
- missing policy coverage
- reusable lesson

If a blocked or near-miss pattern recurs, broadcast the lesson to the narrowest
valid layer: repo docs, work-level `AGENTS.md`, preflight, tests, or the
guardrail verifier policy.
