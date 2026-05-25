import type { LearningKernel } from '../ledger.ts';
import {
  optionalRow,
  requiredRow,
} from '../db/rows.ts';
import type {
  ObserverSummary,
  PromptBoundaryRecord,
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
  SessionRecord,
} from '../types/observation.ts';
import {
  getModelCallSummary,
  getPreferenceSummary,
} from './core.ts';
import { getCredit } from './protocols.ts';
import {
  countRows,
  ISO_NOW,
  requireFields,
  sha256,
  summarize,
} from './shared.ts';

export function recordSessionStarted(kernel: LearningKernel, input: RecordSessionStartedInput): SessionRecord {
  requireFields(input, ['sessionId']);
  kernel.db.prepare(`
    insert into agent_sessions (
      session_id, workspace_scope, repo_path, branch, platform, model, started_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(session_id) do update set
      workspace_scope = excluded.workspace_scope,
      repo_path = coalesce(excluded.repo_path, agent_sessions.repo_path),
      branch = coalesce(excluded.branch, agent_sessions.branch),
      platform = excluded.platform,
      model = coalesce(excluded.model, agent_sessions.model),
      updated_at = excluded.updated_at
  `).run(
    input.sessionId,
    input.workspaceScope ?? 'local',
    input.repoPath ?? null,
    input.branch ?? null,
    input.platform ?? 'agent',
    input.model ?? null,
    ISO_NOW(),
    ISO_NOW()
  );
  return requiredRow<SessionRecord>(getSession(kernel, input.sessionId), `session was not recorded: ${input.sessionId}`);
}

export function recordPromptBoundary(kernel: LearningKernel, input: RecordPromptBoundaryInput): PromptBoundaryRecord {
  requireFields(input, ['sessionId', 'role', 'kind']);
  ensureSession(kernel, input.sessionId);
  const promptIndex = nextPromptIndex(kernel, input.sessionId);
  const promptId = `${input.sessionId}:prompt:${promptIndex}`;
  const promptSha = input.promptText === undefined ? input.promptHash ?? null : sha256(input.promptText);
  const promptLengthValue = input.promptText === undefined ? input.promptLength : input.promptText.length;
  const promptLength = typeof promptLengthValue === 'number' ? ` length=${promptLengthValue}` : '';
  const promptSummary = input.summary ?? (input.promptText ? summarize(input.promptText) : '');
  kernel.db.prepare(`
    insert into session_prompts (
      prompt_id, session_id, run_id, turn_id, prompt_index, prompt_role,
      prompt_kind, prompt_sha256, prompt_ref, prompt_summary, response_summary,
      model, recorded_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    promptId,
    input.sessionId,
    input.runId ?? null,
    input.turnId ?? null,
    promptIndex,
    input.role,
    input.kind,
    promptSha,
    input.promptRef ?? null,
    `${promptSummary}${promptLength}`.trim(),
    input.responseSummary ?? null,
    input.model ?? null,
    ISO_NOW()
  );
  return {
    promptId,
    sessionId: input.sessionId,
    promptIndex,
    promptRole: input.role,
    promptKind: input.kind,
  };
}

export function getObserverSummary(kernel: LearningKernel): ObserverSummary {
  const sessions = countRows(kernel, 'agent_sessions');
  const promptBoundaries = countRows(kernel, 'session_prompts');
  const hookEvents = countRows(kernel, 'hook_events');
  const modelCallSummary = getModelCallSummary(kernel);
  const runs = countRows(kernel, 'runs');
  const preferenceSummary = getPreferenceSummary(kernel);
  const activeProtocols = requiredRow<{ count: number }>(kernel.db.prepare(`
    select count(*) as count from protocols where status = 'active'
  `).get(), 'active protocol count query returned no row');
  return {
    sessions,
    promptBoundaries,
    hookEvents,
    modelCalls: modelCallSummary.modelCalls,
    totalModelTokens: modelCallSummary.totalModelTokens,
    estimatedModelCost: modelCallSummary.estimatedModelCost,
    runs,
    traces: preferenceSummary.traces,
    preferencePairs: preferenceSummary.preferencePairs,
    activeProtocols: activeProtocols.count,
    adaptiveCredit: getCredit(kernel).adaptiveCredit,
  };
}

export function getSession(kernel: LearningKernel, sessionId: string): SessionRecord | undefined {
  return optionalRow<SessionRecord>(kernel.db.prepare(`
    select
      session_id as sessionId,
      workspace_scope as workspaceScope,
      repo_path as repoPath,
      branch,
      platform,
      model
    from agent_sessions
    where session_id = ?
  `).get(sessionId));
}

function ensureSession(kernel: LearningKernel, sessionId: string): SessionRecord {
  const session = getSession(kernel, sessionId);
  if (session) return session;
  return recordSessionStarted(kernel, { sessionId });
}

function nextPromptIndex(kernel: LearningKernel, sessionId: string): number {
  const row = kernel.db.prepare(`
    select count(*) as count
    from session_prompts
    where session_id = ?
  `).get(sessionId) as { count: number };
  return row.count;
}
