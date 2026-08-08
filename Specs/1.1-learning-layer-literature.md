# LYO Learning Layer — Literature Review for the Missing Design

Gathered: 2026-07-18. Scope: literature for turning LYO from middleware into a learning
system (durable lesson library, cross-run recall, explanation extraction, hypothesis
ranking, semantic retrieval, A/B intervention testing, retention-if-useful).

## 0. The frame you already have (and its proper names)

Your stated philosophy:

```
association = hypothesis generation
learning    = explanation + intervention + feedback
```

This is, almost verbatim, two well-known formalisms:

1. **Pearl's ladder of causation** — rung 1 association (seeing), rung 2 intervention
   (doing), rung 3 counterfactual (imagining / "would it have passed without my
   intervention?"). Your "retain lesson only if feedback improves" is a rung-3
   counterfactual attribution question, not a rung-1 correlation.
2. **Peirce's abduction** — "association = hypothesis generation" is inference to the
   best explanation (abduction), the missing inference mode in most agent stacks
   (which do deduction-ish planning and induction-ish clustering, rarely abduction).

So LYO's missing design = an **abduction → intervention → counterfactual retention**
engine sitting over an associational executor. Everything below is organized by which
piece of that engine each work supplies.

***

## 1. Post-Reflexion lineage — your closest neighbors

These systems all do "learn in language space, no weight updates." LYO's
differentiator must be the intervention + counterfactual retention, since they mostly
lack it.

| Work                                                            | What it contributes to LYO                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Link                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **ExpeL** (Zhao et al., AAAI 2024)                              | Experience pool + insight extraction from success/failure **pairs**; insight voting (ADD/EDIT/UPVOTE/DOWNVOTE, importance counter → prune at 0). The fail/success pair comparison is your "explanation extraction" done crudely; the voting counter is a proto retention mechanism.                                                                                                                                                                                                | <https://arxiv.org/abs/2308.10144> |
| **Agent Workflow Memory (AWM)** (Wang, Mao, Fried, Neubig 2024) | Induces reusable *workflows* from trajectories, offline or **online from test queries on the fly**; workflows compose into larger routines ("snowball effect"). Your lesson library could store procedural lessons, not just verbal ones.                                                                                                                                                                                                                                          | <https://arxiv.org/abs/2409.07429> |
| **Dynamic Cheatsheet** (Suzgun et al. 2025)                     | Persistent self-curated memory at inference; decides what to store/discard/refine after each query; no labels needed. Caveat they found: weak models populate memory with flawed strategies — memory quality is bottlenecked by the generator.                                                                                                                                                                                                                                     | <https://arxiv.org/abs/2504.07952> |
| **ACE — Agentic Context Engineering** (Zhang et al., Oct 2025)  | **The most important recent paper for LYO.** Treats context as an evolving playbook of itemized "bullets" with helpful/harmful counters; Generator/Reflector/Curator roles; **incremental delta updates** (no monolithic rewrites) to prevent two named failure modes: *brevity bias* (lessons get over-compressed and lose the operational detail) and *context collapse* (iterative rewriting erodes the library). Learns from execution feedback alone, no ground-truth labels. | <https://arxiv.org/abs/2510.04618> |
| **SkillWeaver** (Zheng et al. 2025)                             | Agents self-improve by distilling practice trajectories into **skills as APIs** (code, not prose), then *honing* them with auto-generated test cases. "Skill honing" = retention gated by executable tests — a concrete version of "retain only if useful."                                                                                                                                                                                                                        | <https://arxiv.org/abs/2504.07079> |
| **LATS** (Zhou et al., ICML 2024)                               | MCTS over reasoning+acting traces with **environment feedback as value signal** and LM-as-optimizer. Template for searching over multiple candidate interventions instead of committing to the first hypothesis.                                                                                                                                                                                                                                                                   | <https://arxiv.org/abs/2310.04406> |

Key lesson from this cluster: everyone clusters/remembers; almost nobody does
**counterfactual attribution of the intervention's effect**. That is LYO's open lane.

***

## 2. Memory architecture frames

* **CoALA — Cognitive Architectures for Language Agents** (Sumers, Yao, Narasimhan,
  Griffiths 2023). The canonical taxonomy: working / episodic / semantic / procedural
  memory + internal actions (retrieval, reasoning, **learning = writes to long-term
  memory**) + decision cycle. LYO's missing pieces map exactly onto CoALA's
  "learning actions." <https://arxiv.org/abs/2309.02427>

* **A-MEM — Agentic Memory** (Xu et al., NeurIPS 2025). Zettelkasten-style memory:
  each memory is a note with LLM-generated context/keywords/tags, dynamically **linked**
  to similar past notes, and old notes **evolve** when new ones arrive. This is your
  "association" substrate — and it's exactly the "cluster similar events" behavior you
  said is not enough. A-MEM is the ceiling of pure association; LYO needs to add the
  explanation/intervention/counterfactual layers on top. <https://arxiv.org/abs/2502.12110>

* **Episodic control lineage** (RL): Model-Free Episodic Control (Blundell et al. 2016,
  <https://arxiv.org/abs/1606.04460>) and Neural Episodic Control (Pritzel et al., ICML
  2017\). Fast, non-parametric, one-shot learning: store (state → best outcome), act by
  kNN lookup. Proof that a dumb table + good retrieval + "keep the best-seen outcome"
  already beats slow parametric learning early on. Your lesson library is this table;
  the interesting part is what replaces "max return" as the stored value (see §5:
  counterfactual contribution).

* Surveys to mine for gaps: **A Comprehensive Survey of Self-Evolving AI Agents**
  (Fang et al. 2025, <https://arxiv.org/abs/2508.07407>), **A Survey of Self-evolving
  Agents** (Gao et al. 2025, <https://arxiv.org/abs/2507.21046>), **Lifelong Learning of
  LLM-based Agents: A Roadmap** (Zheng et al. 2025,
  <https://arxiv.org/abs/2501.07278>).

* **Darwin-Gödel Machine** (Zhang et al. 2025, Sakana/UBC) — open-ended archive of
  self-modifying agents, keep-and-mutate what empirically works (SWE-bench 20%→50%).
  The *archive* idea transfers to lessons: keep a diverse lesson population, not a
  single consensus summary. Successor work ("Hyperagents", Zhang et al. 2026,
  <https://arxiv.org/abs/2603.19461>) makes the improvement operator itself editable —
  meta-level: LYO improving how LYO extracts lessons.

***

## 3. The classical ancestors (read these — CBR didn't start in 1994)

The Aamodt & Plaza paper you have is the CBR reference, but the deeper lineage is:

* **Schank, "Dynamic Memory" (1982)** — the original theory of **failure-driven
  learning**: expectations fail → the failure triggers reminding of similar past
  failures → memory reorganizes around the failure ("indexing by expectation
  failure"). Your design *is* Schank's loop; his vocabulary (scripts, MOPs, failure
  indexing) is still the sharpest language for lesson schemas.

* **SOAR chunking** (Laird, Newell, Rosenbloom, "SOAR: An Architecture for General
  Intelligence," Artificial Intelligence 1987) — when problem solving hits an
  **impasse**, the system resolves it in a subgoal, then *chunks* the resolution into a
  production rule so the impasse never recurs. Impasse → subgoal → chunk ≈ your
  validation-rejected → guidance → lesson. The key extra: SOAR chunks are *compiled to
  executable form*, like SkillWeaver's APIs — lessons as procedures, not prose.

* **Explanation-Based Learning** (DeJong & Mooney 1986; Mitchell, Keller &
  Kedar-Cabelli, "Explanation-Based Generalization: A Unifying View," ML Journal 1986)
  — learn a general rule from a **single** example by explaining *why* it worked/failed
  against a domain theory. This is the formal ancestor of "explanation extraction" and
  the reason explanation quality (not retrieval quality) is the real bottleneck.

* **NELL — Never-Ending Learning** (Mitchell et al., CACM 2018) — a system that has
  learned continuously for years; the transferable insight is **coupled learning**:
  many partially-redundant learners constrain each other so errors don't compound and
  drift doesn't pollute the knowledge base. Directly relevant to lesson-library
  pollution (see §7 risks).

***

## 4. Cybernetics (your stated interest) — where it actually plugs in

* **Wiener, "Cybernetics" (1948)** — feedback, error-driven correction. Background.

* **Ashby, "An Introduction to Cybernetics" (1956) — Law of Requisite Variety** — a
  regulator must have at least as much variety as the disturbances it regulates.
  Translation: **LYO's lesson library must cover Zeroshot's failure-mode variety**;
  a small set of generic lessons provably cannot regulate a diverse failure stream.
  This gives you a measurable target: failure-mode entropy vs. lesson coverage.

* **Conant & Ashby, "Every Good Regulator of a System Must be a Model of that
  System" (1970)** — the single most important theoretical anchor for LYO. To
  regulate Zeroshot's runs, LYO must build an internal model of *how Zeroshot fails*.
  Explanation extraction isn't a nice-to-have; by this theorem it's constitutive of
  regulation. Your "explanation" objects = the regulator's model of the system.

* **Beer, Viable System Model ("Brain of the Firm" 1972; "The Heart of Enterprise"
  1979\)** — LYO as System 3\*/4 (audit + adaptation) over Zeroshot's System 1
  operations; clarifies that learning belongs *outside* the execution loop, as a
  metasystem — matches your "Zeroshot owns execution, LYO should not."

* **Active inference / Free Energy Principle** (Friston, "The free-energy principle:
  a unified brain theory?", Nature Reviews Neuroscience 2010; Parr, Pezzulo &
  Friston, "Active Inference" MIT Press 2022) — agents minimize surprise by *acting
  to gather information*; unifies exploration ("which intervention is most
  informative?") and exploitation in one objective (expected free energy). Directly
  applicable to choosing *which* hypothesis to test next — your "A/B intervention
  testing" is active inference's epistemic action selection.

  * LLM-agent instantiations: "Active Inference for Self-Organizing Multi-LLM
    Systems" (2024, <https://arxiv.org/abs/2412.10425>); "On predictive planning and
    counterfactual learning in active inference" (Paul et al., Entropy 2024).

***

## 5. Pearl / causal inference — the retention criterion formalized

* **The Book of Why** (Pearl & Mackenzie 2018) and **Causality** (Pearl 2009):
  the ladder itself, plus the counterfactual three-step — **abduction** (infer the
  latent state from evidence), **action** (do-operator), **prediction** (recompute
  outcome). That *is* your loop: infer the latent failure cause from the trace,
  intervene via guidance, re-observe validation.

* **CLADDER** (Jin et al., NeurIPS 2023 D\&B; code: github.com/causalNLP/cladder):
  LLMs evaluated on all three rungs with formal ground truth — performance *degrades
  as you climb the ladder*. Implication: don't ask the LLM to do raw counterfactual
  reasoning; build scaffolding (structured lesson schemas, counters, estimators) that
  does rung-2/3 bookkeeping *outside* the model.

* **Bottou et al., "Counterfactual Reasoning and Learning Systems: The Example of
  Computational Advertising" (JMLR 2013)** — the foundational "learn from logged
  bandit feedback" paper. Your ledger of (context → intervention → validation) events
  is exactly their setup; this is the math of A/B testing interventions offline.

* **Causal bandits**: Bareinboim, Forney & Pearl, "Bandits with Unobserved
  Confounders" (NeurIPS 2015); Lee & Bareinboim, "Structural Causal Bandits: Where
  to Intervene?" (NeurIPS 2018) — how to choose *which* intervention to try when
  outcomes are confounded. Answers "ranking of hypotheses" with regret bounds.

* **Counterfactual policy evaluation / credit assignment**:

  * Buesing et al., **"Woulda, Coulda, Shoulda: Counterfactually-Guided Policy
    Search"** (ICLR 2019, <https://arxiv.org/abs/1811.06272>) — Pearl's
    abduction→action→prediction turned into an RL algorithm over logged trajectories.
    Closest formal template for "retain lesson if useful": evaluate a candidate
    intervention *counterfactually on your own ledger* before trusting it.

  * Mesnard et al., **"Counterfactual Credit Assignment in Model-Free RL"** (NeurIPS
    2020, <https://arxiv.org/abs/2011.09464>); Harutyunyan et al., "Hindsight Credit
    Assignment" (NeurIPS 2019); "Would I have gotten that reward? Long-term credit
    assignment by counterfactual contribution analysis" (NeurIPS 2023,
    <https://arxiv.org/abs/2306.16803>) — the title question is *literally* your
    retention test.

* Practical synthesis: keep per-lesson **helpful/harmful counters** (ACE) updated by
  validation deltas, and pick which lesson to inject with **Thompson sampling /
  contextual bandits** (explore under-tested lessons, exploit proven ones). That's
  the A/B testing machinery with decades of theory behind it.

***

## 6. Belief propagation — where it fits (and why later)

* Pearl, "Probabilistic Reasoning in Intelligent Systems" (1988); Kschischang, Frey
  & Loeliger, "Factor Graphs and the Sum-Product Algorithm" (IEEE Trans. Inf. Theory
  2001\); Yedidia, Freeman & Weiss, "Understanding Belief Propagation and its
  Generalizations" (2003).

* BP becomes relevant only when lessons **interact** — e.g., two lessons whose
  effects are confounded across runs, forming a dependency graph where confidence
  should propagate. Until then, per-lesson counters + bandit updates are the right
  level of machinery. Same conclusion you already reached for sqlite-vec: add when
  the simple thing provably misses.

***

## 7. The gap that is your opportunity — failure explanation is unsolved

* **TRAIL: Trace Reasoning and Agentic Issue Localization** (Deshpande et al. 2025,
  <https://arxiv.org/abs/2505.08638>) — 148 human-annotated agent traces with a formal
  taxonomy (reasoning / planning / execution errors). **Best frontier model: 11%
  joint accuracy at localizing + categorizing errors.** LLMs are currently *bad* at
  reading a trace and saying what went wrong — i.e., "extract explanation" is the
  least-solved step of your loop. The taxonomy itself is a ready-made failure schema
  to seed your lesson library (e.g., Goal Deviation, Tool Selection Error, Context
  Handling Failure, Task Orchestration Error).

* **Huang et al., "Large Language Models Cannot Self-Correct Reasoning Yet"**
  (ICLR 2024, <https://arxiv.org/abs/2310.01798>) — intrinsic (self-generated) feedback
  doesn't work and can degrade performance; external/environment-grounded feedback
  does. This is the scientific justification for your critique of Self-Refine and for
  routing LYO's feedback through Zeroshot's VALIDATION\_RESULT rather than self-critique.
  Follow-up: Kamoi et al., "When Can LLMs Actually Correct Their Own Mistakes? A
  Critical Survey" (TACL 2024).

* **Risks of self-evolving memory** (read before shipping retention):

  * "Your Agent May Misevolve: Emergent Risks in Self-evolving LLM Agents" (2025,
    <https://arxiv.org/abs/2509.26354>).

  * "OEP: Poisoning Self-Evolving LLM Agents via Locally Correct but
    Non-Transferable Experiences" (2026, <https://arxiv.org/abs/2605.18930>) — lessons
    that are locally correct but don't transfer are a *pollution attack*; motivates
    counter-based demotion and quarantine, not binary keep/drop.

***

## 8. Hypothesis generation & ranking machinery

* **AI co-scientist** (Gottweis et al., "Towards an AI co-scientist," Google 2025;
  Nature version 2026) — Generation → Reflection → **Elo-rated tournament of
  pairwise debates** → Evolution → Meta-review, with a Proximity agent for
  de-duplication. This is the most complete published template for "rank hypotheses":
  pairwise comparison scales better than absolute scoring, and the tournament
  structure forces competition rather than accumulation.

* **In-context learning as implicit Bayesian inference** (Xie et al., ICLR 2022;
  Zhang et al., "What and How Does In-Context Learning Learn? Bayesian Model
  Averaging" 2023; Ahuja, Panwar & Goyal, "In-Context Learning through the Bayesian
  Prism," ICLR 2024) — retrieved lessons function as **evidence that shifts the
  posterior over the latent task concept**. Gives a principled account of *why*
  cross-run recall works and predicts failure when lessons point at the wrong
  concept (mis-retrieval → wrong posterior). Related: Pan et al. 2023, task
  recognition vs. task learning — most of what lessons do is bias *recognition* of
  which task this is, which is exactly "association = hypothesis generation."

* Abductive NLI lineage: αNLI (Bhagavatula et al., ICLR 2020) — benchmarks for
  inference-to-best-explanation in language models.

***

## 9. Synthesis — three candidate breakthrough theses for LYO

1. **Lesson schema as a causal object.** A lesson is not a tip; it's
   `(failure schema [TRAIL taxonomy], abduced explanation, intervention spec,
   helpful/harmful counters, provenance run-ids)`. CBR supplies the case structure,
   EBL the explanation, ACE the delta bookkeeping, Pearl the semantics.
2. **Retention as counterfactual credit assignment, not storage policy.** "Retain if
   useful" = estimate the counterfactual "would this run have passed without the
   lesson?" via paired outcomes on the ledger (Bottou 2013; CF-GPS 2019; CCA 2020);
   update counters; select injections via Thompson sampling. This is the piece none
   of ExpeL/AWM/ACE/A-MEM have — it is the defensible novelty.
3. **The bottleneck is abduction, not retrieval.** TRAIL's 11% says even frontier
   models can't localize why a run failed. Conant–Ashby says the regulator is its
   model of the system. Therefore LYO's core asset to build is a **failure-model of
   Zeroshot** (taxonomy + explanation extraction + which interventions fix which
   failure classes), and everything else (retrieval, ranking, library) is commodity
   scaffolding around it. Ashby adds the coverage metric: lesson variety ≥ failure
   variety.

## Suggested reading order (10 papers, \~2 weekends)

1. ACE (2510.04618) — retention mechanics
2. ExpeL (2308.10144) — pair-based explanation + insight voting
3. TRAIL (2505.08638) — failure taxonomy + the explanation gap
4. Bottou et al. 2013 (JMLR) — counterfactual learning systems
5. Woulda, Coulda, Shoulda (1811.06272) — abduction→intervention→prediction as algorithm
6. CoALA (2309.02427) — architecture frame
7. A-MEM (2502.12110) — associative memory ceiling
8. Conant & Ashby 1970 + Ashby 1956 (requisite variety chapters) — why LYO must model Zeroshot
9. AI co-scientist (Gottweis et al. 2025) — hypothesis tournaments
10. Schank, Dynamic Memory (1982) — failure-driven learning, the soul of the design

***

## Appendix A — The Mathematics of Brevity Bias and Context Collapse

Why LLM-driven context rewriting converges to short, generic text, and why iterative
rewriting guarantees information loss. (Companion to ACE §2.2, arXiv:2510.04618.)

### A.1 Training objective — probability mass follows frequency

$\mathcal{L}(\theta) \;=\; \sum_{t} \log\, p_\theta\!\left(x_t \mid x_{<t}\right)$

The model maximizes the log-probability of each token given its prefix. Probabilities
are produced by a softmax over the model's internal state:

$p_\theta\!\left(x_t \mid x_{<t}\right) \;=\; \mathrm{softmax}\!\left(W \, h_t\right)$

Natural text is Zipfian — the $r$-th most common token has frequency:

$f(r) \;\propto\; r^{-\alpha}, \qquad \alpha \approx 1$

Cross-entropy weights tokens by empirical frequency, so generic phrasings (small $r$)
dominate the learned distribution while domain-specific details live in the long tail.
The model is brevity-biased before any rewriting happens.

### A.2 Decoding is mode-seeking, and the mode is generic

$x^* \;=\; \arg\max_{x}\; \prod_{t}\, p\!\left(x_t \mid x_{<t}\right)$

Keeping a detail multiplies in a small per-token probability, so the argmax sequence
is almost always short, fluent, generic text. Brevity bias is the model correctly
returning the mode of its own distribution.

### A.3 Bayesian shrinkage toward the generic prior

$p(\text{text} \mid \text{instruction}) \;\propto\; \underbrace{p(\text{text})}_{\text{generic prior}} \;\cdot\; \underbrace{p(\text{instruction} \mid \text{text})}_{\text{weak evidence}}$

A vague instruction ("improve this playbook") is weak evidence, so the posterior
shrinks toward the prior mean — generic advice is the minimum-risk output.

RLHF then tilts the distribution toward a reward model that pays for concise, fluent
answers:

$p_{\text{RLHF}}(x) \;\propto\; p_{\text{SFT}}(x)\, \exp\!\left(\frac{r(x)}{\beta}\right)$

Detail-heavy outputs are suppressed exponentially in $1/\beta$ whenever the reward
has no term for "this detail matters at task step 37."

### A.4 Iteration guarantees collapse — data processing inequality

A full-rewrite pipeline is a Markov chain:

$\text{original feedback} \;\longrightarrow\; C_1 \;\longrightarrow\; C_2 \;\longrightarrow\; \cdots \;\longrightarrow\; C_k$

For any Markov chain $X \rightarrow Y \rightarrow Z$, the data processing inequality gives:

$I(X;\, Z) \;\le\; I(X;\, Y)$

Applied to the rewrite chain, information about the original feedback is monotone
non-increasing:

$I(\text{original};\, C_k) \;\le\; I(\text{original};\, C_{k-1}) \;\le\; \cdots \;\le\; I(\text{original};\, C_1)$

A dropped detail can never be recovered by further rewriting. With per-rewrite detail
retention probability $q < 1$, survival decays exponentially:

$P\!\left(\text{detail survives } k \text{ rewrites}\right) \;=\; q^{k} \;\xrightarrow[k \to \infty]{}\; 0$

This is the 18,282 → 122 token cliff (accuracy 66.7 → 57.1) in ACE Figure 2 — not bad
luck, but the fixed point of a contraction operator whose eigen-direction is "short
and generic."

### A.5 The escape: delta updates

ACE severs the Markov chain by editing locally instead of re-encoding globally:

$C_{k+1} \;=\; C_k \;+\; \Delta_k$

Most of $C_k$ passes through untouched, so the DPI never compounds — original
information is preserved by construction. Design rule for LYO's lesson library:
**append and surgically edit itemized lessons; never monolithically rewrite the library.**

***

## Appendix B — Industry signals (products, not papers)

* **Paxel** (Y Combinator experiment, noted 2026-07-22). Ingests Claude Code /
  Codex / Cursor session transcripts, runs LLM-based analysis locally in Docker,
  uploads a small scored payload to YC, and returns a **builder profile**: scores on
  five dimensions (steering, execution, engineering, product instinct, planning),
  archetypes, "decision patterns / signature moves," and a growth edge. Notable as
  market validation that agent-session telemetry is valuable — but the evaluated
  subject is the *human*, distillation is LLM-judged and batch, and the loop closes
  through a report the human reads, not through re-injection into agent behavior.
  LYO contrast: same raw substrate (session telemetry), opposite posture —
  deterministic, fully local, and aimed at changing what the *agent* does next.
  <https://paxel.ycombinator.com/>
