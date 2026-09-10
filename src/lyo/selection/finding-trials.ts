import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import { safeToolStatusSignals } from '../../adapters/runtime.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { findingState } from './session-findings.ts';
import { inputSchema, registerFindingOpportunity } from './session-finding-evidence.ts';
import { semanticReviewSchema, reviewFindingSemantics } from './session-finding-semantics.ts';
import { assignFindingOpportunity, emitFindingOpportunity } from './finding-opportunities.ts';
import { findingFiles } from './session-finding-files.ts';

const text = z.string().trim().min(1).max(2000);
const measurementSchema = z.object({ claim: inputSchema.shape.claim, checks: inputSchema.shape.checks,
  sourceFiles: inputSchema.shape.sourceFiles, verifierFiles: inputSchema.shape.verifierFiles,
  evaluator: inputSchema.shape.evaluator, timeoutSeconds: inputSchema.shape.timeoutSeconds,
  capture: z.object({ toolName: text, next: z.literal(true) }).strict() }).strict();
const trialSchema = z.object({ id: text, findingId: text, findingVersion: text, roots: z.array(text).min(1), model: text,
  trigger: z.object({ toolName: text, toolInput: z.union([z.record(z.string(), z.unknown()), text]), result: z.literal('failure') }).strict(),
  measurement: measurementSchema,
  review: semanticReviewSchema.omit({ id: true, opportunityId: true, supersedes: true, verdict: true }),
}).strict();
type Trial = z.infer<typeof trialSchema>;

export function findingTrials(db: DatabaseSync) {
  return db.prepare(`SELECT payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-trial@1' ORDER BY rowid`)
    .all().map(row => {
      const receipt = JSON.parse(String(row.payload_json));
      if (receipt.hash !== hashValue(receipt.content)) throw new Error('invalid finding trial integrity');
      return { ...trialSchema.parse(receipt.content.input), hash: String(receipt.hash), verifierFiles: receipt.content.verifierFiles };
    });
}

export function registerFindingTrial(store: LessonStore, value: unknown) {
  const input = trialSchema.parse(value);
  input.roots = [...new Set(input.roots.map(root => realpathSync(root)))];
  const state = findingState(store.db, input.findingId);
  if (state.version !== input.findingVersion || ['needs-revision', 'needs-reassessment'].includes(state.validity))
    throw new Error('trial requires the current unsuspended finding version');
  if (input.measurement.claim.action !== state.finding.intervention || input.review.claimKind !== input.measurement.claim.kind)
    throw new Error('trial must preserve the finding action and declared claim kind');
  if (!input.measurement.verifierFiles.every(isAbsolute)) throw new Error('reusable trial verifiers require absolute paths');
  const verifierFiles = findingFiles(input.measurement.verifierFiles);
  if (verifierFiles.some(file => file.content === null)) throw new Error('trial verifier is missing');
  for (const basis of [input.review.applicability, input.review.adherence, input.review.prediction]) {
    if (!basis.verifierPaths.every(path => verifierFiles.some(file => file.path === path)))
      throw new Error('trial semantic review must cite retained verifiers');
  }
  const content = { input, verifierFiles }, receipt = { source: 'session-finding-trial@1', content, hash: hashValue(content) };
  const previous = store.getTrace(`finding-trial:${input.id}`);
  if (previous && hashValue(JSON.parse(previous.payload_json!)) !== hashValue(receipt)) throw new Error('trial definitions are immutable; use a new trial id');
  if (!previous) store.recordTrace({ trace_id: `finding-trial:${input.id}`, kind: 'behavior',
    summary: 'Reviewed prospective trial definition; usefulness remains unvalidated.', payload: receipt });
  return receipt;
}

function contains(root: string, cwd: string) {
  const path = relative(root, cwd);
  return path !== '..' && !path.startsWith('../') && !isAbsolute(path);
}

function registerOrdinaryOpportunity(store: LessonStore, trial: Trial & { hash: string }, runtime: 'codex' | 'claude', event: Record<string, any>, id: string) {
  const cwd = realpathSync(event.cwd), state = findingState(store.db, trial.findingId);
  const context = { repository: cwd, activity: state.finding.activity, match: 'activity' as const };
  registerFindingOpportunity(store, { ...trial.measurement, id, findingId: trial.findingId,
    taskId: `session:${event.session_id}`, cwd,
    sourceFiles: trial.measurement.sourceFiles.map(path => resolve(cwd, path)),
    capture: { ...trial.measurement.capture, runtime },
    prospective: { sessionId: event.session_id, trialId: trial.id, model: event.model,
      findingVersion: trial.findingVersion, context, automatic: { trialHash: trial.hash,
        trigger: { eventName: event.hook_event_name, toolUseId: event.tool_use_id,
          inputHash: hashValue(event.tool_input), responseHash: hashValue(event.tool_response ?? event.error ?? null) } } } });
  reviewFindingSemantics(store, { ...trial.review, id: `trial-review:${id}`, opportunityId: id, verdict: 'accepted' });
}

/** Runs on live, raw hook events; spool replay cannot discover prospective opportunities. */
export function ordinaryFindingTrialFeedback(runtime: 'codex' | 'claude', event: Record<string, any>, storePath: string | null,
  random = Math.random): { managed: boolean; additionalContext?: string } {
  if (!storePath || !event.session_id || !event.cwd || event.client_type === 'kimi_code_cli') return { managed: false };
  const db = new DatabaseSync(storePath, { readOnly: true });
  let definitions: ReturnType<typeof findingTrials>;
  try { definitions = findingTrials(db); } finally { db.close(); }
  if (!definitions.length) return { managed: false };
  const store = new LessonStore(storePath);
  try {
    const cwd = realpathSync(event.cwd);
    for (const trial of definitions) {
      const id = hashValue([trial.hash, runtime, event.session_id]);
      if (store.getTrace(`finding-opportunity:${id}`)) return { managed: true };
      if (!trial.roots.some(root => contains(root, cwd)) || event.model !== trial.model) continue;
      if (!['PostToolUse', 'PostToolUseFailure'].includes(event.hook_event_name)
        || event.is_interrupt === true || !event.tool_use_id
        || event.tool_name !== trial.trigger.toolName || hashValue(event.tool_input) !== hashValue(trial.trigger.toolInput)) continue;
      const status = safeToolStatusSignals(event.tool_response);
      if (!(typeof status.exit_code === 'number' && status.exit_code !== 0) && event.hook_event_name !== 'PostToolUseFailure') continue;
      const state = findingState(store.db, trial.findingId);
      if (state.version !== trial.findingVersion || ['needs-revision', 'needs-reassessment'].includes(state.validity)) continue;
      if (hashValue(findingFiles(trial.measurement.verifierFiles)) !== hashValue(trial.verifierFiles)) continue;
      registerOrdinaryOpportunity(store, trial, runtime, event, id);
      assignFindingOpportunity(store, id, random);
      let additionalContext = '';
      emitFindingOpportunity(store, id, text => { additionalContext += text; });
      return { managed: true, ...(additionalContext ? { additionalContext } : {}) };
    }
    return { managed: false };
  } finally { store.close(); }
}
