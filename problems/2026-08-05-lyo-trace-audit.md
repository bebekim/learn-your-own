# LYO Trace Audit — 2026-08-05

## 한 줄 결론

**훅 캡처는 잘 되고 있다. 학습 파이프라인은 dogfood에서만 한 번 돌았고, 실제 작업 저장소 두 곳에서는 처음부터 꺼져 있었다.** 두 저장소의 `learning.sqlite`는 28개 테이블이 모두 비어 있고, `hook_events`만 채워져 있다 — 훅→잡화(materialize) 레이어는 작동하지만, `runs`·`learning_traces`·`outcomes`를 생성하는 파이프라인 레이어는 호출된 적이 없다.

---

## 1. 확인된 사실

### 1.1 세 저장소의 현황

| 저장소 | `learning.sqlite` 위치 | 테이블 수 | 행 있는 테이블 | 학습 파이프라인 실행 이력 |
|--------|----------------------|-----------|----------------|--------------------------|
| `agent-learning-workflow/dogfood/scratch-project/.zeroshot/lyo-lessons.db` (구시스템, v3) | 있음 | 6 | `lesson`=1, `lesson_application`=4, `lesson_decision`=2, `lesson_delta`=8 | 있음 — `lyo pipeline run` + `lyo pipeline learn`이 `run-loop.sh`로 실행됨 |
| `nectr_data_eng-crystalbrooks-env/.agent-learning/learning.sqlite` (신시스템, 0.3.0) | 있음 | 28 | `hook_events`=1813, `jobs`=2, `hook_normalizations`=1813, 나머지 25개 테이블 = 0 | 없음 |
| `nectr-data-lake-rep-744/.agent-learning/learning.sqlite` (신시스템, 0.3.0) | 있음 | 28 | `hook_events`=1185, `jobs`=1, `hook_normalizations`=1185, 나머지 25개 테이블 = 0 | 없음 |

### 1.2 dogfood의 전체 체인이 한 번 돈 사례

`dogfood/run-loop.sh`는 다음 순서로 실행한다:

```
S1: lyo pipeline run --plan csv-task/plan.json --runs-root csv-task/runs     → baseline run 1
S2: lyo pipeline run --plan csv-task/plan.json --runs-root csv-task/runs     → baseline run 2
LEARN: lyo pipeline learn --run <prior>,S1,S2 --judge-model claude-sonnet-5 --library csv-task/lessons
S3: lyo pipeline run --plan csv-task/plan.json --runs-root csv-task/runs --lessons csv-task/lessons  → treatment run
COMPARE: lyo pipeline compare --baseline S1 --treatment S3
```

이 체인의 결과물이 `dogfood/csv-task/runs/run-20260726-054220-efa594/` 아래에 실제로 있다:

- `trace.json` — 스테이지별 입력/출력 manifest, 모델, 프롬프트 해시, 시각
- `verifier-report.json` — 12개 테스트 중 8 pass / 4 fail, `outcome: "fail"`
- `lyo-update.json` — 3개 trace 기반, 2개 promotion (test-hallucination, spec-gap), belief updates
- `lyo-lessons/` — 4개의 lesson Markdown 파일
- `plan.json` + `spec.json` — 작업 정의

구시스템 DB(`lyo-lessons.db`)에는 lesson 1개(`les_9c2a1904eab29b03`)만 들어 있다. 이건 dogfood의 `run.cjs`가 생성한 것으로, `run-loop.sh` 체인과는 **별개의 실험**이다. `run.cjs`는 ZEROSHOT_LYO_STORE_PATH로 `.zeroshot/lyo-lessons.db`를 가리키고, Orchestrator를 직접 구동해 validator reject→lesson CREATE→injection→approval→helpful 마킹까지를 2회 시연한 스크립트다.

dogfood의 lesson 파일 5개는 `--library` 경로로 `--pipeline learn`이 생성한 Markdown들이고, 구시스템 DB에는 `run.cjs`가 만든 `les_9c2a1904eab29b03` 하나만 있다. 둘은 서로 다른 코드 경로에서 생성된 별개의 레슨이다.

### 1.3 신시스템 DB 두 개에 데이터가 없는 이유

**훅 이벤트 자체는 캡처되고 있다.** 두 저장소 모두 `hook_events`에 행이 있다:

- crystalbrooks: 1813건, `event_name` = `tool.after`, `PostToolUse`, 세션 ID 있음
- data-lake: 1185건, 동일 패턴

`jobs`에도 crystalbrooks 2건, data-lake 1건이 있다. `hook_normalizations`도 같은 수를 채워져 있다. 즉 **훅 캡처 → 잡 생성 → 정규화까지의 파이프라인은 작동 중**이다.

하지만 `runs`·`learning_traces`·`outcomes`를 만드는 경로는 전혀 호출되지 않았다. 이 테이블들을 채우는 것은 `lyo pipeline run` 명령어다. **두 저장소에서 `lyo pipeline run`이 실행된 적이 없다.**

원인: 두 저장소 모두 `.claude/settings.json`이 없다. 전역 `~/.claude/settings.json`의 `SessionStart` 훅은 `node /Users/marcus.kim/repositories/individual/agent-learning-workflow/src/lyo/session-hook.ts`만 실행한다. 이 훅은 **읽기 전용** — 레슨을 stdout에 찍을 뿐, DB에 쓰지 않는다. 실제 DB 쓰기 명령어는 `lyo claude-hook`인데, 이건 Claude Code 훅 설정에서 호출되지 않는다.

정리하면:

1. 전역 SessionStart 훅이 모든 저장소에서 실행됨 → `session-hook.ts`는 읽기 전용이라 DB에 아무것도 안 씀
2. `lyo claude-hook` 명령어는 존재하지만 Claude Code 훅 설정에 등록돼 있지 않음 → 훅 이벤트가 DB에 누적되지 않음
3. crystalbrooks/data-lake의 `hook_events`에 데이터가 있는 이유는 별도 경로로 들어온 것 — 후술
4. `lyo pipeline run`이 두 저장소에서 실행된 적이 없음 → `runs`, `learning_traces`, `outcomes` 공란

### 1.4 crystalbrooks/data-lake의 hook_events는 어디서 왔는가

crystalbrooks의 `hook_events` 샘플 행을 보면 `lyo_version = "0.3.0"`, `event_name = "tool.after"`, 페이로드에 `_lyo` 필드가 포함돼 있다. 이건 `lyo claude-hook` 경로가 아니라 `session-hook.ts`가 쓰는 패턴과도 다르다. **확인 필요**: 이 hook_events를 생성한 실제 명령어가 무엇인지. 가능성:

- `lyo-session-hook`이 특정 조건에서 DB 쓰기를 하는지 (현재는 읽기 전용으로 알려져 있음)
- 별도의 훅 설정이나 래퍼 스크립트가 있었는지
- 이전에 `lyo claude-hook`이 등록되어 있었다가 제거됐는지

이 부분은 추가 조사가 필요하다.

### 1.5 구시스템과 신시스템의 관계

dogfood의 `.zeroshot/lyo-lessons.db`(구시스템, v3 스키마, 6개 테이블)와 두 nectr 저장소의 `.agent-learning/learning.sqlite`(신시스템, 0.3.0, 28개 테이블)는 **서로 다른 스키마, 서로 다른 코드 경로**다.

- 구시스템: `lesson`, `lesson_application`, `lesson_decision`, `lesson_delta`, `learning_trace`, `preference_pair`
- 신시스템: `runs`, `gaps`, `protocols`, `learning_traces`, `preference_pairs`, `hook_events`, `jobs`, `zones`, `outcomes` 등 28개

**구시스템의 데이터가 신시스템으로 migrated된 적이 있는지 확인 안 됨.** dogfood의 lesson 1개(`les_9c2a1904eab29b03`)가 신시스템 DB에 있는지 여부도 확인 안 됨.

---

## 2. 무엇이 빠졌는가 (dogfood에서 있고 두 저장소에는 없는 것)

### 2.1 파이프라인 실행 자체

`lyo pipeline run`이 생성한 산출물 전체:

- `plan.json` / `spec.json` — 작업 정의
- `trace.json` — 스테이지별 입출력, 모델, 프롬프트 해시, 시각
- `verifier-report.json` — 테스트 실행 결과
- `lyo-update.json` — trace 기반 레슨 promotion 결정
- `lyo-lessons/*.md` — promotion된 레슨 아티팩트
- `artifacts/code/`, `artifacts/tests/` — 생성된 코드/테스트

이 전체 체인이 dogfood에는 있고, 두 작업 저장소에는 없다.

### 2.2 레슨 라이브러리

dogfood에는 `--library` 경로가 있고, 여기에 생성된 레슨 마크다운이 저장된다. 두 작업 저장소에는 레슨 라이브러리 디렉토리 자체가 없다.

### 2.3 파이프라인→DB 연결

dogfood 구시스템 DB의 `lesson` 행(`les_9c2a1904eab29b03`)은 `run.cjs`가 만든 것이고, `run-loop.sh` 체인의 레슨 파일 5개는 DB에 들어가지 않았다 (파일 시스템에만 존재). 신시스템에서 `lyo pipeline learn`이 `learning_traces`→`outcomes`→레슨으로 이어지는 경로가 실제로 데이터가 흐른 적이 없다.

---

## 3. 교훈 정리

### 3.1 기계적 교훈

1. **훅 캡처와 학습 파이프라인은 별도 시스템.** 훅→잡→정규화는 현재 작동 중이지만, `runs`·`learning_traces`·`outcomes`는 `lyo pipeline run`이 필요하다. 둘은 같은 DB를 보지만 서로 다른 명령어로 구동된다.

2. **전역 SessionStart 훅은 읽기 전용.** `session-hook.ts`는 레슨을 stdout에 출력할 뿐 DB에 쓰지 않는다. Claude Code 훅 설정에서 `lyo claude-hook`을 호출하도록 등록하지 않으면 훅 이벤트가 DB에 누적되지 않는다. (그런데 crystalbrooks/data-lake에는 hook_events가 있으니 이 가설은 부분적이다 — 확인 필요.)

3. **dogfood는 완전한 작동 사례가 한 번 있다.** `run-loop.sh` 전체를 돌리면 trace→learn→treatment→compare까지 된다. 이 패턴을 작업 저장소로 가져오면 된다.

### 3.2 구조적 교훈

4. **dogfood와 작업 저장소의 차이 = 계획과 실행 환경.** dogfood는 `plan.json` + `spec.json` + npm 테스트 환경이 갖춰져 있다. 작업 저장소에서 `lyo pipeline run`을 돌리려면 같은 준비가 필요하다.

5. **구시스템과 신시스템은 별개.** dogfood의 `.zeroshot/lyo-lessons.db` 데이터는 신시스템 `.agent-learning/learning.sqlite`로 이관된 적 없다. 두 시스템을 같은 선상에서 비교하거나 통합하려는 시도는 아직 이뤄지지 않았다.

6. **훅→run 연결 고리가 끊겨 있음.** hook_events는 캡처되지만, 그게 `runs` 테이블로 이어지는 경로가 실행되지 않았다. hook_events의 session_id가 runs의 run_id와 어떻게 연결되는지, 연결 자체가 설계돼 있는지도 확인 필요.

---

## 4. 추가 조사 필요 사항

### 4.1 즉시 확인

- [ ] crystalbrooks/data-lake의 `hook_events`를 생성한 실제 명령어는 무엇인가 — `session-hook.ts`가 특정 조건에서 DB 쓰기를 하는지, 아니면 별도 훅/스크립트가 있었는지
- [ ] `lyo pipeline run`이 `runs` 테이블에 INSERT하는 코드 경로 확인 — `src/cli/runner.ts` → `run-pipeline.ts` → `recordRun` 호출 여부
- [ ] `lyo pipeline learn`이 `learning_traces`를 `outcomes`로 변환하는 경로 — `src/lyo/trace-consumer.ts` `consumeTraces` 전체
- [ ] dogfood의 lesson 1개(`les_9c2a1904eab29b03`)가 신시스템 DB에 존재하는지

### 4.2 구조적 질문

- [ ] hook_events의 session_id와 runs의 run_id 사이에 연결이 설계돼 있는가 — 있으면 어떤 경로로
- [ ] `lyo init`이 spool dir를 등록하는 방식과, 실제 spool dir가 두 작업 저장소에 설정돼 있었는지
- [ ] 구시스템 → 신시스템 migration이 계획된 적 있는지, 그렇다면 어떤 데이터가 이관 대상이었는지

### 4.3 볼륨 확대 실행

- [ ] dogfood 패턴을 참고해 작업 저장소 하나에서 `lyo pipeline run`을 돌리는 데 필요한 최소 조건 확인 — plan.json, spec.json, 테스트 러너(npm/pytest) 환경
- [ ] 작업 저장소에 레슨 라이브러리 디렉토리를 만들고 `lyo pipeline learn`을 실행하는 전체 체인 시험
