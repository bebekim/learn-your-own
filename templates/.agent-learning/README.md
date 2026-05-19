# Agent Learning Ledger

This directory contains the schema for a Dolt-backed semantic learning ledger.

Beads remains the task queue and source of task state. The Dolt ledger stores
run observations: token estimates, actuals, model routing, state transitions,
reviews, missing ingredients, and functional broadcasts.

Recommended layout:

```text
~/repositories/.agent-learning/ledger
~/repositories/work/.agent-learning/ledger
~/repositories/individual/.agent-learning/ledger
```

Use the narrowest ledger that matches the lesson:

- global: reusable across all workspaces
- work: Databricks, Spark, SQL, production data, and business-review patterns
- individual: Python, TypeScript, Lisp, dbt, local app, and personal-project
  patterns

Do not store raw full prompts, secrets, customer data, or production data in
this ledger. Store semantic facts and pointers to trace artifacts.

## Broadcast Learning Records

Use `functional_broadcasts` for accepted lessons that have been encoded into a
concrete artifact or rule. The broadcast row should say what changed, where it
should apply, and which metric should improve.

Use `broadcast_deliveries` when a future run receives the broadcast. This is a
delivery receipt, not proof that the broadcast worked.

Use `broadcast_effect_evaluations` after enough later runs exist to judge the
effect. Valid outcomes should be explicit: strengthen, weaken, contest, expire,
or supersede.
