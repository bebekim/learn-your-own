# Digest — Buesing et al., "Woulda, Coulda, Shoulda: Counterfactually-Guided Policy Search" (DeepMind, arXiv:1811.06272)

Read for LYO counterfactual credit-assignment design. Source text loses subscripts/math in extraction; equations reconstructed in LaTeX and cross-checked against surrounding prose. Page anchors = PDF page numbers embedded in the text. Notation below: `p` = true environment, `p̃` = model (the paper distinguishes these by font; extraction flattens it).

## 1. Problem formulation — what is credited to what

**Setting (§2, p.2).** Episodic POMDP: states $S_t$, actions $A_t$, observations $O_t$ ($O_t$ includes reward $R_t$), $t = 1..T$. Undiscounted return $G = \sum_{t=1}^T R_t$. Stochastic history-conditioned policies $\pi(a_t \mid h_t)$, $h_t = (o_1, a_1, \dots, a_{t-1}, o_t)$. Trajectories $\tau = (s_1, o_1, a_1, \dots, s_T, o_T) \sim p_\pi$. **Single agent** throughout; no multi-agent structure.

**The credit question.** Not per-action credit within an episode. The problem is *off-policy policy evaluation and improvement*: data $\mathcal{D} = \{\hat{h}^i_T\}_{i=1..N}$ logged under behavior policy $\mu$; determine $E_{p_\pi}[G]$ for a target policy $\pi$ without running it (§3, p.4), then use that to improve $\pi$ (§4, p.7). Credit is assigned to the **policy / choice of action sequence under a fixed latent scenario**: having observed *this* episode under $\mu$, what would the return have been under $\pi$, everything else held equal?

**Pearl rung 3, explicitly.** This is counterfactual in Pearl's sense (abduction–action–prediction, Balke & Pearl 1994), not merely interventional. The paper pointedly disowns propensity-score/IS methods (Bottou et al. 2013; Li et al. 2015; Swaminathan & Joachims 2015; §5, p.9): "Although these algorithms are also termed counterfactual policy evaluation, they are not counterfactual in the sense used in this paper, where noise variables are inferred from logged data and reused to evaluate counterfactual actions." Rung-2 methods re-weight population data; rung-3 methods reason about *this specific episode*: same latent world, different actions.

**Woulda/coulda/shoulda (§1, p.1–2).** Narrative decomposition, not a formal tripartite one. Alice joined $a_1$ over $a_2$. *Woulda*: "what would have happened had she joined $a_2$" = counterfactual outcome prediction → CF-PE. *Coulda/shoulda*: "she could and should have known that $a_2$ was a better choice, had she only interpreted the cues during the interview correctly" = hindsight re-evaluation of the decision rule → CF-GPS policy improvement. The title maps onto the two algorithms: evaluate counterfactual actions (woulda), then change the policy so the better action is taken in similar scenarios (coulda/shoulda).

## 2. The mechanism

**SCM (Def 1, §2.1, p.2).** DAG $\mathcal{G}$ over $X = (X_1,\dots,X_N)$; independent exogenous noise RVs $U = (U_1,\dots,U_N)$ with distributions $P_{U_i}$ — called **scenarios**, summarizing "all aspects of the environment that cannot be influenced by the agent"; deterministic **causal mechanisms** $X_i = f_i(\mathrm{pa}_i, U_i)$. All stochasticity is pushed into root noise nodes.

**POMDP as SCM (§2.1, p.3; Fig 1, p.3).** Reparameterize every conditional as a deterministic function with fresh independent noise:
$$S_{t+1} = f_{st}(S_t, A_t, U_{st}), \qquad A_t = f_\pi(H_t, U_{at}), \qquad S_1 = U_{s_1}$$
Always possible via auto-regressive uniformization (Lemma 2, App B, p.13): $X'_n := F^{-1}_{n \mid X_{<n}}(U_n)$ with $U_n \sim \mathrm{Uniform}[0,1]$ — the inverse-CDF / reparameterization trick. A policy swap is an **intervention** $I(\pi \to \mu)$: replace $A_t = f_\pi(H_t, U_{at})$ by $A_t = f_\mu(H_t, U_{at})$. Def 2 (p.3) is broad: interventions may replace mechanisms arbitrarily, covering **stochastic interventions / mechanism changes** (Korb et al. 2004) — relevant for LYO since lesson injection is stochastic.

**CFI = abduction–action–prediction (§2.2, p.3–4).** Query = triple $(\hat{x}_o, I, X_q)$: observations, intervention, query variables.
1. **Abduction**: compute the noise posterior $p(U \mid \hat{x}_o)$, replace prior $p(U)$ with it → SCM $M_{\hat{x}_o}$.
2. **Action**: apply intervention $I$ → $M_{\hat{x}_o}^{do(I)}$.
3. **Prediction**: return marginal $p^{do(I)\mid \hat{x}_o}(x_q)$.

Sample-based CFI (Alg 1, p.5): $\hat{u} \sim p(u \mid \hat{x}_o)$; set $p(u) \leftarrow \delta(u - \hat{u})$; $f_i \leftarrow f_i^I$; simulate $x_q$.

**Key formal results.**
- **Lemma 1 (CFI for simulation, p.4; proof App A, p.13):**
$$E_{\hat{x}_o \sim p}\left[\, p^{do(I)\mid \hat{x}_o}(x) \,\right] = p^{do(I)}(x)$$
Averaging episode-conditioned counterfactuals over logged episodes recovers the interventional distribution. Proof hinges on noise being root nodes: $p^{do(I)}(u) = p(u)$ — interventions cannot shift the scenario distribution. **This invariance is the litmus test for any lift estimator.**
- **Corollary 1 (mixed CF/prior simulation, p.4):** split $U = U_{CF} \cup U_{Prior}$; sample $u_{CF} \sim p(u_{CF} \mid \hat{x}_o)$ from the posterior, $u_{Prior}$ from the prior, simulate with $u = u_{CF} \cup u_{Prior}$. Used to **hold scenario noise fixed from data while re-sampling action noise $U_{at}$** — fresh exploration under the counterfactual policy (§3.1, p.5). Caveat noted: posterior noise variables are no longer mutually independent.

**Alice example as contextual bandit (Fig 1 left, p.3; §2.1–2.2).** Context $U_c$, action $A = f_\pi(U_c, U_a)$, outcome $O = f_o(A, U_c, U_o)$. Given observed $(\hat{u}_c, \hat{a} = a_1, \hat{o})$, infer $u_o \sim p(u_o \mid a_1, \hat{u}_c, \hat{o})$ (abduction over the companies' latent properties), then evaluate $f_o(a_2, \hat{u}_c, u_o)$ — counterfactual outcome for the *same* scenario $u_o$. Impossible if one models only the conditional $P_{O \mid A, U_c}$. This bandit fragment is the closest formal object in the paper to LYO's setting.

**CF-PE (§3.1, p.5–6; Alg 1).** $g_i = \mathrm{CFI}(\hat{h}^i_T, M, I(\mu \to \pi), G)$; estimate $\frac{1}{N}\sum_i g_i$. **Corollary 2: unbiased under no model mismatch.** Contrasts: IS, $\sum_i w_i \hat{G}_i$, $w_i \propto p_\pi(\hat{h}^i_T)/p_\mu(\hat{h}^i_T)$ — high variance, dead without support overlap; MB-PE, $E_{\tilde{p}_\pi}[G]$ on prior-sampled scenarios — inherits all bias of the learned noise prior $\tilde{p}(U)$.

**Why CF-PE de-biases (§3.1, p.5–6).** The posterior mixture $N^{-1}\sum_i \tilde{p}_\mu(U \mid \hat{h}^i_T)$ is "semi-nonparametric" and "has access to strictly more information than the prior $p(U)$"; it winnows regions of $U$'s domain with no real-data mass. CF-PE beats MB-PE precisely when **transition/reward kernels are accurate but the noise marginal $p(U)$ is hard to model** — their PO-SOKOBAN case: solvable levels satisfy global combinatorial constraints a parametric prior cannot capture, so prior samples are often unsolvable/ill-formed.

**CF-GPS (§4, p.7–8; Alg 1).** Base algorithm MB-PS: return-weighted regression motivated by RL-as-variational-inference (Toussaint 2009),
$$\pi_{k+1} = \arg\max_\pi \int \exp(G(\tau))\, \tilde{p}_{\pi_k}(\tau) \log p_\pi(\tau)\, d\tau$$
equivalent to minimizing KL to the trajectory distribution $\propto \exp(G)\,\tilde{p}_{\pi_k}$. With planner/proposal $\lambda$, the finite-sample objective (eqn. 1, p.7):
$$\pi_{k+1} = \arg\max_\pi \sum_{i=1}^N \frac{\tilde{p}_{\pi_k}(\tau_i)}{\tilde{p}_\lambda(\tau_i)} \exp(G_i(\tau_i)) \log p_\pi(\tau_i), \qquad \tau_i \sim \tilde{p}_\lambda$$
CF-GPS changes only **where the $\tau_i$ come from**: instead of prior rollouts, $\tau_i = \mathrm{CFI}(\hat{h}^i_T, M, I(\mu \to \lambda), \mathcal{T})$ — counterfactual rollouts under the planner, with scenarios inferred in hindsight from replay-buffer episodes. Unbiased via Lemma 1 under no model mismatch.

**Unifications (§5, p.9–10).**
- **GPS**: fully observed MDP, $S_{t+1} = f_s(S_t, A_t, U_{st})$ linear in $(S_t, A_t)$ with coefficients $U_{st} \sim$ iid Gaussian mixture, quadratic reward → abduction from observed state pairs $(\hat{s}_t, \hat{s}_{t+1})$ yields time-varying LQR; with DP planner, **CF-GPS ≡ Guided Policy Search** (Obs 1–2). GPS's empirical success = evidence that grounding rollouts in inferred scenarios massively improves prior-sample MB-PS.
- **SVG**: reparameterized model+policy *is* an SCM; inferring $U_{st}$ from $(\hat{s}_t, \hat{s}_{t+1})$ while freezing $U_{at}$ = abduction; SVG gradients $\partial G / \partial \theta$ ≈ $2\dim(\theta)$ counterfactual evaluations of perturbed policies $\pi(\theta \pm \Delta\theta_i)$.
- **HER** (Andrychowicz et al. 2017) is complementary: HER fixes the observed outcome and searches over goals; CF-GPS fixes the scenario and searches over alternative outcomes/actions.

## 3. Assumptions (what must be true)

From §3.1, §4.2, §6 (p.10):
1. **Off-policy data from the true environment exists** and $\hat{h} \sim p$ — Lemma 1 requires the conditioning data to come from the same environment being reasoned about.
2. **Mechanisms are trustworthy**: transition/reward kernels $f_{st}$ given noise are accurate/"easy to model"; only the noise marginal $p(U)$ is hard. In experiments the ground-truth kernels are *given*; only $p(U_{s_1})$ and $p(U_{s_1}\mid \hat{h})$ are learned.
3. **No hidden confounders** (§6 verbatim): "we assumed that there are no additional hidden confounders in the environment." Every relevant latent factor must be a noise node in the model.
4. **Determinism given noise**: mechanisms deterministic; stochasticity lives entirely in exogenous $U$. Full state observability NOT required (POMDP is the point), but —
5. **Noise posterior must be inferable** (§6): "Probably the most restrictive assumption is that we require the inference over the noise $U$ given data $\hat{h}_T$ to be sufficiently accurate." Learned with privileged information (true states at train time); open problem without it.
6. **Prior noise independence + intervention invariance** (root nodes): the load-bearing premise of Lemma 1.
7. **Unbiasedness only under no model mismatch** ($\tilde{p}_\mu = p_\mu$); otherwise CF is a bias-*reduction* device, not an unbiased estimator.
8. **Assumption trade vs. IS**: CF-GPS swaps IS's overlap requirement ($\mathrm{supp}\, p_\mu \supseteq \mathrm{supp}\, p_\pi$) for model+inference accuracy. IS failed in their env (relative error > 0.8 for all policies, §3.2, p.7).

## 4. The estimator / algorithm — precisely what is computed

- **CF-PE estimator**: $\hat{G}_{CF} = \frac{1}{N}\sum_{i=1}^N g_i$, $g_i$ = return of one counterfactual rollout with $\hat{u}^i \sim \tilde{p}(u \mid \hat{h}^i_T)$ per logged episode (Alg 1 lines 7–13, p.5).
- **CF-GPS objective**: eqn. 1 above with $\tau_i$ drawn from the counterfactual distribution $\tilde{p}_{\lambda \mid \hat{h}^i_T}$ instead of the prior $\tilde{p}_\lambda$ (Alg 1 lines 14–25).
- **Training loop (§4.3, p.8)**: 64 actors run behavior $\mu$ (a slightly stale copy of $\pi$ → genuinely off-policy) in the true env. Per logged episode: infer scenario posterior $\tilde{p}(U_{s_1} \mid \hat{h}_T)$ (DRAW generative model over the initial grid conditioned on a backward-RNN summary of the observation history; App C, p.14), sample **one** scenario, simulate **10** counterfactual trajectories under planner $\lambda = \beta\lambda_e + (1-\beta)\pi$ ($\lambda_e$ = pretrained expert; $\beta$ decays exponentially, time constant $10^5$ episodes). Learner updates $\pi$ on those rollouts via eqn. 1. Model trained online. Baselines compared: MB-PS (unconditional prior $\tilde{p}(U_{s_1}\mid\emptyset)$) and "GPS-like" ($\tilde{p}(U_{s_1}\mid o_1)$, first observation only — filtering, no hindsight). CF-GPS wins (Fig 2 right, p.7); PE error decreases monotonically in amount of conditioning data $t \in \{0,5,\dots,50\}$ (Fig 2 left).
- **Variance/bias devices** (no explicit baseline anywhere in the paper):
  (i) **posterior anchoring** itself — bias reduction by winnowing $U$'s domain;
  (ii) **scenario pairing** — all counterfactual rollouts of an episode share $\hat{u}$, so action comparisons hold the world fixed = *common random numbers*;
  (iii) **Corollary-1 mixed sampling** — re-draw action noise $U_{at}$ for exploration while keeping scenario noise;
  (iv) **10 rollouts per scenario**, averaged;
  (v) **per-trajectory importance ratio** $\tilde{p}_{\pi_k}(\tau_i)/\tilde{p}_\lambda(\tau_i)$ correcting planner↔policy mismatch inside eqn. 1;
  (vi) $\exp(G)$ return weighting (RL-as-inference);
  (vii) planner mixture decaying to $\pi$ — expert grounding early, on-policy late; doubles as an exploration/support device.

## 5. Failure modes & limitations the authors note

1. **No off-policy data → method inapplicable** (§6): fall back to pure simulation.
2. **Mechanism bias propagates directly** (§6): CF reasoning de-biases only the noise marginal; if kernels $f$ are wrong, counterfactual predictions are wrong. "If, however, we can trust the transition and reward kernels… we can substantially improve model-based RL" — the conditional is doing the work.
3. **Hidden confounders break noise-posterior inference silently** (§6).
4. **Misattribution from imperfect scenario inference** (§6, the central warning): "imperfect inference over the scenario $U$ could result e.g. in wrongly attributing a negative outcome to the agent's actions, instead [of] environment factors. This could in turn result in too optimistic predictions for counterfactual actions."
5. **Privileged information needed to learn the abduction model** (§6); open whether strong SCMs are learnable without it.
6. **The abduction model itself under-fits** (App D, p.14–15): unconditional model ($t{=}0$) puts prior mass where no real data lives and misses data structure entirely; filtering ($t{=}1$) better; smoothing ($t{=}50$) nearly exact — with a full episode observed, the belief state collapses to a point mass. Abduction quality scales monotonically with logged context: **conditioning data fixes what parametric capacity cannot.**
7. **IS alternative fails outright under policy mismatch** (§3.2): justifies the model-based route, but binds CF validity to model quality.
8. **Compounding rollout error not analyzed** — sidestepped by deterministic kernels + 50-step rollouts; PE error visibly grows as conditioning $t$ shrinks (Fig 2 left). §4.1 notes no significant difference between full-episode model rollouts and rollouts branched from real visited states.

## 6. Transfer analysis → LYO

**Mapping.** Episode $\hat{h}_T$ ↔ run (replayable event log). Behavior policy $\mu$ ↔ executor-as-actually-run (LLM + whatever guidance was injected, logged). Target/planner ↔ retry policy with lesson $\ell$ injected. **Scenario $U$ ↔ everything LYO doesn't control**: task identity & latent difficulty, failure_class, executor model/version, sampling seeds, tool/env state. Mechanisms $f$ ↔ the executor's unknown transition (context, guidance) → (output, validation). $G$ ↔ binary pass/fail. LYO lacks both $f$ and $p(U)$ — the paper assumes $f$ given and learns only $p(U \mid \hat{h})$. So full CFI is unavailable; but the *pattern* transfers.

**(a) Abduction–action–prediction with latent difficulty as noise.**
- **Abduction**: the observed pre-injection trajectory (cycle-1 failure, error signature, failure_class, task text, retry history) is exactly the evidence that collapses the posterior over latent scenario — PO-SOKOBAN's $t{=}50$ smoothing model is the ideal: enough logged context and $p(U\mid\hat{h}) \to$ point mass. Practical surrogates: (i) stratification/matching on (failure_class, task family, cycle index); (ii) a parametric response surface as mechanism-substitute, e.g. IRT-flavored logistic SCM:
$$\mathrm{logit}\, P(\text{pass} \mid \text{run } j, \text{ lesson } \ell) = \alpha_j + \delta_\ell \cdot \mathbb{1}[\ell \text{ injected}] + (\text{cycle terms})$$
where $\alpha_j$ is the abduced per-scenario difficulty and $\delta_\ell$ the lesson effect. Evaluating the fitted model at do($\ell$) vs do($\emptyset$) **with $\alpha_j$ held fixed IS the counterfactual query** — the fitted model plays the role $f$ plays in the paper.
- **Action**: lesson injection is already a stochastic intervention — Def 2 explicitly covers mechanism changes (Korb et al.). Thompson selection with logged propensity = a well-defined stochastic intervention.
- **Prediction**: executor replay is **not** the counterfactual unless scenario noise is held fixed. Naive replay re-samples $U$ from the prior → that is MB-PE, inheriting exactly the bias the paper diagnoses. Hold fixed what you can (same task, same model version, fixed seed/temperature, same context snapshot); re-sample freely what corresponds to action noise (LLM sampling = $U_{at}$, per Corollary 1 the legitimate "prior" part). Given executor nondeterminism, prefer the parametric-mechanism route for routine credit; reserve replay for cases with determinism controls.

**(b) Verdict on the naive difference-in-rates lift** (design §5.3: $\mathrm{lift}_\ell = \bar{p}(\text{pass}\mid\text{with }\ell) - \bar{p}(\text{pass}\mid\text{without }\ell, \text{same class})$). Four specific warnings:
1. **Confounding by scenario mix.** Lemma 1 works because $p^{do(I)}(u) = p(u)$: the intervention must not shift the scenario distribution. Difference-in-rates identifies $E[G\mid do(\ell)]$ only if with-$\ell$ and without-$\ell$ groups have the same $U$-distribution within the stratifier. Thompson injection is history-dependent — if $\ell$ is preferentially injected into harder-looking failures or later cycles, $\mathrm{lift}_\ell$ is biased (Simpson). The §6 misattribution line applies verbatim: imperfect scenario control attributes environment effects to actions.
2. **Use the logged propensities.** The paper's IS critique is about *variance*, not validity — with propensities, IPW-correct the group means ($w_i = 1/e_i$ treated, $1/(1-e_i)$ control), or go doubly robust (they cite Jiang & Li 2015, "Doubly robust off-policy value evaluation" — AIPW: consistent if either propensity or outcome model is right). **Schema gap found**: `sampled_score` stores the Thompson *draw* $\theta$, not the *selection probability*. Propensity $= P(\ell \text{ top-ranked} \mid \text{candidate set}, \{(\alpha,\beta)\} \text{ at time } t)$; Beta posteriors evolve → $\mu$ is non-stationary. Log per application: candidate set, each candidate's $(\alpha, \beta)$, and $P(\text{select}\ \ell)$ (Monte-Carlo or stored). Without this, IPW/DR is impossible retroactively.
3. **Variance reduction that survives translation**: (i) **pairing / common random numbers** — compare lessons *within* scenario (same task retried, or failure_class × cycle-index strata), then average per-stratum differences; the paper has no baseline *because* scenario pairing plays that role — yours is the statistical version: per-receipt residual $y_i - \bar{y}_{\text{control}}(\text{stratum})$ (regression adjustment / control variate); (ii) **cluster by run** — receipts within a run share $U$, and Corollary 1 warns posterior noise is *not independent*: aggregate per-run first, then across runs; Wilson intervals on cluster-aggregated $n$, else $n$ is inflated; (iii) **multiple rollouts per scenario** — repeated attempts per task before judging.
4. **Positivity / support.** IS died in their env for lack of overlap; same for LYO: if Thompson stops injecting $\ell$ into some stratum, lift there is *unidentified*, not just noisy. The design's "candidates stay retrievable" rule and the planner mixture $\lambda = \beta\lambda_e + (1-\beta)\pi$ are the same device: maintain an exploration floor so $do(\ell)$ keeps support wherever you want credit. Never let a promotion gate drive any propensity to zero.

**(c) Per-cycle (within-run) credit.** The paper's own framing supplies the answer: the Alice fragment is a **contextual bandit** (Fig 1 left: $O = f_o(A, U_c, U_o)$) — a one-step SCM where counterfactual credit to a single action is exactly CFI. Treat each cycle as a bandit step: context = (failure_class, error signature, cycle index, transcript summary) = the abduced scenario *at that step*; action = injected lesson set; reward = next `VALIDATION_RESULT`. MDP-level justification: their return decomposes per step ($G = \sum R_t$; in PO-SOKOBAN the +1 lands on the step a box reaches a target — credit attaches where reward lands), and the GPS/SVG observations show per-timestep abduction (infer $U_{st}$ from $(\hat{s}_t, \hat{s}_{t+1})$) gives per-step grounding. The richer the per-cycle log, the closer $p(U\mid\hat{h})$ is to a point mass — App D's core empirical lesson. Three caveats they'd add:
1. **Within-run correlation / carryover**: cycles share $U$; a run passing at cycle 3 after injections at 1–3 credits the *passing* cycle's injection under the bandit reading, but earlier injections shaped cycle 3's context. If carryover matters, define the estimand at run level with the *sequence* of injections as intervention (their whole-trajectory CFI), and per-cycle credit requires an additive-effects assumption — cf. the Abbeel et al. (2006) lineage they cite: de-biasing weak models with *additive correction terms estimated per individual trajectory*.
2. **Joint injections** (top 1–2 lessons) are one intervention on a *set*; crediting individual lessons from pair injections needs an additive model or unconfounded solo samples. Keep solo-injection probability > 0 to identify main effects. (Design §8's deferred "cross-lesson interaction" is exactly this.)
3. **Cycle index is part of the scenario**: later cycles carry strictly more context (their $t \to 50$). Pool credit across cycles only after stratifying/modeling cycle index, else later-cycle lessons look better or worse for purely positional reasons.

**Does not transfer**: reparameterized gradients (SVG), LQR equivalence, $\exp(G)$ return-weighted regression — all need differentiability or a trusted dynamics model. **Transfers intact**: rung-3 framing (condition on the episode, hold the scenario, vary the action); Lemma 1's $p^{do(I)}(u) = p(u)$ as the litmus test for any lift estimator; posterior-over-scenario as strictly-more-informative-than-prior (ground every estimate in the specific run's data, never global averages); mixed posterior/prior sampling (hold scenario, randomize action noise); App D's lesson that abduction quality scales with logged context — **invest in log richness (validator output, transcripts, seeds, model version): the cheapest accuracy lever available.**

**Concrete design deltas this paper argues for:**
1. Receipts: log candidate set + Beta $(\alpha,\beta)$ per candidate + $P(\text{select}\ \ell)$ at injection time (propensity, not just the $\theta$ draw); plus cycle index, executor model/version, seed/temperature.
2. Keep raw Beta counts for the *bandit policy* (a decision rule, not an estimator); gate promotion on propensity-adjusted (IPW/AIPW) or stratified/matched lift, clustered by run.
3. Define the estimand explicitly: per-cycle bandit credit (next-validation reward) primary; run-level sequence-of-injections secondary when carryover matters.
4. Treat executor replay as prior sampling unless scenario controls are enforced; prefer the fitted response-surface counterfactual for routine credit.
5. Maintain an exploration floor (never zero propensity for candidates) — identification, not just bandit hygiene.
6. Expect §6's misattribution failure — outcomes blamed on the lesson that belong to the scenario, and vice versa — as the dominant bias. The guard is abduction quality (stratification + rich logs), not more receipts.
