# Reading Guide — Causal Discovery Framework Papers

Date: 2026-08-14. Companion to `# Causal Discovery F.txt` (임성빈 교수 강연 → Lyo feature 분해 문서).
All PDFs and extracted full texts live in `papers/`. Page numbers below refer to the PDF page;
text anchors use the extracted `papers/*.txt` files.

**Corrections to the source document:**
- The document's SCORE link (`arxiv 2202.00818`) is wrong — that arXiv ID is an unrelated
  f(R)-gravity paper. The real SCORE paper (Rolland et al., ICML 2022) was downloaded from
  PMLR as `score-rolland22a.pdf`.
- Pearl 1988 and Pearl 2009 are commercial books; not downloaded.

---

## Priority at a glance

| Tier | Paper | Lyo features | Effort |
|------|-------|--------------|--------|
| **Must read** | SciNO (2508.12650) | F1, F5, F6 — the lecture's direct basis | ~10 pp of 36 |
| **Must read** | Causal Order / Vashishtha (2310.15117) | F1, F2 — why ordering, not graphs | ~9 pp of 42 |
| **Must read** | DiffAN (2210.06201) | F2 — ordering from observational data at scale | ~9 pp of 20 |
| Read selectively | SCORE (rolland22a) | F2 — the origin of score-based ordering | ~5 pp of 13 |
| Read selectively | LLM Cannot Discover Causality / Wu (2506.00844) | F1, F6 — the boundary argument | ~8 pp of 26 |
| Read selectively | Integrating LLM / Ban & Chen et al. (2306.16902) | F1, F6 — prior/data balancing mechanism | ~6 pp of 13 |
| Reference | NoGAM / Montagna (montagna23a) | F2 — relaxing Gaussian noise | §3–5 only |
| Reference | Score matching through the roof (2407.18755) | F2 — latent variables, identifiability | skim §1, §4–5 |
| Reference | Sobolev Training (1706.04859) | F5 — "delivery ≠ learning" 수학적 원론 | §2 only |
| Reference | Song & Ermon (1907.05600) | F2/F5 background — what a score model is | §2 only |
| Done | COCOA (longtermcredit) | F3, F4 | see `longtermcredit-digest.md` |
| Done | WCS (wouldacouldashoulda) | F3, F4 | see `wouldacouldashoulda-digest.md` |

**Suggested reading order** (matches the doc's recommended implementation order
F4 → F3 → F2 → F1 → F5 → F6):

1. SciNO §1–2 + §3.3 (the whole framework in miniature)
2. Vashishtha §1–2 + §4.2 (why the LLM output interface must be ordering/prior)
3. DiffAN §1–3 (how ordering is extracted from data)
4. Wu §3–5 (why the LLM must stay non-decisional)
5. SCORE §4 + Sobolev §2 (the math underneath, when implementing F2/F5)

---

## Tier 1 — Must read

### 1. SciNO — Kang et al. 2025 (LG AI Research / Korea Univ.), NeurIPS 2025
`scino-2508.12650.pdf` · `scino-2508.12650.txt` (36 pp)

**What it is.** Ordering-based causal discovery needs the diagonal of the Hessian of the
log-density, `D(x) = diag(H log P)(x)`, to find leaf nodes. Stein/kernel estimators (SCORE,
CaPS) are O(N³) and unstable; diffusion-based estimation (DiffAN) is cheap but its
second-order derivatives are unreliable — a good score approximation `ŝ ≈ s` does **not**
guarantee good derivatives `∇ŝ ≈ ∇s`. SciNO fixes this with a functional diffusion model
(neural operator in smooth function space) that stabilizes both the score and its
derivatives, cutting order divergence 42.7% (synthetic) / 31.5% (real) vs DiffAN. On top,
it adds a **probabilistic controller** that fuses an autoregressive model's prior with
SciNO's data evidence: `P(x_{t+1} | x_{1:t}, stat, context) ∝ P_AR(x_{t+1} | x_{1:t}, context) × P_SciNO(stat | x_{1:t+1})` (Eq. 8).

**Why it matters for Lyo.** This is the lecture's own paper — the direct template for
Feature 1 (π_LLM as prior, not decision-maker), Feature 5 (derivative fidelity:
function-value fit ≠ derivative fit ⇔ "run passed" ≠ "lesson caused the pass"), and
Feature 6 (the `P(D|π)·P_LLM(π|text)` Bayesian fusion controller).

**Read:**
- §1–2 (pp. 1–3) — the whole problem setup; Eq. 1–4 define the Hessian-diagonal leaf
  criterion shared by SCORE/CaPS/DiffAN.
- **§3.3 + Algorithm 1 (pp. 6–7) — the single most important part for Lyo.** The
  prior × evidence fusion (Eq. 8), the two evidence estimators (rank-based Eq. 10,
  confidence-interval-based Eq. 12), and the soft-supervision loop. This is exactly the
  controller Lyo's Feature 6 lacks.
- §4.3 (p. 9) — controlling an LLM for causal ordering: 64% average order-divergence
  reduction, O(|V|²) → O(|V|) query complexity vs pairwise prompting, no fine-tuning.
- §5 (p. 10) — conclusion and limitations.

**Skip unless implementing:** §3.1–3.2 architecture details (LTE, Fourier layers),
appendices A.2 (proofs) and A.4–A.5.

### 2. Causal Order: The Key to Leveraging Imperfect Experts — Vashishtha et al., ICLR 2025
`causal-order-2310.15117.pdf` · `causal-order-2310.15117.txt` (42 pp)

**What it is.** Even a *perfect* expert answering pairwise prompts ("does A cause B?")
produces wrong graphs, because direct vs indirect causation is undecidable from a pair —
but the *causal order* they imply is always correct. With imperfect experts (LLMs),
pairwise prompts also create cycles. Fix: the **triplet method** — query each pair with an
auxiliary third variable, forbid cycles within the triplet, ensemble by voting. Small
models (Phi-3, Llama-3 8B) with triplet prompting beat GPT-4 with pairwise prompting.

**Why it matters for Lyo.** The formal argument for Feature 1's core design rule: use the
LLM for ordering/prior, never for graph/edge decisions. Also defines Dtop (topological
divergence) — a metric Lyo could reuse for ordering quality in Feature 2.

**Read:**
- §1–2 (pp. 1–4) — the perfect-expert impossibility argument; Figures 1–2 are the whole
  intuition in one picture.
- §3.2 (p. 5) — downstream utility: how an order alone reduces graph-discovery and
  effect-inference error (incl. backdoor adjustment from order only).
- **§4.2 (p. 6) — the triplet method itself.** Directly adaptable to how Lyo's judge
  LLM should be queried.
- §5.1–5.2 (pp. 8–9) — results incl. human annotators and downstream tasks.

**Skip:** appendices C (prompt templates, pp. 35–41) unless implementing prompting;
appendix E if not replicating experiments.

### 3. DiffAN — Sanchez et al., ICLR 2023
`diffan-2210.06201.pdf` · `diffan-2210.06201.txt` (20 pp)

**What it is.** First diffusion-model-based causal discovery. Trains one score network
via denoising diffusion, then finds the topological order by iteratively detecting leaves
from the score's Jacobian. Key trick — the **deciduous score**: after removing a leaf,
the new distribution's score is approximated from the original score + its Jacobian, *no
retraining*. Scales to 500 nodes / 100k samples where SCORE dies at 2k samples.

**Why it matters for Lyo.** Feature 2's existence proof: ordering information *is*
extractable from purely observational data, cheaply. Also the baseline SciNO improves on —
reading DiffAN first makes SciNO's contribution (derivative stability) land properly.

**Read:**
- §1–2 (pp. 1–3) — problem setup, why permutation space ≪ DAG space, why kernels don't
  scale. Figure 1 (p. 1) is the scaling argument.
- **§3 (pp. 4–6) — the deciduous score.** The theory for updating the score without
  retraining is the technical heart; this is also where the derivative-fidelity problem
  (Feature 5) originates — residue approximations degrade in high dimensions.
- §5 + §7 (pp. 7–9) — experiments and honest limitations.

**Skip:** §4 (theory proofs), appendix D/E experiment details.

---

## Tier 2 — Read selectively

### 4. SCORE — Rolland et al., ICML 2022
`score-rolland22a.pdf` · `score-rolland22a.txt` (13 pp)

**What it is.** The origin of the whole line: under a nonlinear additive Gaussian noise
model, a leaf node's Hessian diagonal entry is *constant* across samples
(`Var[D_j(x)] = 0` iff j is a leaf). Estimate the score by score matching (second-order
Stein estimator), find leaves, remove, repeat → topological order in time linear in #nodes.

**Why it matters for Lyo.** Feature 2's 원론. Short and clear; read after DiffAN/SciNO
as "where the leaf criterion comes from."

**Read:** §3–4 (pp. 3–5) — preliminaries + §4.1 the leaf-identification theorem and proof
sketch; §4.3 (p. 6) on extending to non-Gaussian noise (bridges to NoGAM).
**Skip:** §4.2 Stein estimator details, experiments.

### 5. LLM Cannot Discover Causality — Wu et al. 2025
`llm-cannot-discover-causality-2506.00844.pdf` · `.txt` (26 pp)

**What it is.** Position paper + experiments: autoregressive, correlation-driven LLMs have
no theoretical grounding for causal decisions; integrating them as priors into causal
discovery algorithms is unreliable; favorable published results are partly an artifact of
prompt engineering that leaks ground truth. Prescription: restrict LLMs to **non-decisional
support** — heuristic search guidance, never existence/directionality decisions.

**Why it matters for Lyo.** The academic backbone of `docs/deterministic-classification.md`
("LLM은 propose, environment는 count"). Also a caution for Feature 6: even SciNO's fusion
keeps the final decision with the data evidence — Wu explains why that boundary must hold.

**Read:** §3–4 (pp. 3–7) — the critique, incl. Figure 1's map of the argument; **§5
(pp. 7–8) — the functional-boundary definition + the LLM-guided heuristic search case
study** (the constructive part); §6 (pp. 8–9) — the "manipulability of experimental
results" section, worth reading before trusting any LLM-causality benchmark.
**Skip:** §2 survey, appendices.

### 6. Integrating Large Language Model for Improved Causal Discovery — Ban, Chen et al., IEEE TAI 2025
`integrating-llm-causal-2306.16902.pdf` · `.txt` (13 pp)

**What it is.** The pragmatic counterweight to Wu: an error-tolerant framework that still
gets value out of LLM priors. Three mechanisms: (1) accuracy-oriented prompting that
restricts LLM answers to clear causal knowledge; (2) knowledge-to-structure transition
that treats LLM statements as *indirect* causal interactions (sidestepping the
direct/indirect confusion Vashishtha formalized); (3) structure learning that **balances
goodness-of-fit against prior adherence** instead of hard-constraining.

**Why it matters for Lyo.** Feature 1/6's middle path: mechanism (3) is a concrete
prior-vs-data weighting scheme, a simpler sibling of SciNO's probabilistic control.

**Read:** §I–II (pp. 1–3) for the framework; the three error-tolerance mechanisms
(§III, pp. 3–6); robustness-to-wrong-priors experiments.
**Skip:** dataset descriptions, ablation tables.

---

## Tier 3 — Reference (skim when the need arises)

### 7. NoGAM — Montagna et al., CLeaR 2023 (PMLR v213)
`nogam-montagna23a.pdf` · `.txt` (26 pp)

SCORE generalized to **arbitrary noise distributions** — proves score-based ordering works
without Gaussianity, and quantifies the edge-inversion risk when Gaussianity is wrongly
assumed (§3, p. 4). Relevant to Feature 2 if Lyo's telemetry/outcome data is clearly
non-Gaussian (it will be — pass/fail is binary). **Read §3–5 (pp. 4–10)** when that
becomes concrete; skip the appendix result tables.

### 8. Score Matching Through the Roof — Montagna, Faller et al., CLeaR 2025 (PMLR v275)
`score-matching-through-the-roof-2407.18755.pdf` · `.txt` (54 pp)

The unifying theory paper: score-based identifiability without requiring nonlinearity,
and — uniquely here — **with latent variables** (equivalence classes of graphs with hidden
confounders, sufficient conditions for identifying direct causes). Proposes AdaScore,
which outputs an equivalence class / DAG / mixed graph depending on which assumptions
you're willing to make. **Skim §1 and §4.2–5** only, and only when Feature 2 hits
unobserved confounding between artifacts (e.g., hidden context variables affecting both
lesson selection and run outcome). Mostly theoretical; 40+ pp of proofs.

### 9. Sobolev Training for Neural Networks — Czarnecki et al. 2017 (DeepMind)
`sobolev-training-1706.04859.pdf` · `.txt` (19 pp)

The original "train on derivatives, not just values" paper (distillation, policy cloning,
synthetic gradients). This is the mathematical ancestor of SciNO's stability fix and the
formalization of Feature 5's "delivery ≠ learning": matching outcomes (`‖ŝ−s‖` small)
says nothing about matching effects (`‖∇ŝ−∇s‖`). **Read §2 (pp. 3–5)** — the Sobolev
loss and Propositions 2–3 (why derivative supervision strictly reduces the approximation
complexity). The Atari/synthetic-gradient experiments are skippable.

### 10. Song & Ermon 2019 — Generative Modeling by Estimating Gradients of the Data Distribution
`song-ermon-score-1907.05600.pdf` · `.txt` (23 pp)

Pure background: what a score network is, why naive score matching fails (manifold +
low-density problems), and the noise-perturbation fix that became diffusion models.
**Read §2 (pp. 2–4)** only if you want the intuition for what DiffAN/SciNO are actually
estimating. Otherwise skip entirely.

---

## Already digested (Feature 3/4 core)

- **COCOA** (Meulemans et al. 2023) → `papers/longtermcredit-digest.md` — density-ratio
  credit assignment `w = p(u'|s,a)/p(u'|s) − 1`, hindsight classifier, why state-conditional
  credit is spurious (Prop. 2), outcome-encoding choice. The direct basis of Spec §3.1.
- **WCS** (Buesing et al. 2018) → `papers/wouldacouldashoulda-digest.md` — Pearl rung-3
  counterfactuals, why exogenous-noise records are "cheap to log, impossible to
  reconstruct" (Feature 4's randomness-record item).

## Books (not downloaded)

- Pearl 1988, *Probabilistic Reasoning in Intelligent Systems* — π/λ belief propagation.
  Only needed when implementing `learning-as-explanation-graph.md`.
- Pearl 2009, *Causality* (2nd ed.) — rung 1/2/3 hierarchy. The digest of WCS covers the
  operationally relevant part.
