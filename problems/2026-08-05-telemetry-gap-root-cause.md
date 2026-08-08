# LYO telemetry gap — root cause

**발견일:** 2026-08-05  
**상태:** 확인 완료

## 핵심 발견

3개 instrumented repo 중 2개(`nectr_data_eng-crystalbrooks-env`, `nectr-data-lake-rep-744`)의
`.agent-learning/learning.sqlite`는 27개 테이블 전체 0행. 모든 신호는
`agent-learning-workflow/dogfood/scratch-project/.zeroshot/lyo-lessons.db`(구시스템 v3)에만 존재.

**원인: 파이프라인과 DB 기록이 아예 연결돼 있지 않다.**

## 증거

### 파이프라인 명령어 — DB 기록 없음

| 명령어 | 하는 일 | DB 기록 |
|--------|---------|---------|
| `lyo pipeline run` | `trace.json`, `verifier-report.json` 파일 작성, 실행 결과 반환 | **없음** — `recordRun()` 호출 안 함 |
| `lyo pipeline learn` | `lyo-update.json`, `lyo-analysis.md`, `lyo-lessons/*.md` 작성, lesson 마크다운 카운터 증가 | **없음** — `runs`, `learning_traces`, `outcomes` 테이블에 기록 안 함 |
| `lyo run-start --run-id --task-shape --channel` | `runs` 테이블에 행 삽입 | 있음 — 하지만 파이프라인이 자동 호출하지 않음 |

**소스 위치:**
- `src/runner/run-pipeline.ts:89` — `runPipeline()`은 `recordRun()`을 호출하지 않음
- `src/cli/commands/pipeline.ts:24-40` — `pipelineRunCommand`는 `runPipeline()` 결과만 반환
- `src/reducers/core.ts:30` — `recordRun()`은 `lyo run-start` 명령어로만 호출 가능
- `src/lyo/trace-consumer.ts:279` — `consumeTraces()`는 lesson 파일과 lyo-update만 작성

### Claude Code 훅 — observation 테이블만 채움

`lyo claude-hook --db-from-event-cwd`:
- `handleClaudeHook()` → `claudeHookObservation()` → `persistHookObservation()`
- 기록되는 테이블: `hook_events`, `hook_normalizations`, `agent_sessions`, `session_prompts`, `jobs`, `path_activations`, `command_activations`, `workspaces`
- **호출하지 않는 것:** `resolveProtocol()`, `recordRun()`, `recordTrace()`
- `src/lyo/runtime.ts:146`에서 확인

### work repo들의 hook_events 데이터

| Repo | hook_events | agent_sessions | session_prompts | runs |
|------|-------------|----------------|-----------------|------|
| nectr_data_eng-crystalbrooks-env | 1977 | 2 (platform=claude) | 0 | 0 |
| nectr-data-lake-rep-744 | 1575 | 1 | 0 | 0 |
| agent-learning-workflow | 소량 | — | — | 3 (모두 5-6월 구기록) |

두 work repo의 hook_events는 `_lyo.runtime = "claude"` — Claude Code 훅이 쓴 것.
프로젝트 레벨 `.claude/settings.json`은 두 repo 모두에 **없음** (glob 확인 완료).
전역 `~/.claude/settings.json`의 SessionStart 훅(`session-hook.ts`)이 관여했을 가능성.

### dogfood 구시스템(v3) DB

`dogfood/scratch-project/.zeroshot/lyo-lessons.db`:
- 별도 파일명 `lyo-lessons.db` → 구시스템
- 테이블: `lesson_delta` 8건, `lesson` 1건, `lesson_application` 4건, `lesson_decision` 2건
- `learning_trace` = 0 (구시스템은 trace 경유 없이 레슨 직접 저장)
- **신시스템 `.agent-learning/learning.sqlite`에는 dogfood 실행조차 기록 없음**

## 왜 이런 설계가 됐나

두 파이프라인이 처음부터 분리돼 있다:

1. **훅 캡처 파이프라인** — Claude/Codex 실행 중 이벤트를 실시간 캡처. observation 테이블에 저장.
   목적: "무엇이 일어났는지" 기록.

2. **학습 파이프라인** — `plan.json` + `spec.json` 필요. 코드/테스트 작성자 실행 → verifier 실행 →
   `trace.json` + `verifier-report.json` 생성 → `lyo pipeline learn`으로 레슨 추출.
   목적: "무엇을 배웠는지" 기록.

두 파이프라인 사이에 다리가 없다. hook_events가 "Claude Code 세션이 이 repo에서 실행됐다"를 기록해도,
그 세션이 `lyo pipeline run`을 실행하지 않으면 학습 데이터는 0이다.

## 결론

**학습 데이터가 없는 이유는 버그가 아니라 설계상 연결 누락이다.** 파이프라인 자체가 DB에 기록하지 않고,
Claude Code 훅도 파이프라인을 발동시키지 않는다. 기록되려면 누군가 명시적으로 `lyo pipeline run` +
`lyo run-start` + `lyo pipeline learn`을 실행해야 한다. dogfood를 제외하면 그런 실행이 없었다.

## 이 파일을 쓴 이유

"이러다 다시 이런 일이 일어나면 안 된다"는 문제의식. volume을 늘리려면 먼저 무엇이 기록되고
무엇이 기록되지 않는지 정확히 알아야 한다.
