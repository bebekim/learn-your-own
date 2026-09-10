import { realpathSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import type { HookObservation } from '../../hooks/events.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { findingFiles } from './session-finding-files.ts';

const text = z.string().min(1);
export const captureSchema = z.object({ runtime: z.enum(['codex', 'claude']), toolName: text,
  toolInput: z.union([z.record(z.string(), z.unknown()), z.string()]) }).strict();
const filesSchema = z.array(z.object({ path: text, content: z.string().nullable() }).strict());
const boundarySchema = z.object({ source: z.literal('session-finding-action@1'), opportunityId: text, opportunityHash: text,
  eventId: text, runtime: text, sessionId: text, cwd: text, toolUseId: text, toolName: text, toolInputHash: text,
  eventName: text, sourceFiles: filesSchema, verifierFiles: filesSchema, responseHash: text.nullable(), hash: text }).strict();
type Registered = { content: { sessionId: string;
  input: { id: string; cwd: string; sourceFiles: string[]; verifierFiles: string[]; capture?: z.infer<typeof captureSchema> };
  sourceBefore: z.infer<typeof filesSchema>; verifierFiles: z.infer<typeof filesSchema> };
  payload: { hash: string } };

function boundary(db: DatabaseSync, id: string, phase: 'before' | 'after') {
  const row = db.prepare('SELECT rowid, payload_json FROM learning_trace WHERE trace_id = ?')
    .get(`finding-action:${id}:${phase}`);
  if (!row) return null;
  const receipt = boundarySchema.parse(JSON.parse(String(row.payload_json)));
  const { hash, ...content } = receipt;
  if (hash !== hashValue(content)) throw new Error('finding action integrity mismatch');
  return { ...receipt, rowid: Number(row.rowid) };
}

export function captureFindingAction(store: LessonStore, registered: Registered, event: HookObservation) {
  const { input, sessionId } = registered.content, capture = input.capture;
  const payload = event.hookEvent.payload as Record<string, unknown>;
  if (!capture || event.runtime !== capture.runtime || event.sessionId !== sessionId || realpathSync(event.cwd) !== input.cwd
    || payload.tool_name !== capture.toolName || hashValue(payload.tool_input) !== hashValue(capture.toolInput)
    || typeof payload.tool_use_id !== 'string' || !payload.tool_use_id) return;
  if (!['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event.runtimeEventName)) return;
  const phase = event.runtimeEventName === 'PreToolUse' ? 'before' : 'after';
  if (boundary(store.db, input.id, phase)) return;
  const before = boundary(store.db, input.id, 'before');
  if (before && before.toolUseId !== payload.tool_use_id) return;
  const content = { source: 'session-finding-action@1', opportunityId: input.id, opportunityHash: registered.payload.hash,
    eventId: event.hookEvent.eventId!, runtime: event.runtime, sessionId, cwd: input.cwd,
    toolUseId: payload.tool_use_id, toolName: capture.toolName, toolInputHash: hashValue(capture.toolInput),
    eventName: event.runtimeEventName, sourceFiles: findingFiles(input.sourceFiles), verifierFiles: findingFiles(input.verifierFiles),
    responseHash: phase === 'after' ? hashValue(payload.tool_response ?? payload.error ?? null) : null };
  store.recordTrace({ trace_id: `finding-action:${input.id}:${phase}`, run_id: sessionId, kind: 'behavior',
    summary: 'Live finding action boundary; no outcome inferred from tool status.', payload: { ...content, hash: hashValue(content) } });
}

export function findingActionEvidence(db: DatabaseSync, registered: Registered) {
  const { input } = registered.content;
  const before = boundary(db, input.id, 'before'), after = boundary(db, input.id, 'after');
  const problems: string[] = [];
  const registeredRow = db.prepare('SELECT rowid FROM learning_trace WHERE trace_id = ?').get(`finding-opportunity:${input.id}`)!;
  if (!before || !after || before.rowid <= Number(registeredRow.rowid) || before.rowid >= after.rowid)
    problems.push('missing or out-of-order live action boundaries');
  for (const receipt of [before, after]) {
    if (!receipt) continue;
    if (receipt.opportunityId !== input.id || receipt.opportunityHash !== registered.payload.hash
      || receipt.runtime !== input.capture?.runtime || receipt.sessionId !== registered.content.sessionId || receipt.cwd !== input.cwd
      || receipt.toolName !== input.capture.toolName || receipt.toolInputHash !== hashValue(input.capture.toolInput))
      problems.push('action belongs to another opportunity');
    if (hashValue(receipt.verifierFiles) !== hashValue(registered.content.verifierFiles)) problems.push('verifier changed at action boundary');
  }
  if (before && hashValue(before.sourceFiles) !== hashValue(registered.content.sourceBefore)) problems.push('source changed before the declared action');
  if (before && after && before.toolUseId !== after.toolUseId) problems.push('action call identity mismatch');
  if (after && after.eventName !== 'PostToolUse') problems.push('action did not complete normally');
  return { before, after, problems, hash: hashValue([before?.hash ?? null, after?.hash ?? null]) };
}
