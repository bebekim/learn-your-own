# Causal Discovery Framework Integration — 임성빈 교수 강연에서 Lyo로

Date: 2026-08-11. State: draft.

## 배경

임성빈 교수(고려대)의 causality 강연은 LLM + diffusion model + mathematics를 결합해
causal topological ordering을 발견하는 프레임워크를 제시한다. 핵심 메시지는
"LLM이 causality를 해결한다"가 아니라, 각 정보원의 강점에 맞게 역할을 분담해
조립한다는 것이다.

이 문서는 그 프레임워크의 구성 요소를 Lyo의 기능 향상(feature enhancement)으로
분리하고, 각 feature별로 (1) 개념, (2) 현재 구현 상태, (3) 설계-구현 갭,
(4) 관련 문헌을 정리한다. 모든 feature는 독립적으로 추진할 수 있도록 분리했다.

---

## Feature 1: LLM Semantic Prior in Belief Propagation (π_LLM)

### 개념

강연에서 LLM은 broad domain knowledge를 제공하지만 direct/indirect cause 구별에
약하다. 따라서 LLM을 causal graph의 직접적인 판단자가 아닌 **prior 정보원**으로
사용한다. SciNO 프레임워크에서 LLM은 `P_LLM(X_i ≺ X_j | text)`라는 semantic
prior를 제공하고, data-driven evidence와 probabilistic controller로 결합된다.

Lyo에서 대응되는 구조: `docs/learning-as-explanation-graph.md`가 설계한 Pearl
belief propagation에서 prior 메시지 π가 LLM의 semantic confidence를 받아야 한다.
현재는 deterministic factor만으로 belief를 계산하도록 설계되어 있다.

### 현재 구현 상태

**설계만 존재, 코드 없음.**

- `docs/learning-as-explanation-graph.md` (645 lines): Pearl belief propagation 매핑.
  `BEL(H) = α · λ(H) · π(H)`. factor 구조(scope, chronology, freshness, defeater,
  rival, novelty, outcome)를 정의. `buildExplanationGraphReport`와
  `computeRivalOutcomeMessage` 함수를 언급.
- `Specs/2-learning-as-explanation-graph.org`: Layer 2 spec. status: ready지만
  구현 코드 없음.
- 코드베이스에서 `explanationGraph`, `rivalOutcome`, `belief.*propag`,
  `factor.*freshness`, `defeater`, `novelty.*factor`를 검색한 결과 **매치 없음**.
- LLM judge는 `src/lyo/judge/trace-consumer.ts:183-275`에서 disagreement를
  분류하지만, 이는 classification decision이지 belief propagation에 주입되는
  prior confidence가 아니다.

### 갭

1. **π_LLM 미구현**: explanation graph의 prior 메시지에 LLM confidence가 들어가지
   않음. 설계에서 π가 명시적으로 정의되어 있지만, LLM의 explanation에 대한
   confidence score를 붙여서 `π_LLM(H | text)`로 주입하는 메커니즘이 없다.
2. **LLM confidence 측정 부재**: judge가 classification을 반환할 뿐, 해당
   classification에 대한 확신도(probability 또는 logit)를 출력하지 않는다.
   `Judgment` interface (`trace-consumer.ts:65-76`)에 confidence field 없음.
3. **Bayesian fusion 구조 미구현**: `P(π | D, text) ∝ P(D | π) · P_LLM(π | text)`
   형태의 결합이 코드에 없다. Thompson sampling은 순수하게 data-driven Beta
   posterior만 사용한다 (`selection-policies.ts:87-99`).

### 관련 문헌

- **Vashishtha et al. 2023/2025**. *Causal Order: Key to Leveraging Imperfect Experts.*
  NeurIPS 2024. `arxiv 2310.15117`. LLM이 pairwise prompt로 direct/indirect cause
  구별 못함 → causal order를 output interface로 제안. 작은 모델(Phi-3, Llama-3 8B)이
  GPT-4 pairwise보다 정확. Lyo에 주는 교훈: LLM을 graph가 아닌 **prior**로 사용하고,
  output interface를 ordering/prior로 제한해야 함.
- **Chen et al. 2023**. *Integrating LLM for Improved Causal Discovery.*
  `arxiv 2306.16902`. 3-fold error-tolerant mechanism: accuracy-oriented prompting,
  knowledge-to-structure transition, goodness-of-fit vs LLM prior balance. Lyo의
  "LLM은 propose, environment는 count" 원칙과 일치.
- **Wu et al. 2025**. *LLM Cannot Discover Causality.*
  `arxiv 2506.00844`. LLM을 non-decisional auxiliary role로 제한. causal relationship
  결정에서 배제, heuristic search 보조로만 사용. Lyo의 deterministic classification
  원칙(`docs/deterministic-classification.md`)과 정합.
- **Pearl 1988**. *Probabilistic Reasoning in Intelligent Systems.* Morgan Kaufmann.
  Belief propagation π/λ 메시지 구조의 원전. `docs/learning-as-explanation-graph.md`가
  이 책의 매핑을 기반으로 설계됨.

---

## Feature 2: Causal Ordering as Lesson Selection Search Space Reduction

### 개념

강연의 핵심 통찰: 완벽한 causal graph를 찾는 대신 **causal topological ordering**만
찾아도 DAG 탐색 공간이 permutation 공간으로 축소된다. `X ≺ Z ≺ Y`를 알면 역방향
edge를 제거할 수 있고, 이후 observational data로 불필요한 edge를 pruning하면 된다.

전체 과정:
```
ordering discovery → edge pruning → DAG → causal inference
```

Lyo에서 대응: artifact/lesson/trace event 간에 topological ordering이 없다. 수백 개
lesson이 쌓일 때 Thompson sampling의 탐색 공간이 failure_class 내 전체 후보로
고정된다. Ordering이 있으면 탐색 공간을 순서 제약 하의 부분집합으로 줄일 수 있다.

### 현재 구현 상태

**미구현.**

- Lesson selection은 `src/lyo/storage/lesson-store.ts:440-515`의 `selectLessons` /
  `selectWithDecision`가 담당. `v_lesson_library WHERE failure_class = ?`로 flat
  selection — failure class 내 전체 후보에서 Thompson sampling.
- `src/lyo/selection/selection-policies.ts:87-99`: Thompson-Beta가 유일 등록 policy.
  candidate 간 순서 제약 없음.
- `src/lyo/storage/lesson-library.ts:107-125`: file-based lesson selection도 동일한
  flat 구조. path order로 정렬 후 Thompson sampling.
- 코드베이스에서 `topological.*order`, `causal.*order`, `dependency.*graph` 검색
  결과 — 매치 없음.

### 갭

1. **Artifact 간 ordering 미정의**: lesson이 어떤 artifact 간 인과관계를 나타내는지,
   그 artifact들의 topological order를 추적하는 메커니즘이 없다. `lesson_delta`의
   `actor` 필드(`reflector | validator-rule | curator`)가 생성 순서는 주지만
   causal ordering은 아니다.
2. **Search space reduction 미활용**: 수백 개 lesson이 같은 failure_class에
   쌓일 때, Thompson sampling의 탐색 공간이 O(n)으로 고정. ordering 제약이 있으면
   현재 run의 artifact context에 topologically compatible한 lesson만 후보로
   좁힐 수 있다.
3. **Edge pruning 단계 부재**: ordering을 찾은 후 observational data로 불필요한
   edge를 pruning하는 단계가 없다. 이는 Feature 3(credit decomposition)과
   Feature 5(derivative fidelity)가 담당할 영역이지만, ordering 자체가 먼저
   확립되어야 한다.

### 관련 문헌

- **Sanchez et al. 2022**. *Diffusion Models for Causal Discovery via Topological
  Ordering.* `arxiv 2210.06201`. Diffusion model로 score ∇log p(x) 학습 → Hessian
  diagonal → leaf identification → iterative leaf removal로 topological ordering.
  재훈련 없이 leaf 제거하는 additive residue 방법. Lyo에 주는 교훈: observational
  data(실행 결과)에서 ordering 정보를 추출할 수 있다.
- **Rolland et al. 2022**. *Score Matching Enables Causal Discovery of Nonlinear
  Additive Noise Models.* ICML 2022. ANM 하에서 leaf node의 Hessian diagonal이
  constant → `Var[∂_{x_j} s_j(x)] = 0`으로 leaf별. Stein gradient estimator
  사용 (O(dn³)). Score matching 기반 causal ordering의 원론.
- **Vashishtha et al. 2023**. *Causal Order.* `arxiv 2310.15117`. Ordering만으로
  완벽한 graph가 아님 — pruning 필요. ordering은 탐색 공간 축소의 구조적 정보.
- **Montagna et al. 2023**. *Causal Discovery with Score Matching on Additive
  Models.* PMLR v213. SCORE의 generalization — non-Gaussian noise도 가능.
  NoGAM 알고리즘.

---

## Feature 3: Within-Run Credit Decomposition (Direct vs Indirect Cause)

> **State: implemented (2026-08-15, v0.3).** `src/lyo/credit/ratio-lift.ts`가
> per-injection weight `w_i = ĥ(ℓ_i|s_i,u')/ρ_i − 1`을 계산하고
> `applyValidationOutcome`이 fractional counter로 반영. ĥ는 add-one smoothed
> stratified rates (stratum = failure_class, 과거 resolved receipts만 사용).
> Sign semantics: positive w = observed outcome에 대한 contribution (pass면
> helpful, fail이면 harmful), w ≈ 0이면 counter 이동 없이 receipt만 resolve
> (multiplicative gating). MARK_* delta payload에 `weight` + `estimator` 기록,
> replay는 fractional weight를 fold (없으면 pre-v0.3 ±1). Fallback 규칙:
> stratum cell이 `MIN_STRATUM_DECISIONS`(5) 미만이거나 propensity가 없거나
> ρ ≥ 1 (inclusion certain — contrast 없음, §3.5 identification 조건)이면
> uniform ±1 (`uniform-fallback@1`). Weight는 [-1, MAX_WEIGHT=4]로 clip.
> Tests: `tests/lyo-ratio-lift.test.js`.
>
> **범위 note**: file-based `trace-consumer.ts` credit 경로는 propensity를
> 기록하지 않아 ratio-lift가 identify 불가 — 이 spec의 F3 범위는 LessonStore
> 경로 (logged-bandit dataset이 존재하는 유일한 경로).

### 개념

강연에서 LLM이 "X causes Y?"에 Yes라고 답하지만 실제 구조가 `X → Z → Y`일 때
`X → Y` direct edge는 틀린 graph가 된다. Direct/indirect cause 구별이 어렵기
때문에 ordering으로 회피한 것이다.

Lyo에서 같은 문제가 발생한다. 한 run에 2개 lesson이 injection되고 run이 pass했을
때, 현재 코드는 **모든 pending injection에 동일 outcome**을 할당한다. 이는
`X → Z → Y`에서 X와 Z 모두에 direct edge를 긋는 것과 같은 over-crediting이다.

§3.1 deep-read(`Specs/3.1-counterfactual-credit-synthesis.md`)는 COCOA의 hindsight
density ratio로 이 문제를 해결하도록 설계했다:

```
w_i = ĥ(ℓ_i | s_i, u') / ρ_i - 1
```

여기서 ĥ는 (context, outcome)으로부터 which lesson was injected를 예측하는
classifier, ρ_i는 selection propensity. Lesson이 outcome에 무관하면 w ≈ 0 →
counter 이동 없음.

### 현재 구현 상태

**Over-crediting 구현만 존재. Ratio-lift 미구현.**

- `src/lyo/judge/trace-consumer.ts:462-498`: credit assignment 로직.
  - Run의 `classesPresent`(disagreement classification set)에 lesson의
    classification이 있으면 → harmful (lesson이 들어갔는데도 같은 실패 재발)
  - 없고, 다른 run에서 같은 spec + writer model에 같은 classification이 있었으면
    → helpful (예상된 실패가 안 났다)
  - **모든 delivered lesson이 동일 outcome을 받음** — per-injection decomposition 없음
- `src/lyo/storage/lesson-library.ts:133-149`: `recordLessonOutcome` — simple
  `+1` counter increment on .md file. Binary helpful/harmful, no fractional counts.
- `src/lyo/storage/lesson-store.ts:634-686`: `applyValidationOutcome` —
  lesson_application의 `counted` flag로 outcome을 lesson counter에 반영.
  역시 binary +1.

### 갭 (2026-08-15 v0.3으로 1-4 해소; 5는 의도적 defer)

1. ~~Hindsight classifier 미구현~~ → stratified rates로 구현 (§3.1의 "coarser ĥ"
   시작 단계). Learned classifier로의 upgrade는 receipts가 더 쌓이면 검토.
2. ~~Fractional Beta counts 미구현~~ → MARK_* payload의 `weight`가 fractional
   counter로 반영됨 (SQLite REAL storage).
3. ~~Propensity data 미사용~~ → `computeInjectionWeights`가 decision log의
   propensity를 소비.
4. ~~Outcome encoding 미정식화~~ → stratum = failure_class × outcome =
   pass/fail cell이 `u' = (failure_class, pass)` encoding에 해당.
5. **Cycle stratification deferred** (§3.5): 같은 run의 여러 cycle이 scenario를
   공유하지만 현재 estimator는 decision 단위로 count. `cycle_index`는 로깅되어
   있으므로 후속 작업 가능.

### 관련 문헌

- **Meulemans et al. 2023**. *Would I have gotten that reward? Long-term credit
  assignment by counterfactual contribution analysis.* NeurIPS 2023.
  Digest: `papers/longtermcredit-digest.md`. Density-ratio credit assignment
  `w(s,a,u') = p(u'|s,a)/p(u'|s) - 1`. Hindsight classifier, propensity-based.
  Lyo의 §3.1 deep-read가 이 논문을 기반으로 함.
- **Buesing et al. 2018**. *Woulda, Coulda, Shoulda: Counterfactually-Guided
  Policy Search.* DeepMind. Digest: `papers/wouldacouldashoulda-digest.md`.
  Pearl rung-3 counterfactual. Over-crediting 경고: "wrongly attributing a
  negative outcome to the agent's actions, instead of environment factors."
- **Kang et al. 2025**. *SciNO: Score-informed Neural Operator for Enhancing
  Ordering-based Causal Discovery.* NeurIPS 2025 poster. `arxiv 2508.12650`.
  LLM + SciNO probabilistic control 결합에서 LLM의 잘못된 causal prediction을
  data-driven evidence로 교정하는 구조. Lyo의 credit decomposition과 구조적
  유사: prior(LLM)를 data가 교정.

---

## Feature 4: Decision Log Schema — Propensity Recording 완성도

> **State: implemented (2026-08-15, schema v5).** 미구현 항목 7·8 모두 구현됨.
> `lesson_decision.posterior_snapshot_id` (migration v5, `MAX(delta_id)` at
> decision time — §6 replay가 해당 id까지의 delta를 fold하면 decision 시점의
> posterior를 정확히 재구성)와 `run_randomness` 테이블 (run_id PK, seed,
> temperature, model_ids JSON, tool_trace_hashes JSON; INSERT OR IGNORE로
> immutable) 추가. `recordDecision`가 snapshot을 자동 stamping하고,
> `recordRunRandomness`/`getRunRandomness` 메서드 제공. `src/eval/replay.ts`가
> seed를 기록하는 첫 번째 producer. Tests: `tests/lyo-lesson-store.test.js`의
> v5 섹션 (snapshot stamping, immutability, v4→v5 migration).

### 개념

COCOA와 WCS 모두 propensity 기반 identification을 요구한다. §3.4는 6개 항목을
즉시 로깅해야 한다고 명시했다: (1) full propensity vector, (2) null-injection
decisions, (3) decision-point context, (4) bandit posterior snapshot id,
(5) run randomness record, (6) per-candidate (α, β).

### 현재 구현 상태

**부분 구현. 핵심 schema는 존재하나 2개 항목 미구현.**

구현된 항목:

1. ✅ **Full propensity vector**: `lesson_decision.candidates` JSON에
   `[{lesson_id, alpha, beta, propensity}]` 기록
   (`src/lyo/storage/schema.ts:99`).
2. ✅ **Null arm**: `lesson_decision.null_arm` REAL column
   (`schema.ts:101`). `selectWithDecision`가 null_arm = 1을 반환
   (`lesson-store.ts:484`).
3. ✅ **Decision-point context**: `lesson_decision.context` JSON +
   `failure_class`, `task_cue`, `cycle_index`, `trigger_message_id`
   (`schema.ts:96-102`).
4. ✅ **Policy id**: `lesson_decision.policy` — logging policy of record
   (`schema.ts:105`, migration v3). `lesson-store.ts:245`.
5. ✅ **Per-candidate (α, β)**: candidates JSON에 포함
   (`schema.ts:99`). `selectWithDecision`가 `alpha = helpful+1, beta = harmful+1`로
   계산 (`lesson-store.ts:487-491`).
6. ✅ **Propensity estimation**: Monte-Carlo replication in `selectWithDecision`
   (`lesson-store.ts:494-507`). `propensityReplicates = 1000` 기본값.

미구현 항목 (2026-08-15 schema v5로 해소):

7. ✅ **Run randomness record** (§3.4 item 5): `run_randomness` 테이블로 구현.
   seeds, temperature, model ids, tool-trace hashes — exogenous-noise log `{N}`.
   WCS rung-3 replay의 down payment. Immutable (INSERT OR IGNORE).
8. ✅ **Bandit posterior snapshot id** (§3.4 item 4): `recordDecision`가
   `posterior_snapshot_id = MAX(delta_id)`를 자동 stamping. Replay가 deltas ≤
   snapshot을 fold하면 decision-time posterior를 재구성. Pre-v5 rows는 NULL
   (과거 상태는 복구 불가 — honest).

### 갭

1. **Randomness record retroactively impossible**: §3.1이 "backward-incompatible
   to add later; everything else can wait"라고 경고한 항목. run seed, temperature,
   model id, tool-trace hash를 로깅하지 않으면 미래 rung-3 replay가 불가능하다.
   현재 이 데이터가 어떤 테이블에도 기록되지 않음.
2. **Posterior snapshot versioning**: `lesson_decision`이 decision 시점의
   `(α, β)`를 기록하지만, 이를 특정 posterior snapshot version과 연결하는
   메커니즘이 없다. 시간이 지나면 같은 `(α, β)`가 다른 posterior 상태를
   가리킬 수 있다.
3. **Propensity data unconsumed**: 데이터는 수집되고 있지만, 아무 estimator도
   이를 읽지 않음. Feature 3의 ratio-lift estimator가 이 데이터의 소비자가
   되어야 함.

### 관련 문헌

- **Meulemans et al. 2023**. COCOA. Propensity-based identification의 필요성.
  `p(u'|s,a)/p(u'|s) - 1` 계산에 propensity 필수. §3.1 deep-read 참조.
- **Buesing et al. 2018**. WCS. Exogenous noise record `{N}`이 rung-3
  abduction→action→prediction에 필수. "Cheap to log; impossible to reconstruct."
- **Kang et al. 2025**. SciNO. `arxiv 2508.12650`. SciNO의 probability estimates가
  autoregressive model prior와 결합될 때, prior의 versioning이 결과 해석에
  필수적임. Lyo의 posterior snapshot versioning과 구조적 유사.

---

## Feature 5: Derivative-Level Fidelity (Delivery ≠ Learning)

### 개념

강연의 가장 기술적인 통찰: standard diffusion model이 score `ŝ ≈ s`를 잘
학습해도 derivative `∇ŝ ≈ ∇s`가 보장되지 않는다.

```
‖ŝ - s‖ 작음  ⇏  ‖∇ŝ - ∇s‖ 작음
```

함수값 approximation error가 작아도 미세 진동이 있으면 미분은 크게 달라질 수
있다. 생성 품질이 좋아도 causal discovery에 필요한 Hessian이 정확하다는 보장이
없다. SciNO는 Sobolev/function-space 관점과 neural operator로 derivative
structure까지 안정화한다.

Lyo에서 대응되는 구조: **"run이 통과했다" ≠ "lesson이 통과를 cause했다"**.

- `‖ŝ - s‖` ≈ "run outcome 관측" (함수값)
- `‖∇ŝ - ∇s‖` ≈ "lesson의 causal effect 추정" (미분값)

현재 Lyo는 outcome(함수값)만 보고 causal effect(미분값)를 추정한다.
`docs/learned-context-thermodynamics.md`가 "delivery ≠ learning"을 개념적으로
설명하지만, 정량화 메커니즘이 없다.

### 현재 구현 상태

**개념만 존재, 정량화 미구현.**

- `docs/learned-context-thermodynamics.md` (249 lines): "delivery ≠ learning"
  개념적 기반. thermodynamic control metaphor. 하지만 수학적 정식화나 구현 없음.
- Credit assignment는 binary outcome → counter increment. "run이 pass했다"를
  "lesson이 pass를 cause했다"로 직접 연결. 이것이 `‖ŝ - s‖`만 보고 `‖∇ŝ - ∇s‖`를
  무시하는 것과 동일.
- `src/activation/derivation.ts:177-179`: zone-activation weight 계산이
  `positive_outcomes + ? - negative_outcomes - ?` 형태. outcome count만으로
  weight를 정하는 것도 같은 구조.

### 갭

1. **Causal effect 정식화 부재**: lesson의 causal effect를 미분값 관점에서
   정식화하는 수학적 구조가 없다. ratio-lift(§3.1)가 사실상 이 역할을 하지만,
   derivative fidelity 관점에서 연결되지 않음.
2. **Sobolev-like training 관점 부재**: SciNO가 함수값뿐 아니라 derivative까지
   loss에 포함하는 Sobolev training 관점을 도입한 것처럼, Lyo도 credit estimator의
   목적함수가 outcome 예측(함수값)이 아니라 causal effect 예측(미분값)을
   목표로 해야 한다. 현재 estimator 자체가 없음.
3. **Over-crediting = derivative error**: trace-consumer의 over-crediting은
   정확히 derivative error의 증상이다. 모든 injection에 같은 credit를 주는 것은
   `∇`를 무시하고 함수값만 matching하는 것과 동일.

### 관련 문헌

- **Kang et al. 2025**. SciNO. `arxiv 2508.12650`. Sobolev/function-space 관점과
  neural operator로 derivative structure 안정화. DiffAN 대비 order divergence
  42.7%(synthetic) / 31.5%(real) 감소. Lyo에 주는 교훈: credit estimator의
  목적함수가 outcome이 아니라 causal effect를 target으로 해야 함.
- **Czarnecki et al. 2017**. *Sobolev Training for Neural Networks.* Sobolev
  training의 원론. 함수값뿐 아니라 derivative까지 loss에 포함. SciNO의 이론적
  기반. `arxiv 1706.04859`.
- **Song & Ermon 2019**. *Generative Modeling by Estimating Gradients of the
  Data Distribution.* Score matching의 기반. `arxiv 1907.05600`. Score function
  ∇log p(x) 학습이 generative modeling의 핵심. Lyo에서 data distribution 대신
  outcome distribution의 score를 생각할 수 있음.
- **Score matching through the roof.** `arxiv 2407.18755`. Linear, nonlinear,
  latent variables까지 score matching identifiability 확장. ANM 하에서
  identifiability의 수학적 조건.

---

## Feature 6: Probabilistic Controller for LLM + Data Fusion

### 개념

강연의 마지막 결합이자 가장 재미있는 부분: LLM의 semantic prior와 diffusion
model의 data-driven evidence를 probabilistic controller로 결합한다.

개념적으로 Bayesian하게 읽을 수 있다:

```
P(π | D, text) ∝ P(D | π) · P_LLM(π | text)
```

여기서 π는 causal ordering. LLM은 broad domain knowledge를, data는 observational
evidence를, controller는 둘을 결합해 LLM의 잘못된 prediction을 교정한다.

Lyo에서 이 구조는 이미 `docs/learning-as-explanation-graph.md`의 belief
propagation에 대응된다:

- LLM: prompt/plan/code/output이 의미상 어떻게 영향을 줄지에 대한 prior
- Telemetry/evals: 실제 실행에서 관측된 evidence
- DAG mathematics: 순환 금지, topological consistency, reachability
- Probabilistic controller: LLM의 자신감과 실행 데이터를 조정

### 현재 구현 상태

**미구현. 설계만 존재.**

- `docs/learning-as-explanation-graph.md`: π/λ belief propagation 구조 설명.
  하지만 π에 LLM prior가 명시적으로 들어가지 않음 — deterministic factor만으로
  belief 계산.
- Thompson sampling(`selection-policies.ts:87-99`)은 순수 data-driven Beta
  posterior. LLM prior 없음.
- LLM judge(`trace-consumer.ts`)는 classification decision을 내리지만, probability
  estimate를 반환하지 않음. `Judgment` interface에 confidence/probability field
  없음.
- Bayesian fusion 구조 `P(π | D, text) ∝ P(D | π) · P_LLM(π | text)`를 구현한
  코드 없음.

### 갭

1. **LLM prior injection 미구현**: Thompson sampling의 Beta prior에 LLM confidence를
   주입하는 메커니즘이 없다. 예: LLM이 lesson의 explanation에 대해 "이 intervention은
   해당 failure class에 유효할 확신 0.8"이라고 할 때, 이를 Beta(α, β)의 prior
   parameter로 변환하는 로직이 없음.
2. **Controller 구조 미구현**: LLM prior와 data evidence를 결합해 decoding/selection
   을 제어하는 controller가 없다. SciNO의 probabilistic control algorithm이 정확히
   이 구조를 구현하지만, Lyo에는 대응물이 없음.
3. **Counterfactual 제한**: artifact 시스템에서 observational ordering만으로
   "다른 prompt를 썼다면 어떻게 되었을까?"라는 counterfactual을 바로 답할 수
   없다. 이 단계에는 structural equations, intervention data 또는 추가적인
   causal assumptions이 필요하다 (§3.1의 rung-2 vs rung-3 구분).

### 관련 문헌

- **Kang et al. 2025**. SciNO. `arxiv 2508.12650`. SciNO probability estimates +
  autoregressive model prior 결합. Probabilistic control algorithm으로 LLM의
  잘못된 causal prediction을 교정. LG AI Research 해설:
  `https://www.lgresearch.ai/blog/view?seq=615`.
- **Pearl 1988**. *Probabilistic Reasoning in Intelligent Systems.* Belief
  propagation π/λ 구조의 원전. `docs/learning-as-explanation-graph.md`가 이
  구조를 Lyo에 매핑.
- **Vashishtha et al. 2023**. `arxiv 2310.15117`. LLM의 causal prediction을 prior로
  사용하고 data가 교정하는 구조. triplet method로 cycle 회피.
- **Chen et al. 2023**. `arxiv 2306.16902`. Goodness-of-fit vs LLM prior balance.
  data fit과 LLM prior 사이의 균형을 찾는 3-fold mechanism.

---

## 문헌 목록 (전체)

사용자가 직접 읽을 수 있도록 전체 논문 목록을 정리한다. PDF full text를 읽지
못한 논문은 [abstract only]로 표시한다. 모든 논문은 arxiv 링크로 접근 가능하다.

### 핵심 논문 (강연 직접 근거)

1. **SciNO** — Kang et al. 2025.
   *Score-informed Neural Operator for Enhancing Ordering-based Causal Discovery.*
   NeurIPS 2025 poster.
   `https://arxiv.org/abs/2508.12650`
   [abstract only] — ANM 하에서 log-density Hessian diagonal 안정 추정.
   Sobolev/function-space 관점. Neural operator. DiffAN 대비 order divergence
   42.7%(synthetic) / 31.5%(real) 감소. **Lyo 관련**: derivative fidelity,
   probabilistic controller, LLM + data fusion의 직접적 모델.

2. **DiffAN** — Sanchez et al. 2022.
   *Diffusion Models for Causal Discovery via Topological Ordering.*
   `https://arxiv.org/abs/2210.06201`
   [abstract only] — Diffusion model로 score 학습 → Hessian → leaf identification
   → topological ordering. **Lyo 관련**: observational data에서 ordering 정보
   추출의 선례.

3. **SCORE** — Rolland et al. 2022.
   *Score Matching Enables Causal Discovery of Nonlinear Additive Noise Models.*
   ICML 2022.
   `https://arxiv.org/2202.00818`
   [abstract only] — ANM 하에서 leaf node의 Hessian diagonal이 constant.
   **Lyo 관련**: score matching 기반 causal ordering의 원론.

### LLM + Causality

4. **Vashishtha et al. 2023/2025**.
   *Causal Order: Key to Leveraging Imperfect Experts.*
   NeurIPS 2024.
   `https://arxiv.org/abs/2310.15117`
   [abstract only] — LLM을 graph가 아닌 order/prior로 사용. Triplet method.
   **Lyo 관련**: LLM을 non-decisional prior로 제한하는 방법론.

5. **Chen et al. 2023**.
   *Integrating LLM for Improved Causal Discovery.*
   `https://arxiv.org/abs/2306.16902`
   [abstract only] — Error-tolerant LLM prior + data balance.
   **Lyo 관련**: LLM prior와 goodness-of-fit의 균형.

6. **Wu et al. 2025**.
   *LLM Cannot Discover Causality.*
   `https://arxiv.org/abs/2506.00844`
   [abstract only] — LLM을 non-decisional auxiliary role로 제한.
   **Lyo 관련**: "LLM은 propose, environment는 count" 원칙의 학술적 근거.

### Credit Assignment

7. **COCOA** — Meulemans et al. 2023.
   *Would I have gotten that reward? Long-term credit assignment by counterfactual
   contribution analysis.* NeurIPS 2023.
   Digest: `papers/longtermcredit-digest.md` (full read).
   `https://arxiv.org/abs/2310.19048`
   Density-ratio credit assignment. Hindsight classifier. Propensity-based.
   **Lyo 관련**: §3.1 ratio-lift 설계의 직접적 근거. Feature 3, 4의 핵심.

8. **WCS** — Buesing et al. 2018.
   *Woulda, Coulda, Shoulda: Counterfactually-Guided Policy Search.* DeepMind.
   Digest: `papers/wouldacouldashoulda-digest.md` (full read).
   `https://arxiv.org/abs/1811.11502`
   Pearl rung-3 counterfactual. Abduction→action→prediction.
   **Lyo 관련**: rung-2 vs rung-3 구분, randomness record 필요성.

### Score Matching & Derivative Fidelity

9. **Montagna et al. 2023**.
   *Causal Discovery with Score Matching on Additive Models.* PMLR v213.
   `https://proceedings.mlr.press/v213/montagna23a.html`
   [abstract only] — SCORE의 generalization. Non-Gaussian noise. NoGAM.
   **Lyo 관련**: noise distribution 제한 완화의 선례.

10. **Czarnecki et al. 2017**.
    *Sobolev Training for Neural Networks.*
    `https://arxiv.org/abs/1706.04859`
    [abstract only] — 함수값뿐 아니라 derivative까지 loss에 포함.
    **Lyo 관련**: SciNO의 이론적 기반. "delivery ≠ learning"의 수학적 정식화.

11. **Song & Ermon 2019**.
    *Generative Modeling by Estimating Gradients of the Data Distribution.*
    `https://arxiv.org/abs/1907.05600`
    [abstract only] — Score matching의 기반.
    **Lyo 관련**: data distribution의 score 학습 개념.

12. **Score matching through the roof.**
    `https://arxiv.org/abs/2407.18755`
    [abstract only] — Linear, nonlinear, latent variables까지 identifiability
    확장. **Lyo 관련**: ANM 하에서 identifiability의 수학적 조건.

### 기초

13. **Pearl 1988**.
    *Probabilistic Reasoning in Intelligent Systems.* Morgan Kaufmann.
    ISBN: 978-1-55860-479-7.
    [book] — Belief propagation π/λ 구조의 원전.
    **Lyo 관련**: `docs/learning-as-explanation-graph.md`의 이론적 기반.

14. **Pearl 2009**.
    *Causality: Models, Reasoning, and Inference.* 2nd ed. Cambridge.
    ISBN: 978-0-521-89560-6.
    [book] — Causal hierarchy (rung 1-2-3), SCM, do-calculus.
    **Lyo 관련**: rung-2(observational) vs rung-3(counterfactual) 구분의 원전.

---

## Feature 간 의존관계

```
Feature 4 (Decision Log Schema)
  ├── propensity data 수집 → Feature 3 (Credit Decomposition)의 입력
  ├── randomness record → Feature 6 (Controller)의 rung-3 foundation
  └── posterior snapshot → Feature 5 (Derivative Fidelity)의 versioning

Feature 2 (Causal Ordering)
  ├── search space reduction → Feature 3의 stratification 기반
  └── ordering 확립 → Feature 5의 causal effect 추정 전제

Feature 1 (LLM Prior)
  └── π_LLM → Feature 6 (Controller)의 prior 입력

Feature 3 (Credit Decomposition)
  ├── ratio-lift estimator → Feature 5의 derivative 추정 역할
  └── hindsight classifier → Feature 6의 data-driven evidence

Feature 5 (Derivative Fidelity)
  └── "delivery ≠ learning" 정식화 → Feature 3의 목적함수 재설계

Feature 6 (Probabilistic Controller)
  └── Bayesian fusion → Feature 1 + Feature 3의 결합 메커니즘
```

**추천 구현 순서**: Feature 4(완성도 마무리) → Feature 3(credit decompose) →
Feature 2(ordering) → Feature 1(LLM prior) → Feature 5(derivative) →
Feature 6(controller). Feature 4는 retroactively impossible 항목이 있으므로
최우선.

---

## 기존 Spec과의 관계

| Feature | 관련 기존 Spec | 관계 |
|---------|---------------|------|
| 1 (LLM Prior) | `2-learning-as-explanation-graph.org` | π에 LLM confidence 주입 |
| 2 (Ordering) | `3-lesson-delta-design.md` §8 | deferred "cross-lesson interaction" |
| 3 (Credit) | `3.1-counterfactual-credit-synthesis.md` | §3.2의 구현 미실행 항목 |
| 4 (Decision Log) | `3.1-counterfactual-credit-synthesis.md` §3.4 | 6개 항목 중 2개 미구현 |
| 5 (Derivative) | `docs/learned-context-thermodynamics.md` | "delivery ≠ learning" 정량화 |
| 6 (Controller) | `2-learning-as-explanation-graph.org` | belief propagation의 Bayesian fusion |

이 spec은 기존 spec을 대체하지 않는다. 각 feature가 기존 spec의 어느 부분을
확장하는지 위 표에 명시했다. 구현 시 해당 spec의 상태를 `done`으로 업데이트한다.
