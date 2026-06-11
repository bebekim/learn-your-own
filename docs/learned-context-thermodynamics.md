# Learned Context As Thermodynamic Control

This is a conceptual sidebar for Lyo's learning model. It is not a product
specification.

## The Question

Static agent systems often improve performance by giving the model a strong
context harness:

```text
roles
checklists
project maps
skills
standing instructions
workflow loops
memory retrieval
```

That is useful. It reduces variance and gives the model a starting shape. But
it does not, by itself, prove that the context being supplied is the context
that actually reduces future work.

Lyo's product question is narrower:

```text
Which pieces of context have earned the right to be delivered again because
telemetry shows that they changed future behavior?
```

## Thermodynamic Metaphor

An unconstrained LLM call has high entropy. Many next tokens, plans, tools, and
files are plausible. Context acts as a boundary condition that narrows that
state space.

In this metaphor:

| Thermodynamic idea | Lyo meaning |
| --- | --- |
| Entropy | Uncertainty over the next useful action, file, verifier, or claim. |
| Work | Tokens, commands, reads, edits, tests, retries, and human approvals spent to turn ambiguity into evidence. |
| Heat | Irrelevant retrieved notes, stale instructions, decorative context, and repeated low-value actions. |
| Free energy | Expected wasted work caused by mismatch between the agent's current beliefs and the real task environment. |
| Boundary condition | Static system prompt, repo instructions, harness, role, checklist, or context map. |
| Cooling / annealing | Repeated feedback that turns a provisional lesson into a stable reusable artifact. |
| Non-equilibrium state | A changing repo, changing user, changing task family, and changing agent capability. |

Context is doing three things:

```text
1. Reducing entropy:
   fewer plausible next moves are treated as worth trying.

2. Supplying state:
   the model receives facts it would otherwise need to rediscover.

3. Reshaping the cost landscape:
   some paths become cheaper and more likely, such as running the known local
   verifier before wandering through the repo.
```

The danger is that context can also add heat. A memory blob can increase token
spend, distract the model, preserve stale assumptions, or make the agent
perform a ritual rather than solve the task.

## Crystallized Context

Projects such as process harnesses, agent frameworks, and persistent memory
systems commonly provide crystallized context. Examples include:

```text
fixed roles
fixed commands
fixed workflows
project documents
context maps
retrieval memories
safe-by-default transition rules
```

This is like lowering entropy by freezing part of the system into a stable
lattice. The benefit is immediate structure:

```text
the agent knows the workflow,
the agent knows the role,
the agent knows where to look,
the agent knows the allowed shape of action.
```

That is exactly why static harness engineering works. It creates a low-variance
container for the model.

But crystallized context has limits:

```text
it can go stale,
it may overfit to the author's preferred process,
it may over-inject irrelevant instructions,
it may not know which verifier actually matters in this repo,
it may preserve a lesson after the environment has changed.
```

Static context answers:

```text
What should the agent generally know or do?
```

It does not automatically answer:

```text
What has repeatedly helped this user, in this repo, under this task family,
with this agent loop?
```

## Learned Context

Learned context is context with a feedback trail.

In Lyo terms:

```text
trace
-> effect summary
-> association hypothesis
-> delivered context
-> later observation
-> credibility update
```

The probability of interest is not PageRank's probability of visiting a page or
an LLM's probability of the next token. The relevant probability is closer to:

```text
P(context artifact is useful in a future similar run | telemetry evidence)
```

or operationally:

```text
P(delivering this context lowers future wasted work or increases verified
progress in scope)
```

The effect algebra is the sensor layer. It tells Lyo what happened and when:

```text
what was read
what was edited
what verifier ran
what passed or failed
what artifact was delivered
what happened after delivery
```

The learning layer then asks whether an observation actually bears on a
conjecture:

```text
Did the context source activate?
Did the predicted consequence occur after it?
Was the consequence fresh?
Was there a rival explanation?
Was there a defeater?
Was this independent evidence or just a duplicate?
```

That is why Lyo should not treat `A predicts B` and `B happened` as automatic
proof. Plausible learning is provisional. It needs chronology, scope, rival
explanations, defeaters, and repeated varied evidence.

## Static Harnesses And Learned Context Are Complementary

The useful architecture is not:

```text
static harness vs learned context
```

It is:

```text
static harness as the chamber
learned context as the adaptive control surface
```

The static harness defines safe defaults:

```text
how to work
what not to do
where docs live
how to verify
how to stop
```

Learned context decides what should be injected because it has evidence:

```text
this source scope is usually verified by this command
this user tends to accept suggested plans unless prompted to challenge them
this workflow style becomes loop-driven only when an external scheduler appears
this context pack reduced repeated reads in similar runs
this policy prevented unsafe external writes without blocking local tests
```

In thermodynamic terms, the harness controls the container. Learned context
controls the local temperature, pressure, and catalysts.

## Product Implication

Lyo should not maximize context volume. It should maximize useful context
delivery under evidence.

A context artifact should move through states such as:

```text
candidate
-> delivered
-> observed
-> supported / weakened / defeated / neutral
-> promoted / retained / specialized / demoted
```

The goal is not a giant memory. The goal is lower future free energy:

```text
fewer irrelevant reads
faster verifier selection
less unverified stopping
fewer repeated mistakes
better scoped summaries
more verified progress per unit of work
```

That is the need for learned context. Static context crystallizes useful prior
structure. Learned context keeps the system alive when the environment changes.
