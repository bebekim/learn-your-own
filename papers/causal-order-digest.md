# Causal Order and LYO

Date: 2026-08-15. Paper: Aniket Vashishtha et al., *Causal Order: The Key to
Leveraging Imperfect Experts in Causal Inference*, ICLR 2025; arXiv v2 dated
2025-04-08 ([primary paper](https://arxiv.org/html/2310.15117v2)).

## The short version

The paper's useful message for LYO is not "build a causal graph of lessons."
It is:

> Ask an imperfect expert for the weakest stable claim it can reliably make;
> aggregate that claim across contexts; use it as a prior or constraint; let
> downstream evidence decide the details.

The paper shows this in causal discovery. Asking an expert whether `A causes B`
forces it to decide whether the relationship is direct, even though that answer
depends on which mediators are represented. Even a perfect expert can therefore
produce a graph with incorrect extra edges while preserving the correct upstream
order. The authors replace the full graph with a topological order, which asserts
precedence without inventing the exact edge structure
([abstract and introduction](https://arxiv.org/html/2310.15117v2#S1),
[§3.1](https://arxiv.org/html/2310.15117v2#S3.SS1)).

For LYO, the analogous mistake is turning one model explanation and one passing
run into a strong causal story: "this lesson directly caused the pass." LYO's
own design already rejects that move: co-occurrence creates a conjecture, while
learning must consider chronology, scope, rivals, defeaters, and later outcomes
(`docs/learning-as-explanation-graph.md:17-49`). The paper gives that doctrine a
useful interface-design test: **store only as much structure as the evidence can
stably support**.

## What the paper actually establishes

### 1. Full structure is a bad interface for imperfect expertise

A pairwise answer cannot reliably distinguish a direct edge from an indirect
path unless the relevant mediators are known. Under the paper's formal "perfect
expert" definition, aggregating pairwise answers may add every ancestor-to-
descendant relationship as an edge. Proposition 3.1 says that this graph can
have nonzero structural Hamming distance while still admitting a correct
topological order (`D_top = 0`)
([§3.1](https://arxiv.org/html/2310.15117v2#S3.SS1)).

This is not a claim that order recovers the true graph. It says order is a more
stable interface: it preserves upstream/downstream knowledge while leaving the
exact direct edges to a data-driven method.

### 2. The weaker artifact is still operationally useful

Under a fully observed DAG with no latent confounding, the paper shows that all
variables preceding a treatment in a correct topological order form a valid
backdoor adjustment set. It also uses order to orient undirected edges from PC
and as a level-order prior for CaMML, thereby reducing the downstream discovery
search space
([§3.2](https://arxiv.org/html/2310.15117v2#S3.SS2)).

So "weaker" does not mean "merely descriptive." A partial structural claim can
pay rent by constraining a later decision without pretending to be the final
answer.

### 3. Contextual redundancy can make an imperfect expert more reliable

The triplet method asks for an acyclic three-variable mini-graph, so every pair
is judged repeatedly with different auxiliary variables. It majority-votes the
three possible pair relations, escalates ties to a stronger expert, merges the
answers, and extracts an order. The full method costs `O(n^3)` calls; sampling a
constant number of auxiliary variables gives `O(k n^2)`
([§4.2](https://arxiv.org/html/2310.15117v2#S4.SS2)).

The paper's theoretical error reduction depends on strong assumptions: the
epsilon-expert obeys acyclicity, renormalizes its probabilities after a choice
is ruled out, and the proof averages uniformly over possible three-node DAGs
([Proposition 4.1 and Appendix B](https://arxiv.org/html/2310.15117v2#S4.SS2)).
The transferable mechanism is therefore repeated contextual judgment plus
aggregation—not a general guarantee that any three-way prompt improves an LLM.

### 4. The experiments support the interface, with caveats

Across the tested Bayesian-network and medical graphs, triplet prompting
usually produced fewer cycles and lower topological divergence than pairwise
prompting. On the 20-node Child graph, GPT-3.5 pairwise prompting produced over
3,000 cycles while triplet prompting produced none; small-model triplets also
beat GPT-4 pairwise prompting on several larger graphs
([§5.1, Tables 2–3](https://arxiv.org/html/2310.15117v2#S5.SS1)). Order-assisted
PC and CaMML generally improved downstream order and tested effect estimates,
especially at lower sample sizes
([§5.2](https://arxiv.org/html/2310.15117v2#S5.SS2)).

The evidence is promising rather than universal: the graphs are small, the
human study has 15 non-domain annotators with three annotations per dataset,
triplet ties use GPT-4 or a ground-truth oracle, some BNLearn memorization is
possible, and pruning can leave isolated nodes. The paper itself says order is
not enough for novel relationships or counterfactual estimation, which require
more complete mechanisms
([§6](https://arxiv.org/html/2310.15117v2#S6)).

## The LYO mapping

| Paper concept | Best LYO translation | Current repository state |
| --- | --- | --- |
| Full graph overcommits beyond expert knowledge | Do not promote a model's explanation into a universal rule; retain a scoped behavioral hypothesis | A lesson stores `failure_class`, cue, explanation, intervention, counters, and provenance (`src/lyo/storage/schema.ts:32-45`) |
| Causal order is a weaker but useful interface | Prefer the weakest artifact that can constrain the next decision: chronology, scope, forbidden action, prerequisite, or candidate intervention | The explanation-graph design already separates conjecture from belief and lists chronology, scope, rivals, and defeaters (`docs/learning-as-explanation-graph.md:17-49`) |
| Expert output is a prior/constraint, not final structure | Let LLM reflection propose; let verifier evidence and later outcomes update trust | Counters move only through recorded lesson applications and validation outcomes (`src/lyo/storage/lesson-store.ts:711-751`) |
| Re-query each relation under auxiliary contexts and vote | Test a lesson across several task families/runs/cues; aggregate independent evidence; escalate ambiguous cases | Decision rows record context, all candidates, propensities, selections, and posterior snapshot (`src/lyo/storage/schema.ts:88-107`; `src/lyo/storage/lesson-store.ts:605-658`) |
| Use uncertainty to select or prune | Keep uncertain candidates explorable and demote/quarantine after harmful evidence | Thompson sampling uses `Beta(helpful+1, harmful+1)` (`src/lyo/selection/selection-policies.ts:82-99`); active and candidate lessons remain retrievable (`src/lyo/storage/schema.ts:115-121`) |
| Order reduces downstream search space | A validated prerequisite/precedence constraint could filter incompatible interventions before selection | Not implemented: selection currently retrieves the flat set for one `failure_class` and samples it (`src/lyo/storage/lesson-store.ts:501-544`) |
| Evaluate order by downstream utility, not graph resemblance | Evaluate a lesson representation by verifier outcomes, recurrence, recovery speed, and selection regret—not how complete its prose sounds | Outcome and decision receipts exist, but causal credit decomposition remains a design target (`Specs/3.1-counterfactual-credit-synthesis.md:45-86`) |

## Where the analogy is strongest

### Lessons should be constraints with calibrated scope, not causal stories

Suppose a run reads a file, edits code, and passes a test after receiving
"inspect the schema before changing the serializer." The unstable artifact is:

```text
Reading the schema directly caused the test to pass.
```

The more defensible artifact is:

```text
For serializer changes in this repository, inspect the schema before editing;
this intervention is a candidate for reducing contract mismatches.
```

That second form resembles causal order: it constrains future behavior while
remaining agnostic about the full mechanism and other mediators. LYO's existing
lesson schema has the right slots for this—cue, explanation, intervention,
provenance—but its reflector and promotion policy must keep the explanation no
stronger than the evidence (`src/lyo/storage/schema.ts:32-45`).

### The triplet analogue is cross-context validation, not necessarily a three-item prompt

The important feature of triplets is that the same claim is observed under
several auxiliary contexts. For LYO, those contexts could be different repos,
task families, failure classes, models, or verifier conditions. A lesson should
gain confidence when its directional prediction survives these context changes,
and split into narrower lessons when it does not.

LYO already logs much of the necessary audit substrate: candidate propensities
and context at decision time (`src/lyo/storage/lesson-store.ts:484-544`), posterior
snapshot IDs (`src/lyo/storage/lesson-store.ts:605-658`), and run randomness
(`src/lyo/storage/lesson-store.ts:669-708`). The missing part is the aggregation
rule that distinguishes repeated independent support from repeated observations
of the same scenario.

### A lesson should earn its interface by downstream performance

The paper argues that structural Hamming distance can punish an expert for extra
transitive edges even when the useful ordering is correct. LYO has an analogous
evaluation trap: rating a lesson by whether its explanation reconstructs the
entire run narrative. The better test is whether the artifact changes future
behavior and outcomes in the intended scope. This matches LYO's stated flow from
delivery to later evidence (`README.md:13-22`) and its scoring doctrine that a
signal must change the expected outcome of an intervention
(`Specs/5-scoring-layer.md:10-23`).

## Where the analogy breaks

### There is no defined DAG over "lessons" yet

The paper's nodes are variables in an assumed causal DAG. LYO lessons are mixed
artifacts: some describe failure mechanisms, some are actions, some are process
constraints, and some are coding tactics. Before implementing topological lesson
selection, LYO would need to define homogeneous node semantics and what an edge
means. Otherwise `lesson A precedes lesson B` is syntactically graph-shaped but
scientifically empty.

A safer first graph would use typed nodes such as:

```text
failure signal -> proposed intervention -> observed behavior -> verifier outcome
```

That graph follows LYO's existing event model and makes chronology testable. A
cross-lesson dependency graph should wait until repeated receipts demonstrate
that such dependencies improve selection.

### Agent workflows contain loops, hidden variables, and nonstationarity

Real software work has retries, feedback loops, human steering, changing code,
model updates, and unlogged context. Those violate or strain the paper's fully
observed, acyclic framing. A literal `D_top` guarantee or backdoor-set claim
cannot be carried over. LYO's draft causal-discovery spec correctly treats
ordering as a possible search-space constraint, but that is an analogy and
requires an explicit causal model before it becomes an estimator
(`Specs/6-causal-discovery-framework-integration.md:84-126`).

### Ordering does not solve lesson credit

The paper separates order from exact edges; it does not tell LYO which of two
simultaneously injected lessons caused a pass. The current validation path gives
every uncounted application in a passing run a helpful increment
(`src/lyo/storage/lesson-store.ts:727-751`). LYO's propensity-standardized,
within-run credit work remains necessary
(`Specs/3.1-counterfactual-credit-synthesis.md:45-86`). Causal ordering may reduce
the candidate space, but it cannot substitute for credit assignment.

## Practical conclusions for LYO

1. **Adopt the interface principle now.** Require lessons to state scope and the
   weakest supported directional claim. Treat complete causal explanations as
   hypotheses, not facts.
2. **Use existing decision receipts for contextual replication.** Group evidence
   by task family, failure class, model, and verifier condition; reward transfer
   across contexts and split lessons whose effect is context-specific.
3. **Keep LLM judgment upstream of empirical control.** Models may propose,
   compare, or vote on candidate constraints; validation outcomes must remain the
   trust signal.
4. **Measure downstream utility.** Compare scoped constraint-style lessons with
   unconstrained prose lessons on pass rate, recovery velocity, harmful outcomes,
   and selection regret.
5. **Do not implement a lesson DAG yet.** First define typed nodes and edge
   semantics, then show that an ordering filter improves selection over the
   existing failure-class plus Thompson baseline.
6. **If contradiction cycles become operationally costly, add a constraint
   graph.** Quarantine or weaken the least-supported claim in a cycle rather than
   forcing global consistency from model prose. This is a future experiment, not
   a conclusion established by the paper.

## Bottom line

This paper strengthens LYO's core philosophy more than it supplies a ready-made
algorithm. Its durable contribution is epistemic restraint: **an imperfect model
can provide valuable structure if LYO asks for a stable, partial constraint and
keeps the final decision with evidence**. Triplet prompting suggests how to make
those partial constraints more robust through contextual repetition and voting.
The literal causal-order machinery should be adopted only after LYO defines what
its nodes and edges mean and demonstrates that ordering improves downstream
lesson selection.
