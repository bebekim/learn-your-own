# Timely lesson delivery and feedback: focused literature assessment

Research date: 2026-09-10. Question: what supports an observer that recognizes an appropriate moment, delivers a lesson, measures what happened, and revises the lesson or its applicability? This note extends [the earlier lesson-management assessment](lesson-management-research-2026-09-10.md); it does not claim an exhaustive survey or validate LYO's deployed behavior through literature.

**Assessment:** agent-memory research supplies concrete ways to extract and revise advice. Deciding whether delivering that advice helps in a particular situation additionally requires an intervention design and trustworthy outcome measurement. A successful task and a model's helpfulness vote answer different questions from an estimate of the delivery's effect.

The [user-supplied survey site](https://selfimproving-agent.github.io/#experience-env) is a useful reading map. Its [primary survey, version 1 dated 2026-07-14](https://arxiv.org/html/2607.13104v1), separates improvement of foundation models from their surrounding scaffolding. The most relevant sections are 6.1 on prompts, 6.2.3 on memory processing, 8 on evaluation, and 9.1 on implications for system design. **Our mapping:** LYO improves scaffolding through memory and interventions grounded in environment observations. The survey's grouping identifies related work; the individual studies determine what evidence supports each method.

## Agent-memory precedents

### Reflexion: feedback before another attempt

Reflexion separates an actor, evaluator, and reflection generator. Feedback becomes a short memory included in later trials; the main experiments improve retries of the same problem. In the HumanEval Rust ablation, the full method reaches 68% versus 60% for the base model; reflection without generated tests reaches 52%. The paper also reports misleading self-generated tests and worse-than-baseline MBPP Python performance. These results support combining reflection with grounded checks, while exposing evaluator error as a failure mode. They do not isolate the causal benefit of each reflection or establish cross-repository transfer. [Shinn et al., NeurIPS 2023, sections 3 and 4.3](https://arxiv.org/html/2303.11366v4).

**LYO inference:** use an explanation to propose a checkable candidate, and preserve the observation separately. Calling text a reflection does not validate its diagnosis.

### ExpeL: insights used on new tasks

ExpeL compares successful/failed training trajectories and edits an insight list using model-generated ADD, EDIT, UPVOTE, and DOWNVOTE operations. Importance counters can remove entries. Evaluation inserts the entire insight list and retrieves successful demonstrations by task similarity. Its HotpotQA-to-FEVER experiment adapts insights between tasks sharing a Wikipedia interface, reporting 70% success versus ReAct's 63%. Transfer evidence is bounded by that setting. An ALFWorld ablation favors task-based retrieval over dynamically changing demonstrations using current reasoning similarity; the authors suggest context instability as one possible explanation. The insight counters are model judgments, not experimentally identified per-insight effects. [Zhao et al., AAAI 2024; inspected version 3, sections 4.2–4.4 and 5.4–5.6](https://arxiv.org/html/2308.10144v3).

**LYO inference:** opportunities can recur across new tasks without returning to the original ticket. Treat task similarity as a candidate retrieval signal; establish applicability and usefulness separately. More frequent insertion is itself a policy choice to test.

### ACE: a playbook that changes locally

ACE uses a Generator, Reflector, and Curator to maintain identified bullets through small, deterministically merged updates. The Generator marks bullets useful or misleading; counters guide refinement. Online evaluation predicts each sample before updating context from it. Table 3 reports AppWorld averages of 56.1 for online ACE, 59.5 with offline warmup, and 42.4 for ReAct. The warmup distinction qualifies the earlier note's 59.5 headline. Ablations support incremental updates; continuously adversarial reflection can lower FiNER performance below its baseline. ACE demonstrates system-level adaptation, but its bullet feedback is model-attributed, not a randomized estimate of each lesson's benefit. [Zhang et al., inspected version 3 dated 2026-03-29, sections 3, 4.1, 4.6 and appendix A.4–A.5](https://arxiv.org/html/2510.04618v3).

**LYO inference:** retain lesson IDs, exact delivered versions, and localized revisions. A proposed edit should preserve its evidence trail. A curator's judgment can initiate review without becoming measured causal credit.

### MemRL: learn which memories predict reward

MemRL filters memories by semantic similarity, ranks them using similarity and learned utility, and updates injected memories' utilities from later reward. The language model remains frozen. Its held-out evaluation freezes the memory bank: BigCodeBench scores are 50.8 versus 48.5 without memory. These are transfer results, distinct from cumulative training success. Its theory assumes a frozen policy and stationary distribution; appendices acknowledge unresolved credit assignment among multiple memories and limited transfer at low similarity. [Shengtao Zhang et al., MemRL, inspected version 2, sections 4.1–4.4, 5.2 and appendices G.2–G.3](https://arxiv.org/html/2601.03192v2).

**LYO inference:** expected reward with a memory differs from improvement over no advice. Easier tasks can inflate its apparent value; co-delivered memories can share undeserved credit.

### CTIM-Rover: a useful negative coding result

CTIM-Rover builds memory from 236 successful source trajectories and evaluates 45 held-out SWE-bench Verified tasks. Its reported success rates are 42% for the baseline, 40% with memory plus exemplars, and 31% with memory alone. This small study does not prove memory universally harms coding agents. It does show why a promising architecture or a library of successful examples cannot substitute for testing downstream behavior. [CTIM-Rover, inspected version 1, sections 3–4 and table 1](https://arxiv.org/html/2505.23422v1).

## Literature for the actual delivery decision

### Just-in-time adaptive interventions: specify when and why to act

The JITAI framework makes six elements explicit: a long-term objective, near-term outcomes, decision points, intervention options, tailoring variables, and decision rules. Providing nothing can be a legitimate option. This separates detecting a situation from deciding whether and how to intervene. [Nahum-Shani et al., *Just-in-Time Adaptive Interventions in Mobile Health: Key Components and Design Principles for Ongoing Health Behavior Support*](https://pmc.ncbi.nlm.nih.gov/articles/PMC5364076/).

**LYO inference:** an event-driven hook can implement a decision point. The observation must describe the relevant planned action and current conditions; a repository path or session opening is often insufficient. The chosen lesson and timing should serve a declared observable outcome. This is an adaptation from health-intervention research, not evidence that coding prompts work.

### Micro-randomized trials: learn whether an intervention helped

Micro-randomized trials repeatedly assign optional interventions at eligible moments during ordinary activity. They define a proximal outcome and estimate how effects vary with time and context. Availability must be recorded; repeated observations require longitudinal analysis rather than treating every row as independent. [Klasnja et al., *Micro-randomized trials: An experimental design for developing just-in-time adaptive interventions*, 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4732571/).

**LYO inference:** the next ticket can supply another eligible opportunity. There is no requirement to redo the original ticket, but the opportunities must support the intended comparison. Record context and assignment probability before intervention, including occasions assigned no added lesson. Measure the same predefined outcome in both groups. Do not condition the primary comparison on whether the agent followed the advice; adherence is a later observation and can introduce selection bias. Session clustering, earlier advice carried in context, concurrent interventions, and missing outcomes require explicit treatment.

An eventual adaptive policy has a relevant precedent in action-centered contextual bandits, which distinguish a potentially changing baseline reward from an assumed stationary linear incremental treatment effect and preserve a no-intervention option with bounded assignment probabilities. Those modeling assumptions matter; the paper is not a reason to install a new bandit before obtaining sound outcomes. [Greenewald et al., *Action Centered Contextual Bandits*, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5719505/).

## Implications for the existing LYO boundary

The intended improvement changes the agent's surrounding memory, prompts, selection, and evaluation. It does not require changing foundation-model weights. The distinctions above concern what evidence supports that surrounding system's decisions, regardless of the database used.

The current ordinary-session path has useful parts, but not their complete connection:

| Existing part | Current boundary |
|---|---|
| [Session delivery](../src/lyo/selection/session-hook.ts) | Emits selected context and records delivery. Registered findings still require an opportunity and semantic review. |
| [Finding observation](../src/lyo/interface/session-finding-workflow.ts) | Returns immediately when no finding opportunities exist; it captures and assesses matching registered actions. |
| [Finding evidence](../src/lyo/interface/session-finding-evidence.ts) | Separates applicability, adherence, and deterministic support/contradiction; explicitly returns `incrementalBenefit: 'unknown'`. |

These observations are from the source inspected for this note. The separate native recovery/task-experiment machinery does not make arbitrary finding delivery causally evaluated. This note proposes no new service, framework, database, or code change.

## Smallest complete experiment — design synthesis

Use the existing SQLite records, hooks, and receipts for one optional lesson and one observable class of action. Before the action, retain its context, eligibility, exact lesson version, assignment, and evaluator. Afterward, retain delivery, adherence, proximal outcome, and task acceptance separately. Compare equivalent eligible opportunities with and without the extra guidance, preserving unknown results.

Then make three separate decisions: whether the technical claim survives its checks; whether this delivery changes behavior; and whether the resulting behavior improves the intended outcome. A technical contradiction calls for claim or precondition review. Correct advice with no incremental benefit calls for revising delivery. Benefit within one scope makes broader scope a new hypothesis to test. These are proposed LYO decision boundaries, not guarantees supplied by any cited memory system.

The immediate missing connection is prospective opportunity recognition and evaluation feeding back into delivery. More elaborate memory organization can be deferred until this loop demonstrates a useful result.

## Inspection limits

The agent papers were read beyond their abstracts at the cited methods, results, and ablations. The survey was used for classification and discovery. The JITAI and micro-randomized-trial method passages were inspected through indexed full text because direct PMC opening intermittently returned browser verification. This is a focused assessment as of the stated date; benchmark results neither certify individual lessons nor establish general usefulness in LYO's live sessions.
