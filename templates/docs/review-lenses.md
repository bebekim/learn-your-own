# Review Lenses

Use these lenses to classify risk, review progress, and convert feedback into
system changes. They are not a checklist. Pick at most three for a task.

## How To Use

Before work starts:

1. Name the task goal and stop condition.
2. Pick the smallest set of lenses that fit the likely failure mode.
3. Record the selected lenses in the spec, Bead note, or preflight report.

After review:

1. Classify the actual failure or success pattern.
2. Decide whether the lesson is local to the task or reusable.
3. Convert reusable lessons into a prompt rule, retrieval filter, test, data
   check, preflight gate, dashboard validation, or spec template update.

## Core Lenses

| Lens | Use When | Review Question |
| --- | --- | --- |
| Map/Territory | The agent may confuse summaries, memory, or plans with reality. | What concrete repo, data, test, log, or user evidence supports the claim? |
| Circle of Competence | The task crosses domain, legal, HR, customer, finance, or production authority. | Who owns acceptance, and what must be reviewed by a human domain owner? |
| Inversion | The task has hidden failure modes or high ambiguity. | What would make this fail even if the implementation looks plausible? |
| Margin of Safety | The task can cause operational, data, privacy, or customer impact. | What budget, approval, rollback, or read-only guard protects the system? |
| Bottleneck | The agent is optimizing details without progress. | What is the current limiting constraint: context, authority, data, tests, access, or design? |
| Falsification | The output could be persuasive but wrong. | What observation, test, or reviewer finding would disprove success? |
| Feedback Loop | A review found a recurring defect. | What should change so the same failure is less likely next time? |
| Incentives | A metric may be gamed or may distort behavior. | What would the agent optimize if it chased the metric too literally? |
| Sampling | A rule is being inferred from too few examples. | How many runs, files, tickets, or incidents support this conclusion? |
| Local/Global Maxima | The agent is making small corrections without escaping a bad approach. | Is state changing meaningfully, or are tokens being spent in a circle? |
| Surface Area | More context, tools, or integrations may increase risk. | What extra exposure does this add, and is it necessary for the goal? |
| Replication | A workflow is being copied into another repo. | What is portable, what must remain local, and what mutation is required? |

## Token Block Review

When a task is large enough to need a budget, define a token block:

- expected tokens
- maximum tokens
- expected state transition
- evidence required to accept the block
- stop condition if progress stalls

Review token use by progress density, not by cheapness alone:

```text
progress_density = accepted_state_transitions / tokens_used
```

High token use is not automatically bad. It is bad when it fails to buy accepted
state transitions, better evidence, simpler design, or reusable learning.

## Loop Detection

Mark a run as `loop-detected` when two or more of these are true:

- the same files are reread without a new hypothesis
- the same command fails repeatedly without a changed input
- the plan is restated without a state transition
- token use exceeds the block maximum without accepted evidence
- the agent changes implementation tactics but not the failing assumption
- the next action cannot be tied to the task stop condition

When a loop is detected, stop local optimization and broadcast the constraint:

1. state the blocker
2. state the failed approaches
3. ask for domain input or choose a new lens
4. update the spec, test, prompt rule, or guardrail after resolution

## Functional Broadcast

Use a functional broadcast when the lesson is reusable across tasks or repos.

Broadcast targets include:

- `AGENTS.md`
- `AGENT_LOOP.md`
- `.sandcastle/preflight-specs.md`
- `docs/review-lenses.md`
- `Specs/spec-template.md`
- tests, lint rules, SQL checks, data contracts, or dashboard validations

Do not broadcast task-specific facts, secrets, customer data, private business
context, or speculative conclusions.
