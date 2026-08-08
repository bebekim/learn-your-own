# §5.3 반사실적 신용 합성 — 설계만 되고 배포 안 됨

**출처:** `Specs/3.1-counterfactual-credit-synthesis.md` (2026-07-20)  
**상태:** 설계 완료, 구현 0%, 배포 0%

---

## 무엇이 설계됐나

LYO의 §5.3은 "이 레슨이 없었다면 이 사이클이 통과했을까?"라는 반사실적 질문을 측정 가능한credit 신호로 바꾸는 설계를 담고 있다.
근거 논문: WCS (Buesing et al. 2018), COCOA (Meulemans et al. 2023, NeurIPS).

**핵심 설계 의도:** 현재 시스템의 "대기 중인 모든 주입이 최종 결과를 가져간다"는 단순 카운팅을 대체.
논문들이 경고하는 과신용(over-crediting) 문제를 해결하기 위해, 성향 점수(propensity) 기반의 인과적 credit 할당을 도입.

---

## 현재 상태: L0/L1만 작동, L2-L4는 종이 위

| 수준 | 내용 | 상태 |
|------|------|------|
| L0 | 수취증(receipts): hook_events, trace.json 파일 | 작동 중 |
| L1 | 레슨별 Beta 사후분포 (helpful/harmful 카운터) | 작동 중 — 단, lesson-library.ts는 마크다운 파일만 갱신, DB의 outcomes 테이블은 미사용 |
| L2 | 임베딩 기반 레슨 검색 | 설계됨, 미배포 |
| L3 | 내용 압축 | 설계됨, 미배포 |
| L4 | 수취증 기반 hindsight classifier credit | 설계됨, 미배포 |

**L1도 불완전:** `recordLessonOutcome()`은 lesson 마크다운 파일의 텍스트 카운터만 증가시킨다.
`outcomes` 테이블(`src/schema.ts:83-93`)은 존재하지만 아무도 쓰지 않는다.

---

## §5.3이 요구하는 schema 변경사항 — 전부 미구현

### 1. `sampled_score`가 propensity가 아님

현재 `lesson_decision.sampled_score`는 Thompson draw θ만 저장.
실제 필요한 것은 선택 확률:

$$P(\ell \text{ top-ranked} \mid \text{candidate set}, \{(\alpha,\beta)\}_t)$$

이 값이 없으면 IPW/DR 추정 불가능 (§3.4, 첫 번째 항목).

### 2. 후보 세트(candidate set) 미기록

결정 시점에 어떤 레슨들이 경쟁했는지, 각각의 $(\alpha, \beta)$가 무엇이었는지 기록되지 않음.
§3.4 항목 1.

### 3. Null-arm 기록 없음

레슨이 주입되지 않은 사이클, 실패한 실행이 기록되지 않음.
모든 estimator 경로가 이걸 필요로 함 (§3.4 항목 2).

### 4. 결정 시점 컨텍스트 부재

task id, failure_class, cycle index, retry count — backdoor set을 구성하는 정보.
없으면 모든 lift 추정이 난이도 차이로 혼동됨 (§3.4 항목 3).

### 5. Bandit 사후분포 스냅샷 ID 없음

Thompson이 업데이트될수록 과거 receipt의 해석이 달라짐.
버전 관리가 없으면 과거 receipt가 해석 불가능해짐 (§3.4 항목 4).

### 6. 실행 무작위성 기록 없음

씨드, 온도, 모델 ID, tool-trace 해시 — WCS rung 3 replay에 필요한 외생 노이즈 로그 $\{N\}$.
기록하지 않으면 "이 exact 실행을 레슨 없이 재연할 수 없다" (§3.4 항목 5).

**종합:** §3.4의 6개 항목 전체가 "지금 기록해야 한다 — retroactive 불가능"이라고명시했음에도, 하나도 구현되지 않음.

---

## 결정 로그 테이블 자체가 없음

`3.1-counterfactual-credit-synthesis.md` §3.4는 `lesson_decision` 테이블(또는 `lesson_application`의 companion table)에
위 데이터를 넣으라고 설계했다. 그러나 **현행 `src/schema.ts`에는 `lesson_decision` 테이블이 존재하지 않는다.**

dogfood 구시스템(v3)은 `lesson_decision` 테이블을 갖고 있었지만(2행 존재), 이는 구시스템 설계.
신시스템(schema.ts, 27개 테이블)에는 해당 테이블이 없다.

---

## 대조군(control arm) 없음

현재의 레슨 주입은 Thompson sampling에 의존. 레슨이 선택되지 않은 사이클이 있을 수 있지만,
그 사이클의 결과(pass/fail)가 체계적으로 기록되지 않는다.

**결과:** "레슨이 효과 있었는지" vs "태스크가 쉬워서 retry로 통과했을 뿐"을 구분할 수 없음.
`wouldacouldashoulda-digest.md` §6(b.3) — 공통 난수(shared random numbers)와 대조군 필요성 지적.

---

## 단일 셀 문제

4회 실행 모두:
- 동일 태스크: "Add a /health endpoint to Express server"
- 동일 모델: Claude Haiku (claude provider)
- 동일 역할: worker/implementation
- 동일 failure class: `output_generation`

§9 "Coverage (Ashby)" 지표 = distinct failure classes observed ÷ classes with active lessons.
오늘 시점에서는 1/1이지만, 관찰할Failure class가 하나뿐이라 의미가 없음.

**긍정성(positivity) 문제:** Thompson이 특정 stratum에서 이 레슨 주입을 멈추면,
해당 stratum에서 lift는 unidentified가 됨 (not just noisy). `wouldacouldashoulda-digest.md` §6(c).

---

## 현재 credit 전파 방식의 문제

`trace-consumer.ts:468-501`의 credit 로직:
```
for each delivered lesson in run:
  if failure_class recurred → harmful
  elif failure_class was expected (같은 spec+writer model에서 이전에 관찰) → helpful
  else → nothing
```

**문제점:**
- 같은 실행 내 여러 레슨이 주입됐을 때, 모두 동일한 최종 결과를 가져감 (과신용)
- 기대(expected) 판단은 동일 spec+writer model의 이전 실행 존재 여부만 봄 — 인과적 대조 아님
- "레슨이 없었더라면 실패했을까"를 묻지 않음

§3.2가 요구하는 per-injection 계수 $w_i = \hat h(\ell_i \mid s_i, u') / \rho_i - 1$는 구현되지 않음.

---

## 블로그 드래프트와의 연결

블로그 드래프트의 핵심 주장:

> "배달(delivery)은 학습(learning)이 아니다. 프롬프트에 넣었다는 것은 배달 지표지 학습 지표가 아니다."

LYO 설계는 이 주장을 제약 조건으로 삼고 있다:
- 레슨은 trace + judge 판단을 거쳐야만 생성됨 ( automated receipt → judgment → lesson )
- credibility gate(Wilson score)로 단일 관찰로 promotion 차단
- validator가 카운터를 움직임 (환경 grounding)

**그러나 구현은 L0/L1에서 멈췄다.** 판별은 사람이 아니라 judge 모델이 하게 설계했지만,
정작 credit 할당은 여전히 "주입됐고 결과가 좋았으니 helpful"이라는 단순 로직에 머문다.
이건 블로그 드래프트가 실패로 기록한 "프러즈 레슨이 4번 무시된" 상황과 구조적으로 같은 문제 —
더 정교한 측정을 설계해놓고, 정작 측정은 가장 단순한 형태로 실행한 것.

---

## 필요한 다음 작업 (발굴 필요)

1. **Schema 확장:** `lesson_decision` 테이블 추가 — candidate set, per-candidate propensity, null arm, 결정 시점 컨텍스트, bandit snapshot id, 실행 무작위성 기록
2. **집행 연결:** `pipeline run`이 `recordRun()`을 호출하게 만들기 — 현재는 완전히 분리
3. **대조군 사이클:** 레슨을 의도적으로 주입하지 않는 cycle 도입, 결과 기록
4. **IPW/DR 추정 구현:** stratified rate로 시작 (§3.2, §5 항목 3)
5. **Wilson gate + lift CI:** promotion 조건을 Wilson-lower > 0.5 ∧ ratio-lift CI가 0 제외로 변경 (§5 항목 4)
6. **다중 failure class 확보:** 최소 2-3개 태스크 패밀리에서 실행, Ashby coverage 확보
