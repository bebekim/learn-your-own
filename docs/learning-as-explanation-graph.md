# Learning As Inference Over An Explanation Graph

This document records the current mathematical direction for Lyo's learning
layer.

The key shift is:

```text
association is hypothesis generation
learning is inference over a graph of explanations
```

The corresponding formal target is:

- [Learning As Explanation Graph Spec](../spec/01-learning-as-explanation-graph.org)

## Why Association Counters Are Not Enough

Early Lyo learning discussions used this shape:

```text
A fired near B
the run went well
therefore strengthen A -> B
```

That is too weak. It recreates the failure mode we saw in Polya-style
plausible reasoning:

```text
A predicts B
B happened
therefore A became more credible
```

That move ignores the hard parts:

```text
Was A actually active?
Did B happen after A?
Was B fresh evidence?
Was B expected under a rival explanation?
Was there a defeater?
Was this evidence independent or duplicated?
Was the scope right?
```

So the learner should not treat co-occurrence as learning. Co-occurrence should
only create a conjecture.

## Pearl's Message-Passing Lesson

Pearl's belief-propagation idea is to turn a probabilistic network into a local
message-passing machine.

Instead of recomputing a huge joint probability table whenever evidence
arrives, each node exchanges small messages with its neighbors. In singly
connected graphs, those local messages recover the correct posterior beliefs.
In graphs with loops, the same update shape can be used approximately, but the
result is heuristic and must be treated with care.

The useful intuition for Lyo is:

```text
belief = top-down expectation * bottom-up evidence
```

In Pearl's notation:

```text
BEL(B_i) = alpha * lambda(B_i) * pi(B_i)
```

where:

```text
pi      = causal / anticipatory support from ancestors
lambda  = diagnostic / retrospective support from descendants
alpha   = normalization
```

For Lyo:

```text
pi:
  prior support from scope, known process, artifact history, task family,
  and previously learned hypotheses

lambda:
  diagnostic support from the current trace, verifier evidence, outcomes,
  defeaters, and rival explanations
```

The important constraint is that a message is not just the sender's full
belief. It is what the sender can say to the receiver after excluding the
receiver's own contribution. That exclusion is what prevents double-counting.

## Sum-Product In Lyo Terms

Belief propagation is often described as sum-product message passing.

Product means:

```text
combine independent supports
```

For Lyo, independent supports could include:

```text
scope matches
chronology is valid
verifier passed after final edit
evidence is fresh
no defeater is present
```

Sum means:

```text
sum over hidden alternatives
```

For Lyo, hidden alternatives include:

```text
the verifier passed because of this source change
the verifier passed because the repo was already healthy
the context helped
the context was irrelevant
the user manually corrected the run
the apparent success was caused by a different artifact
```

The mathematical reason this matters:

```text
posterior belief = sum over hidden explanations of products of local factors
```

Lyo should not expand the whole joint state of every possible explanation. It
should localize the computation through a graph.

## Explanation Graph

The Lyo learning graph should have variables such as:

```text
H: hypothesis is useful in scope
A: artifact should be delivered
E: evidence event observed
S: scope matches
C: chronology is valid
F: evidence is fresh
D: defeater is present
R: rival explanation is present
I: evidence is independent / novel
O: outcome improved
```

And factors such as:

```text
scope_factor(H, S)
chronology_factor(H, C)
freshness_factor(H, F)
defeater_factor(H, D)
rival_factor(H, R)
novelty_factor(H, I)
outcome_factor(H, A, O)
```

The central probability is:

```text
P(H is useful | evidence, scope, chronology, freshness, defeaters, rivals)
```

For context delivery:

```text
P(delivering artifact improves future run | current run context)
```

Those probabilities are not LLM next-token probabilities and not PageRank
visit probabilities. They are provisional beliefs about whether an explanation
or artifact helps future work.

## Mapping To Existing Lyo Layers

The current Lyo layers fit cleanly into this view:

```text
effect algebra:
  sensor layer
  tells us what happened and when

association extractor:
  conjecture generator
  proposes candidate explanations from co-fired trace items

explanation graph:
  inference substrate
  connects hypotheses, evidence, scope, rivals, and defeaters

belief propagation:
  local credibility update
  computes provisional belief from incoming messages

artifact delivery:
  intervention
  tests whether the inferred artifact actually changes behavior

experiment protocol:
  feedback loop
  compares predicted benefit with later telemetry
```

## How This Changes Lyo's Learning Definition

Old weak definition:

```text
learning = repeated association with positive outcome
```

Better definition:

```text
learning =
  provisional belief revision over competing explanations,
  followed by behavior change,
  followed by future evidence about whether that behavior improved outcomes
```

In one line:

```text
learning = inference + intervention + feedback
```

Without inference, Lyo only has correlations.

Without intervention, Lyo only has retrospective explanations.

Without feedback, Lyo cannot tell whether delivered context or artifacts helped.

## Exactness And Loops

Pearl-style belief propagation is exact on trees and polytrees. Lyo's learning
graph will usually contain loops:

```text
artifact -> behavior -> evidence -> hypothesis -> artifact
```

So Lyo must not claim exact posterior inference in the general case.

The practical rule is:

```text
tree-shaped local subgraphs:
  use exact local message passing when possible

general learning graph:
  use damped loopy belief propagation or simpler log-odds approximations
  and report the result as provisional credibility
```

The words matter. Lyo should say:

```text
provisionally supported
weakened
defeated
needs specialization
needs more evidence
```

It should not say:

```text
proven
globally true
converged to ground truth
```

## Implementation Direction

Do not jump straight to a full belief-propagation runtime.

The next rigorous implementation path is:

```text
1. Emit explanation graph JSON for one run or corpus.
2. Add deterministic factor values:
   scope, chronology, freshness, defeater, rival, novelty, outcome.
3. Compute one hypothesis belief with a simple log-odds or product rule.
4. Compare the belief result against old association-counter reports.
5. Add damped message passing only after graph emission is inspectable.
6. Keep all evidence append-only.
7. Keep all beliefs derived and reproducible.
```

## Algorithm v0: One Hypothesis, Message Vectors

The first algorithm should be smaller than a general Bayesian network.

Start with one binary hypothesis:

```text
H = "this hypothesis is useful in this scope"
not H = "this hypothesis is not useful in this scope"
```

Each deterministic factor emits a two-entry message vector:

```text
m_factor = [support_if_not_H, support_if_H]
```

The prior is also a vector:

```text
pi_H = [P(not H), P(H)]
```

Belief is computed by elementwise product and normalization:

```text
u = pi_H
    * m_scope
    * m_chronology
    * m_verifier
    * m_freshness
    * m_no_defeater
    * m_no_rival
    * m_independent

BEL(H) = u[H] / (u[not H] + u[H])
```

This is the smallest useful Pearl-like shape:

```text
multiply independent local supports
normalize into a belief
```

### Numeric Example

Hypothesis:

```text
H:
  src/compiler/** is usefully verified by tests/compiler-frontend.test.js
```

Prior:

```text
pi_H = [0.75, 0.25]
```

Observed evidence messages:

```text
m_scope        = [0.60, 1.00]  # source scope matched
m_chronology   = [0.50, 1.00]  # verifier ran after final edit
m_verifier     = [0.30, 1.00]  # verifier passed
m_freshness    = [0.70, 1.00]  # evidence was fresh
m_no_defeater  = [0.80, 1.00]  # no known defeater
m_no_rival     = [0.85, 1.00]  # no stronger rival explanation
m_independent  = [0.80, 1.00]  # evidence not a duplicate
```

Elementwise product:

```text
u[not H] =
  0.75 * 0.60 * 0.50 * 0.30 * 0.70 * 0.80 * 0.85 * 0.80
  = 0.025704

u[H] =
  0.25 * 1.00 * 1.00 * 1.00 * 1.00 * 1.00 * 1.00 * 1.00
  = 0.25
```

Normalize:

```text
BEL(H) = 0.25 / (0.025704 + 0.25)
       = 0.9068
```

So the hypothesis is not "proven." It has strong provisional support under
this factor version.

### Matrix View

Each factor can be represented as a compatibility matrix. Rows are hypothesis
states. Columns are observed factor states.

Example scope factor:

```text
Phi_scope =

              scope_false   scope_true
not H             1.00          0.60
H                 0.40          1.00
```

If `scope_true` is observed, the message to `H` is the observed column:

```text
m_scope = [0.60, 1.00]
```

Example chronology factor:

```text
Phi_chronology =

              chronology_false   chronology_true
not H                1.00              0.50
H                    0.20              1.00
```

If `chronology_true` is observed:

```text
m_chronology = [0.50, 1.00]
```

This is enough for the first implementation. Lyo can emit the matrices,
observed columns, intermediate products, and final normalized belief in a
debuggable report.

## Rival Explanation Sum

The "sum" part becomes important when Lyo considers hidden rival explanations.

Suppose:

```text
R = rival explanation for success
R states:
  none
  repo_already_healthy
  user_manual_correction
```

Lyo observes:

```text
O = verifier_passed
```

Instead of treating the pass as direct support for `H`, compute:

```text
m_outcome(H) = sum over r:
  P(O = verifier_passed | H, r) * P(r)
```

Example table:

```text
P(r):

none                    0.60
repo_already_healthy     0.25
user_manual_correction   0.15
```

```text
P(verifier_passed | H, r):

                          none   repo_already_healthy   user_manual_correction
not H                     0.20          0.85                    0.75
H                         0.80          0.90                    0.85
```

Then:

```text
m_outcome(not H) =
  0.20*0.60 + 0.85*0.25 + 0.75*0.15
  = 0.445

m_outcome(H) =
  0.80*0.60 + 0.90*0.25 + 0.85*0.15
  = 0.8325
```

So the passing verifier supports `H`, but not as strongly as a naive update
would. The sum over rivals discounts evidence that could be explained by other
causes.

This is the core reason to prefer explanation graphs over `+1 / 0 / -1`
credit. The algorithm can say:

```text
the outcome supports H,
but rival explanations explain part of the evidence,
so credibility increases only provisionally.
```

The first useful graph should focus on one concrete hypothesis family:

```text
resource scope -> verifier command
```

Example:

```text
H:
  src/compiler/** is usefully verified by tests/compiler-frontend.test.js

Evidence:
  source files under src/compiler/** changed
  tests/compiler-frontend.test.js ran after final edit
  verifier passed
  no stronger rival verifier explanation was present
  evidence came from a distinct run

Belief:
  H receives stronger provisional support

Artifact:
  suggest tests/compiler-frontend.test.js for future matching compiler changes
```

## Thermodynamic Reading

Belief propagation also fits the thermodynamic picture:

```text
belief graph:
  current distribution over explanations

messages:
  local flows of constraint and evidence

free energy:
  mismatch between the current explanation distribution and observed telemetry

learning:
  local message passing that lowers expected future wasted work
```

Learned context should therefore be treated as a control artifact whose
credibility depends on the graph, not as a static memory blob.

## Source Notes

This direction is based on:

- Judea Pearl's message-passing view of probabilistic reasoning and the split
  between predictive (`pi`) and diagnostic (`lambda`) support.
- Pearl's "A Constraint Propagation Approach to Probabilistic Reasoning",
  which frames uncertainty management as local records of sources of belief
  supporting simultaneous predictive and diagnostic propagation:
  https://arxiv.org/abs/1304.3422
- Murphy, Weiss, and Jordan's empirical warning that loopy belief propagation
  often works but can oscillate or fail on some networks:
  https://arxiv.org/abs/1301.6725
- Shenoy, Shafer, and Mellouli's "Propagation of Belief Functions: A
  Distributed Approach", especially the point that local computation requires
  more structure than a pure production-rule system:
  https://arxiv.org/abs/1304.3109
- Shenoy and Shafer's axiomatic account of local computation via combination
  and marginalization:
  https://arxiv.org/abs/1304.2374
