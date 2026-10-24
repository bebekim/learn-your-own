/**
 * Infer which finding activities an agent action belongs to, using calibrated typed
 * decisions. A decision only gates eligibility for ordinary delivery; it is never
 * outcome evidence. Each request sends the rendered action to the provider.
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import type { TypedDecisionProvider } from '../application/typed-decisions.ts';
import { noulVerdict, type TypedQuestion } from '../domain/typed-decision.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { resolveSessionLessonStorePath } from '../selection/session-hook.ts';
import { jevProvider } from './jev.ts';

const ACTION_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash']);
const TRANSCRIPT_TAIL_BYTES = 512 * 1024;

const calibrationSchema = z.object({
  // Thresholds are only trusted after enough labelled cases of both kinds.
  positives: z.number().int().min(20), negatives: z.number().int().min(20),
  heldOut: z.string().min(1), evidence: z.string().min(1),
}).strict();

export const actionScopeConfigSchema = z.object({
  provider: z.literal('typesafe-jev'),
  model: z.string().min(1).optional(),
  baseUrl: z.url().optional(),
  apiKeyEnvFile: z.string().min(1).optional(),
  maxCallsPerSession: z.number().int().min(1).max(200).default(30),
  timeoutMs: z.number().int().min(100).max(10000).default(1500),
  activities: z.partialRecord(z.enum(['transfer-review', 'experiment-design', 'learning-budget']), z.object({
    question: z.object({ type: z.literal('noul'), instructions: z.unknown(),
      criteria: z.object({ true: z.unknown().optional(), false: z.unknown().optional() }).optional() }).strict(),
    band: z.object({ no: z.number().min(0).max(1), yes: z.number().min(0).max(1) }).strict()
      .refine(band => band.no < band.yes, 'band requires no < yes'),
    calibration: calibrationSchema,
  }).strict()),
}).strict();
export type ActionScopeConfig = z.infer<typeof actionScopeConfigSchema>;

export interface ActionState {
  agent_plan: string;
  tool: string;
  change: Record<string, unknown>;
}

const cut = (value: unknown, n: number) => { const s = String(value ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s; };

/** The calibration format; changing it invalidates the calibrated thresholds. */
export function actionChange(tool: string, input: Record<string, any>): Record<string, unknown> {
  return tool === 'Bash' ? { command: cut(input.command, 600), description: cut(input.description, 200) }
    : tool === 'Write' ? { file: input.file_path, content: cut(input.content, 700) }
    : tool === 'MultiEdit' ? { file: input.file_path, edits: (input.edits ?? []).slice(0, 2).map((edit: any) => ({ old: cut(edit.old_string, 250), new: cut(edit.new_string, 250) })) }
    : { file: input.file_path ?? input.notebook_path, old: cut(input.old_string, 350), new: cut(input.new_string ?? input.new_source, 350) };
}

export function renderActionState(state: ActionState): string {
  const c = state.change as Record<string, any>;
  return [`Agent plan: ${state.agent_plan || '(none)'}`, `Tool: ${state.tool}`,
    c.command !== undefined ? `Command: ${c.command}\nDescription: ${c.description || ''}`
      : `File: ${c.file}\n` + (c.content !== undefined ? `Content: ${c.content}` : c.edits ? `Edits: ${JSON.stringify(c.edits)}` : `Replace: ${c.old}\nWith: ${c.new}`)].join('\n');
}

/** The latest assistant text before this tool call in the current turn, read from the transcript tail. */
export function agentPlan(transcriptPath: unknown, toolUseId: unknown): string {
  if (typeof transcriptPath !== 'string' || !existsSync(transcriptPath)) return '';
  const size = statSync(transcriptPath).size, start = Math.max(0, size - TRANSCRIPT_TAIL_BYTES);
  const buffer = Buffer.alloc(size - start), fd = openSync(transcriptPath, 'r');
  try { readSync(fd, buffer, 0, buffer.length, start); } finally { closeSync(fd); }
  let plan = '', found: string | null = null;
  for (const line of buffer.toString('utf8').split('\n')) {
    let row: any; try { row = JSON.parse(line); } catch { continue; }
    if (row?.type === 'user' && typeof row.message?.content === 'string') plan = '';
    if (row?.type !== 'assistant' || !Array.isArray(row.message?.content)) continue;
    for (const block of row.message.content) {
      if (block?.type === 'text' && block.text?.trim()) plan = block.text.trim();
      if (block?.type === 'tool_use' && block.id === toolUseId) found = plan;
    }
  }
  return cut(found ?? plan, 700);
}

export function loadActionScopeConfig(env: NodeJS.ProcessEnv): ActionScopeConfig | null {
  const path = env.LYO_ACTION_SCOPE_FILE;
  if (!path || !existsSync(path)) return null;
  return actionScopeConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export interface ActionScopeResult {
  activities: string[];
  decisions: Array<{ activity: string; noul: number; verdict: 'yes' | 'no' | 'unknown'; reused: boolean }>;
  scope: Record<string, unknown>;
}

/**
 * Ask once per (session, agent plan, activity set); reuse that verdict for later actions under
 * the same plan. Stop asking after the per-session cap. Failures leave the activity unknown.
 */
export async function decideActionScope(event: Record<string, any>, env: NodeJS.ProcessEnv,
  deps: { provider?: TypedDecisionProvider; config?: ActionScopeConfig | null } = {}): Promise<ActionScopeResult | null> {
  if (event.hook_event_name !== 'PostToolUse' || !ACTION_TOOLS.has(event.tool_name)) return null;
  const sessionId = typeof event.session_id === 'string' ? event.session_id : '', cwd = typeof event.cwd === 'string' ? event.cwd : '';
  if (!sessionId || !cwd) return null;
  const config = deps.config === undefined ? loadActionScopeConfig(env) : deps.config;
  const storePath = resolveSessionLessonStorePath(cwd);
  if (!config || !storePath || !Object.keys(config.activities).length) return null;

  const state: ActionState = { agent_plan: agentPlan(event.transcript_path, event.tool_use_id), tool: event.tool_name,
    change: actionChange(event.tool_name, event.tool_input ?? {}) };
  const questions = Object.fromEntries(Object.entries(config.activities).map(([name, entry]) => [name, entry.question as TypedQuestion]));
  const questionsHash = hashValue(questions), planHash = hashValue([state.agent_plan, questionsHash]);
  const store = new LessonStore(storePath);
  try {
    const prior = store.db.prepare(`SELECT payload_json FROM learning_trace WHERE run_id = ? AND kind = 'behavior'
      AND json_extract(payload_json, '$.source') = 'action-scope-decision@1'`).all(sessionId)
      .map(row => JSON.parse(String(row.payload_json)));
    const reused = prior.find(row => row.planHash === planHash);
    let answers: Record<string, number>, decisionRef: string;
    if (reused) { answers = reused.answers; decisionRef = reused.decisionId; }
    else {
      if (prior.length >= config.maxCallsPerSession) return null;
      const envFile = config.apiKeyEnvFile?.replace(/^~(?=\/)/, homedir());
      if (envFile && !env.TYPESAFE_API_KEY && existsSync(envFile)) process.loadEnvFile(envFile);
      const apiKey = env.TYPESAFE_API_KEY ?? env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
      const provider = deps.provider ?? (apiKey ? jevProvider({ apiKey, model: config.model, baseUrl: config.baseUrl, maxRetries: 0 }) : null);
      if (!provider) return null;
      const record = await provider.decide({ state: renderActionState(state), questions }, { timeoutMs: config.timeoutMs });
      answers = Object.fromEntries(Object.entries(record.answers).map(([name, answer]) => [name, answer.type === 'noul' ? answer.noul : NaN]));
      decisionRef = `action-scope-decision:${hashValue([sessionId, planHash, record.requestHash])}`;
      // Hashes and scores only: neither the plan nor the change is retained.
      store.recordTrace({ trace_id: decisionRef, run_id: sessionId, kind: 'behavior',
        summary: 'Inferred action activity for eligibility; not outcome evidence.',
        payload: { source: 'action-scope-decision@1', decisionId: decisionRef, planHash, questionsHash, requestHash: record.requestHash,
          answeredModel: record.answeredModel, usage: record.usage, tool: state.tool, answers,
          bands: Object.fromEntries(Object.entries(config.activities).map(([name, entry]) => [name, entry.band])) } });
    }
    const decisions = Object.entries(config.activities).map(([activity, entry]) => {
      const noul = answers[activity];
      return { activity, noul, reused: Boolean(reused),
        verdict: Number.isFinite(noul) ? noulVerdict({ type: 'noul', noul }, entry.band) : 'unknown' as const };
    });
    return { activities: decisions.filter(row => row.verdict === 'yes').map(row => row.activity), decisions,
      scope: { source: 'action-scope@1', decisionRef, planHash, decisions } };
  } finally { store.close(); }
}
