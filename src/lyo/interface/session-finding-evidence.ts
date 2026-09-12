import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import { runLocalEpisode } from '../../eval/live-runner.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { findingActionEvidence, findingEvidenceTrace, findingOpportunity, inputSchema,
  measurementSchema, opportunitySchema, resolveFindingEvidence } from '../storage/finding-evidence.ts';
import type { Opportunity } from '../storage/finding-evidence.ts';
import { findingFiles as files } from '../storage/finding-files.ts';
import { findingState } from './session-findings.ts';

export { findingAssignment, findingOpportunity, findingOpportunityDelivery, inputSchema,
  inspectFindingOpportunities, resolveFindingEvidence } from '../storage/finding-evidence.ts';
export type { Opportunity } from '../storage/finding-evidence.ts';

const text = z.string().trim().min(1).max(2000);

function check(input: Opportunity['input'], command: string) {
  const result = runLocalEpisode({ cwd: input.cwd, baselineId: 'B0', model: 'none', harness: 'finding-evidence@1', task: {
    task_id: input.taskId, split: 'train', repo_ref: { kind: 'declared-files', ref: input.id }, prompt: input.claim.prediction,
    allowed_tools: ['shell'], expected_touched_paths: [], tags: [],
    budget: { max_tokens: 1, max_turns: 1, max_wall_time_seconds: input.capture ? Math.min(input.timeoutSeconds, 1) : input.timeoutSeconds }, success_check: { kind: 'command', command },
  } });
  let satisfied: boolean | null = null;
  // A failed command is a broken evaluator, not a counterexample to the advice.
  if (result.verifier_evidence.exit_code === 0) {
    try { satisfied = z.object({ satisfied: z.boolean().nullable() }).strict().parse(JSON.parse(result.verifier_evidence.stdout)).satisfied; }
    catch { /* Malformed or incomplete evaluator output remains unknown. */ }
  }
  const { kind: _kind, ...evidence } = result.verifier_evidence;
  return { ...evidence, satisfied };
}

function registrationContext(store: LessonStore, input: Opportunity['input']) {
  const current = findingState(store.db, input.findingId);
  if (current.validity === 'needs-revision' || current.validity === 'needs-reassessment')
    throw new Error('finding is suspended; review current evidence before starting another application');
  if (input.prospective) {
    if (input.prospective.findingVersion !== current.version) throw new Error('prospective opportunity requires the current finding version');
    if (input.claim.action !== current.finding.intervention) throw new Error('registered action must match the current finding advice');
    return { version: current.version, context: input.prospective.context, sessionId: input.prospective.sessionId };
  }
  const delivery = store.getTrace(input.deliveryId!);
  const payload = JSON.parse(delivery?.payload_json ?? '{}');
  const finding = payload.findings?.find((f: { id: string }) => f.id === input.findingId);
  if (delivery?.kind !== 'protocol_application' || !delivery.run_id || !finding?.version || !finding.context
    || !payload.cwd || realpathSync(payload.cwd) !== input.cwd) throw new Error('opportunity requires this finding delivery in the same workspace');
  if (current.version !== finding.version) throw new Error('application requires a delivery of the current finding version');
  if (input.claim.action !== finding.intervention) throw new Error('registered action must match the delivered advice');
  return { version: finding.version as string, context: finding.context, sessionId: delivery.run_id };
}

function retain(store: LessonStore, id: string, sessionId: string, source: string, content: unknown) {
  store.recordTrace({ trace_id: id, run_id: sessionId, kind: 'behavior', summary: 'Registered finding check evidence.',
    payload: { source, content, hash: hashValue(content) } });
}

export function registerFindingOpportunity(store: LessonStore, value: unknown) {
  const input = inputSchema.parse(value);
  input.cwd = realpathSync(input.cwd);
  input.verifierFiles = [...new Set(input.verifierFiles.map(path => resolve(input.cwd, path)))];
  input.sourceFiles = [...new Set(input.sourceFiles.map(path => resolve(input.cwd, path)))];
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (store.getTrace(`finding-opportunity:${input.id}`)) {
      const prior = findingOpportunity(store.db, input.id);
      if (hashValue(prior.content.input) !== hashValue(input)) throw new Error('conflicting finding opportunity identity');
      store.db.exec('COMMIT');
      return prior.content;
    }
    const context = registrationContext(store, input);
    const verifierFiles = files(input.verifierFiles), sourceBefore = files(input.sourceFiles);
    if (verifierFiles.some(file => file.content === null)) throw new Error('registered verifier file is missing');
    const applicability = check(input, input.checks.applicability), adherenceBefore = check(input, input.checks.adherence);
    const problems = hashValue([verifierFiles, sourceBefore]) === hashValue([files(input.verifierFiles), files(input.sourceFiles)])
      ? [] : ['source or verifier changed during registration checks'];
    const content = opportunitySchema.parse({ input, ...context,
      verifierFiles, sourceBefore, applicability, adherenceBefore, problems });
    retain(store, `finding-opportunity:${input.id}`, context.sessionId,
      input.prospective ? 'session-finding-opportunity@2' : 'session-finding-opportunity@1', content);
    store.db.exec('COMMIT');
    return content;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function measureFindingOpportunity(store: LessonStore, id: string) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const registered = findingOpportunity(store.db, id);
    const evidenceId = `finding-evidence:${id}`;
    if (!store.getTrace(evidenceId)) {
      const { input } = registered.content;
      const sourceMeasured = files(input.sourceFiles), problems = [...registered.content.problems];
      const action = input.capture ? findingActionEvidence(store.db, registered) : null;
      if (action) {
        problems.push(...action.problems);
        if (hashValue(action.after?.sourceFiles) !== hashValue(sourceMeasured)) problems.push('source changed since the captured action');
      }
      if (hashValue(files(input.verifierFiles)) !== hashValue(registered.content.verifierFiles)) problems.push('registered verifier changed or disappeared');
      const adherence = problems.length ? null : check(input, input.checks.adherence);
      const prediction = problems.length ? null : check(input, input.checks.prediction);
      if (hashValue(files(input.verifierFiles)) !== hashValue(registered.content.verifierFiles)
        || hashValue(files(input.sourceFiles)) !== hashValue(sourceMeasured)) problems.push('source or verifier changed during measurement');
      const content = measurementSchema.parse({ opportunityId: id, opportunityHash: registered.payload.hash,
        sourceMeasured, adherence, prediction, problems });
      retain(store, evidenceId, registered.content.sessionId, 'session-finding-evidence@1', content);
    }
    const result = resolveFindingEvidence(store.db, evidenceId);
    store.db.exec('COMMIT');
    return result;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function withdrawFindingEvidence(store: LessonStore, value: unknown) {
  const input = z.object({ evidenceRef: text, author: text, rationale: text }).strict().parse(value);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const evidence = resolveFindingEvidence(store.db, input.evidenceRef);
    const id = `finding-evidence-withdrawal:${input.evidenceRef}`;
    const content = { ...input, evidenceHash: findingEvidenceTrace(store.db, input.evidenceRef).payload.hash };
    if (store.getTrace(id)) {
      if (hashValue(content) !== findingEvidenceTrace(store.db, id).payload.hash) throw new Error('conflicting finding evidence withdrawal');
    } else retain(store, id, evidence.opportunity.sessionId, 'session-finding-evidence-withdrawal@1', content);
    store.db.exec('COMMIT');
    return { id, ...content };
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
