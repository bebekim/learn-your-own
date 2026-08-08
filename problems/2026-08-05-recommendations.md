# Recommendations — telemetry gap과 credit 합성 문제

**작성일:** 2026-08-05  
**관련 파일:** `2026-08-05-telemetry-gap-root-cause.md`, `2026-08-05-counterfactual-credit-synthesis-5-3.md`

---

## 긴급: 다시 이런 일이 일어나지 않게 하기

### U1. 파이프라인 발동을 기본값으로 만들기

현재 `lyo pipeline run`은 DB에 아무것도 기록하지 않는다.
학습 데이터를 수집하려면 **의도적으로** `lyo run-start` + `lyo pipeline run` + `lyo pipeline learn`을
순서대로 실행해야 한다. 이 순서는 실수하기 쉽고, 실제로 work repo 2개에서 건너뛰었다.

**옵션 A:** `runPipeline()`이 시작 시 `recordRun()`을 자동 호출하게 수정.
가장 직접적. `run-pipeline.ts:89`에 `recordRun()` 호출 추가.
필요 정보(`task_shape`, `channel`)는 plan.json/spec.json에서 추출 가능.

**옵션 B:** `lyo pipeline run`이 `recordRun()`을 별도 프로세스로 호출.
현재 구조 유지하면서 연결만 추가.

**옵션 C:** Claude Code 훅이 세션 종료 시 `lyo pipeline run`이 필요한지 판단.
더 복잡. 당분간 비추천.

**권장:** 옵션 A. 가장 단순하고, 누락 가능성이 0으로 수렴.

### U2. work repo들의 hook_events를 학습 파이프라인 입력으로 연결할지 결정

현재 crystalbrooks에 1977건, data-lake-rep-744에 1575건의 hook_events가 있다.
이 데이터는 "Claude Code 세션이 이 repo에서 실행됐다"를 증명하지만, 무엇을 했는지는 detail하지 않다.

**질문:** 이 세션들 중 일부가 실제로 spec-driven 코드/테스트 생성 작업이었다면,
hook_events를 seed로 삼아 사후적으로 `plan.json`/`spec.json`을 재구성하고 파이프라인을 돌릴 수 있나?

**답변 보류:** 먼저 work repo들의 실제 작업 내용을 확인해야 함.
git log, 파일 변경 이력으로 어떤 작업을 했는지 파악.

### U3. volume 확보를 위한 최소 실행 계획

**목표:** 최소 2개 repo에서 각각 3회 이상 완전한 파이프라인 실행 (plan → run → learn).

**필요 조건:**
1. `plan.json` + `spec.json` 준비 (`lyo pipeline init --spec ...`)
2. 테스트 러너 환경 (node:test, CommonJS)
3. `lyo pipeline run --plan plan.json` → `lyo pipeline learn --run <runDir> --library <dir>`

**우선순위:** 이미 작업이 진행 중인 repo 하나 선택. plan/spec 준비가 가장 간단한 태스크부터.

---

## 중기: §5.3 credit 합성 구현

### M1. Schema 확장 — lesson_decision 테이블 추가

`src/schema.ts`의 `initLedger()`에 새 테이블 추가.
필요 컬럼 (§3.4 전부):

```sql
create table if not exists lesson_decisions (
  decision_id text primary key,
  run_id text not null references runs(run_id),
  decision_time text not null,

  -- 선택 로직
  candidate_set json not null,        -- [{lesson_path, sha256, alpha, beta}, ...]
  selected_lesson_path text,          -- null = no-lesson arm
  selected_lesson_sha256 text,
  selected_score real,                -- Thompson draw θ (현재 sampled_score와 동일)
  selection_propensity real,          -- P(selected | candidate_set, posteriors) ← 핵심 추가

  -- 결정 시점 컨텍스트 (backdoor set)
  task_shape text not null,
  failure_class text,
  cycle_index integer,
  retry_count integer,

  -- bandit 상태
  bandit_posterior_snapshot_id text,  -- hindsight 재해석 가능하게

  -- 실행 무작위성 기록 (rung 3 down payment)
  seed text,
  temperature real,
  model_id text,
  tool_trace_hash text,

  created_at text not null
);
```

**주의:** 이 테이블은 `recordRun()` 이후, 레슨 선택 시점에 기록돼야 함.
현재는 레슨 선택이 `run-pipeline.ts` 내 `selectLessons()`에서 일어나므로,
이 호출 주변에 `recordLessonDecision()`을 삽입해야 함.

### M2. Null-arm 기록

레슨이 선택되지 않은 실행도 `lesson_decisions`에 기록 (selected_lesson_path = null).
현재 `selectLessons()`는 항상 최대 3개까지 선택하므로, null-arm은
library에 레슨이 없을 때만 발생. 의도적 대조군 사이클 도입 시 의미 있음.

### M3. Credit 전파 수정

`trace-consumer.ts:468-501`의 현재 로직:
```typescript
// 현재: 실패 클래스 재발 → harmful, 예상됐으면 helpful
```

§3.2에 따른 수정 목표:
```typescript
// 목표: per-injection hindsight 밀도비 w_i = h(ℓ_i | s_i, u') / ρ_i - 1
// 시작은 stratified rate (학습된 classifier 없이)
```

 당장 구현 가능한 것: 각 lesson × failure_class 조합별 pass rate를 집계하고,
전체 pass rate 대비 lift 계산. propensity로 나누면 §3.1의 ratio-lift 추정.

---

## 장기: 다중 셀 확보

### L1. 2개 이상 failure class 확보

현재: `output_generation` 1개뿐.
목표: `code-bug`, `test-hallucination`, `spec-gap` 중 최소 2개 추가 관찰.

**방법:** 태스크 설계를 바꿔서:
- 코드 버그가 나도록 spec을 충분히 복잡하게
- 테스트 환각이 나도록 edge case 포함
- spec-gap이 나도록 의도적으로 모호한 spec 포함

### L2. 2개 이상 모델

현재: Claude Haiku만 사용.
 blog 드래프트에서 Solar Open2, GLM 5.2 사용.
LYO 파이프라인에서도 최소 2개 모델 패밀리로 실행.

### L3. Ashby coverage 지표 추적

§9: Coverage = (observed failure classes) / (classes with active lessons).
목표: 3/3 이상. 현재 1/1 → 의미 없음.

---

## 하지 말아야 할 것

- **Shapley/leave-one-out coalition credit** (COCOA가 의도적으로 회피, §4)
- **Full WCS rung-3 SCM replay** — 환경 모델 없음, 모델 오지정 편향 위험 (§4)
- **Cycle-distance credit decay** — COCOA Eq.1 critique (§4)
- **프러즈 레슨을 vehicles of first resort로 사용** — 블로그 드래프트의 핵심 교훈.
  skeleton-patch / spec-constraint 차량을 먼저 고려.
