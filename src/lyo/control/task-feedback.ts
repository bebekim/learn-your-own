import { realpathSync } from 'node:fs';
import type { LearningKernel } from '../../ledger.ts';
import { hashFile, hashValue } from '../../contract/refs.ts';
import { buildTaskReport, taskComparisonSchema, type TaskComparison } from '../../eval/task-report.ts';
import type { EvalEpisodeResult } from '../../eval/live-runner.ts';
import { FeedbackController } from './feedback-controller.ts';
import { registerTaskEvidence, taskMeasurement, taskRegistrationSchema, type TaskRecord, type TaskReceipt, type TaskPolicy, type TaskRegistration } from './task-evidence.ts';
import { getTaskIntervention, retainTaskIntervention, type TaskIntervention } from './task-intervention.ts';

const reminder = 'LYO task experiment: check the declared acceptance criteria before editing. ' +
  'Use observed failures to identify the cause, make the smallest justified correction, ' +
  'and verify acceptance and existing behavior before finishing. Report unresolved criteria honestly.';

function specification(runtime: TaskRegistration['runtime'], intervention?: TaskIntervention) {
  return { domain: `coding/task-acceptance/${runtime}`, objective: 'accepted-without-regression-within-declared-budget@1',
    evaluator: 'registered-verifier-and-host-usage@1', stateSchema: `task-family-model-budget-tools@1:${hashValue(intervention?.proposal.intervention ?? reminder)}`,
    actions: ['no-guidance', intervention?.id ?? 'acceptance-reminder'], baselineAction: 'no-guidance' };
}

function state(input: TaskRegistration) {
  return { family: input.family, model: input.model, budget: input.task.budget, tools: [...input.task.allowed_tools].sort() };
}

/** Task-level feedback owns acceptance; native turn-stop recovery cannot finalize these attempts. */
export class TaskFeedback {
  private readonly kernel: LearningKernel;
  constructor(kernel: LearningKernel) {
    this.kernel = kernel;
    kernel.db.exec(`CREATE TABLE IF NOT EXISTS task_attempts (
      id TEXT PRIMARY KEY, cwd TEXT NOT NULL, runtime TEXT NOT NULL, completed INTEGER NOT NULL, record_json TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS task_attempt_active ON task_attempts(cwd, runtime) WHERE completed = 0;
      CREATE TABLE IF NOT EXISTS task_policies (id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_comparisons (id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_reports (id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_interventions (id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS task_intervention_content ON task_interventions(json_extract(record_json, '$.id'));`);
  }

  register(value: unknown): TaskRecord {
    const input = taskRegistrationSchema.parse(value);
    input.cwd = realpathSync(input.cwd);
    const existing = this.find(input.attemptId);
    if (existing) {
      if (existing.registration.hash !== hashValue(input)) throw new Error('conflicting task registration');
      return existing;
    }
    if (input.policyId) {
      const policy = this.policy(input.policyId!);
      if (policy.stateHash !== hashValue(state(input))) throw new Error('policy does not match task family, model, budget and tools');
    }
    const record = { registration: registerTaskEvidence(input) };
    if (input.policyId && this.policy(input.policyId).trainingTaskFingerprints.includes(record.registration.taskFingerprint))
      throw new Error('a training task cannot be reused as later evaluation evidence');
    this.kernel.db.prepare('INSERT INTO task_attempts VALUES (?, ?, ?, 0, ?)')
      .run(input.attemptId, input.cwd, input.runtime, JSON.stringify(record));
    return record;
  }

  active(runtime: string, cwd: string): TaskRecord | undefined {
    const row = this.kernel.db.prepare('SELECT record_json FROM task_attempts WHERE cwd = ? AND runtime = ? AND completed = 0')
      .get(realpathSync(cwd), runtime);
    return row ? JSON.parse(String(row.record_json)) : undefined;
  }

  prompt(runtime: TaskRegistration['runtime'], event: { cwd: string; session_id: string; prompt: string; model?: string }, rng = Math.random) {
    const db = this.kernel.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      const record = this.active(runtime, event.cwd);
      if (!record) throw new Error('no registered task in this workspace');
      const { input } = record.registration;
      if (!event.session_id?.trim()) throw new Error('task delivery requires a host session id');
      if (record.receipt) throw new Error('task already completed');
      if (record.delivery && record.delivery.sessionId !== event.session_id) throw new Error('task is already bound to another host session');
      if (event.model && event.model !== input.model) throw new Error('host model differs from registered task model');
      let output: { additionalContext?: string } = {};
      if (record.delivery) {
        if (record.delivery.promptHash === hashValue(event.prompt)) output = record.delivery.output;
      } else {
        if (event.prompt !== input.task.prompt) throw new Error('initial host prompt differs from registered task prompt');
        const policy = input.policyId ? this.policy(input.policyId) : null;
        const intervention = policy?.interventionId ? this.intervention(policy.interventionId) : undefined;
        if (policy?.kind === 'candidate-trial' && !this.kernel.db.prepare(`SELECT 1 FROM task_comparisons, json_each(record_json, '$.pairs') pair
          WHERE json_extract(pair.value, '$.baselineAttemptId') = ? OR json_extract(pair.value, '$.learnedAttemptId') = ?`)
          .get(input.attemptId, input.attemptId)) throw new Error('register the candidate comparison before delivering either action');
        const controller = new FeedbackController(this.kernel, specification(runtime, intervention));
        const decision = controller.decide({ episodeId: input.attemptId, state: state(input),
          observationRef: `task-registration:${input.attemptId}`, mode: input.condition === 'explore' ? 'explore' : 'evaluate',
          ...(intervention ? { fixedAction: input.condition === 'baseline' ? 'no-guidance' : intervention.id } : {}),
          ...(input.condition === 'baseline' ? { revision: 0 } : policy ? { revision: policy.revision } : {}) }, rng);
        if (policy && policy.controllerId !== decision.controllerId) throw new Error('policy controller does not match task runtime');
        if (decision.action === 'acceptance-reminder') output = { additionalContext: `${reminder}\n${input.criteria.join('\n')}` };
        if (intervention && decision.action === intervention.id) output = { additionalContext: intervention.proposal.intervention };
        record.decision = decision;
        record.delivery = { sessionId: event.session_id, promptHash: hashValue(event.prompt), output, createdAt: new Date().toISOString() };
        this.save(record);
      }
      db.exec('COMMIT');
      return output;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  finish(attemptId: string, tracePath: string): TaskReceipt {
    const record = this.inspect(attemptId);
    if (!record.decision || !record.delivery) throw new Error('task has no delivered decision');
    if (record.receipt) {
      if (hashFile(tracePath).sha256 !== record.receipt.measurement.trace.sha256)
        throw new Error('conflicting completion: task evidence is immutable');
      return record.receipt;
    }
    const measurement = taskMeasurement(record.registration, record.delivery.sessionId, tracePath);
    const episode = toEpisode(record, measurement);
    const input = { decisionId: record.decision.id, executedAction: record.decision.action,
      evaluator: record.decision.specification.evaluator, reward: measurement.reward, evidenceRef: `task-receipt:${attemptId}` };
    const db = this.kernel.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (this.inspect(attemptId).receipt) throw new Error('task was completed concurrently; inspect its retained receipt');
      const controller = new FeedbackController(this.kernel, record.decision!.specification);
      controller.feedback(input);
      const feedback = controller.inspect(attemptId).feedback.at(-1)!;
      const receipt = { attemptId, registrationHash: record.registration.hash, measurement, episode, feedback };
      record.receipt = receipt;
      this.save(record);
      db.exec('COMMIT');
      return this.inspect(attemptId).receipt!;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  inspect(attemptId: string): TaskRecord {
    const record = this.find(attemptId);
    if (!record) throw new Error('unknown task attempt');
    return record;
  }

  status() {
    const records = this.records();
    return { registered: records.length, completed: records.filter(r => r.receipt).length,
      recent: records.slice(-20).reverse().map(r => ({ attemptId: r.registration.input.attemptId,
        taskId: r.registration.input.task.task_id, decision: r.decision ?? null,
        taskOutcome: r.receipt?.measurement.outcome ?? null, withinBudget: r.receipt?.measurement.withinBudget ?? null,
        receiptRef: r.receipt?.feedback.evidenceRef ?? null, policyId: r.registration.input.policyId ?? null })) };
  }

  derive(attemptId: string, options: Parameters<typeof retainTaskIntervention>[2], chat?: Parameters<typeof retainTaskIntervention>[3]) {
    return retainTaskIntervention(this.kernel, this.inspect(attemptId), options, chat);
  }

  intervention(id: string) { return getTaskIntervention(this.kernel, id); }

  analyses(attemptId: string) {
    this.inspect(attemptId);
    return this.kernel.db.prepare("SELECT id, record_json FROM task_interventions WHERE json_extract(record_json, '$.source.attemptId') = ? ORDER BY rowid")
      .all(attemptId).map(row => ({ analysisId: String(row.id), ...JSON.parse(String(row.record_json)) }));
  }

  trial(interventionId: string, budget?: TaskRegistration['task']['budget']): TaskPolicy {
    const intervention = this.intervention(interventionId);
    if (!intervention.mechanism.supported) throw new Error('the claimed repair mechanism did not survive verification');
    const source = this.inspect(intervention.source.attemptId);
    if (hashValue(source.receipt) !== intervention.source.receiptHash) throw new Error('intervention source evidence changed');
    const input = budget !== undefined ? taskRegistrationSchema.parse({ ...source.registration.input,
      task: { ...source.registration.input.task, budget } }) : source.registration.input;
    const analyses = this.kernel.db.prepare("SELECT record_json FROM task_interventions WHERE json_extract(record_json, '$.source.attemptId') = ?")
      .all(intervention.source.attemptId).map(row => JSON.parse(String(row.record_json)));
    if (analyses.some(a => a.status === 'pending')) throw new Error('finish every source analysis before freezing a candidate trial');
    const tokens = analyses.every(a => a.cost?.reflectionTokens != null) && intervention.cost.sourceTokens !== null
      ? intervention.cost.sourceTokens + analyses.reduce((n, a) => n + a.cost.reflectionTokens, 0) : null;
    const snapshot = { kind: 'candidate-trial' as const, interventionId,
      controllerId: hashValue(['tabular-mean@1', specification(source.registration.input.runtime, intervention)]),
      stateHash: hashValue(state(input)), revision: 0, ...(budget !== undefined ? { evaluationBudget: input.task.budget } : {}),
      training: { episodes: 1, unknownOutcomes: 0, totalTokens: tokens,
        wallTimeMs: source.receipt!.measurement.wallTimeMs + analyses.reduce((n, a) => n + a.cost.analysisWallTimeMs, 0) },
      evidenceRefs: [source.receipt!.feedback.evidenceRef, `task-intervention:${intervention.id}`],
      trainingTaskFingerprints: [source.registration.taskFingerprint] };
    const policy = { ...snapshot, id: hashValue(snapshot) };
    this.kernel.db.prepare('INSERT INTO task_policies VALUES (?, ?) ON CONFLICT DO NOTHING').run(policy.id, JSON.stringify(policy));
    return policy;
  }

  freeze(attemptId: string): TaskPolicy {
    const seed = this.inspect(attemptId);
    if (!seed.decision || seed.registration.input.condition !== 'explore') throw new Error('freeze requires an exploration attempt');
    const stateHash = hashValue(state(seed.registration.input));
    const records = this.records().filter(r => r.registration.input.condition === 'explore'
      && r.registration.input.runtime === seed.registration.input.runtime && hashValue(state(r.registration.input)) === stateHash);
    if (records.some(r => !r.receipt)) throw new Error('finish every registered training attempt before freezing');
    const revision = Math.max(0, ...records.filter(r => r.receipt!.feedback.reward !== null).map(r => r.receipt!.feedback.sequence));
    const snapshot = { controllerId: seed.decision.controllerId, stateHash, revision,
      training: trainingSummary(records), evidenceRefs: records.map(r => r.receipt!.feedback.evidenceRef),
      trainingTaskFingerprints: [...new Set(records.map(r => r.registration.taskFingerprint))] };
    const policy = { ...snapshot, id: hashValue(snapshot) };
    this.kernel.db.prepare('INSERT INTO task_policies VALUES (?, ?) ON CONFLICT DO NOTHING').run(policy.id, JSON.stringify(policy));
    return policy;
  }

  registerComparison(value: unknown) {
    const comparison = taskComparisonSchema.parse(value);
    const policy = this.policy(comparison.policyId);
    const ids = comparison.pairs.flatMap(p => [p.baselineAttemptId, p.learnedAttemptId]);
    if (new Set(ids).size !== ids.length) throw new Error('each comparison attempt must occur once');
    const existing = this.kernel.db.prepare('SELECT record_json FROM task_comparisons WHERE id = ?').get(comparison.id);
    if (existing) {
      if (hashValue(JSON.parse(String(existing.record_json))) !== hashValue(comparison)) throw new Error('comparison registration is immutable');
      return comparison;
    }
    for (const pair of comparison.pairs) {
      const b = this.inspect(pair.baselineAttemptId), t = this.inspect(pair.learnedAttemptId);
      if (b.decision || t.decision) throw new Error('register the comparison before any work starts');
      if (b.registration.input.condition !== 'baseline' || t.registration.input.condition !== 'learned'
        || (policy.kind === 'candidate-trial' && b.registration.input.policyId !== policy.id)
        || t.registration.input.policyId !== policy.id || !b.registration.input.pairId
        || b.registration.input.pairId !== t.registration.input.pairId
        || b.registration.taskFingerprint !== t.registration.taskFingerprint
        || b.registration.input.runtime !== t.registration.input.runtime
        || hashValue(state(b.registration.input)) !== policy.stateHash || hashValue(state(t.registration.input)) !== policy.stateHash)
        throw new Error('comparison pairs must match task, policy, verifier, runtime, model, budget and tools');
    }
    this.kernel.db.prepare('INSERT INTO task_comparisons VALUES (?, ?)').run(comparison.id, JSON.stringify(comparison));
    return comparison;
  }

  report(policyId: string, comparisonId?: string) {
    const policy = this.policy(policyId);
    const row = comparisonId ? this.kernel.db.prepare('SELECT record_json FROM task_comparisons WHERE id = ?').get(comparisonId) : null;
    if (comparisonId && !row) throw new Error('unknown registered comparison');
    const comparison: TaskComparison | undefined = row ? JSON.parse(String(row.record_json)) : undefined;
    if (comparison && comparison.policyId !== policyId) throw new Error('comparison refers to a different policy');
    const attempts = comparison ? comparison.pairs.flatMap(p => [this.inspect(p.baselineAttemptId), this.inspect(p.learnedAttemptId)])
      : this.records().filter(r => r.registration.input.policyId === policyId);
    const report = { ...buildTaskReport(policy, attempts, comparison), evidenceRefs: attempts.map(r => ({
      attemptId: r.registration.input.attemptId, receiptHash: r.receipt ? hashValue(r.receipt) : null })) };
    const reportId = hashValue(report);
    this.kernel.db.prepare('INSERT INTO task_reports VALUES (?, ?) ON CONFLICT DO NOTHING').run(reportId, JSON.stringify(report));
    return { ...report, reportId };
  }

  private policy(id: string): TaskPolicy {
    const row = this.kernel.db.prepare('SELECT record_json FROM task_policies WHERE id = ?').get(id);
    if (!row) throw new Error('unknown frozen task policy');
    return JSON.parse(String(row.record_json));
  }
  private find(id: string): TaskRecord | undefined {
    const row = this.kernel.db.prepare('SELECT record_json FROM task_attempts WHERE id = ?').get(id);
    return row ? JSON.parse(String(row.record_json)) : undefined;
  }
  private records(): TaskRecord[] {
    return this.kernel.db.prepare('SELECT record_json FROM task_attempts ORDER BY rowid').all().map(row => JSON.parse(String(row.record_json)));
  }
  private save(record: TaskRecord) {
    this.kernel.db.prepare('UPDATE task_attempts SET completed = ?, record_json = ? WHERE id = ?')
      .run(record.receipt ? 1 : 0, JSON.stringify(record), record.registration.input.attemptId);
  }
}

function toEpisode(record: TaskRecord, measurement: ReturnType<typeof taskMeasurement>): EvalEpisodeResult {
  const { input, verifierHash, taskFingerprint } = record.registration;
  const ref = `task-receipt:${input.attemptId}`;
  const exit = measurement.regression?.exit_code;
  return { episode_id: input.attemptId, task_id: input.task.task_id,
    baseline_id: input.condition === 'learned' || record.decision!.action === 'acceptance-reminder' ? 'B4' : 'B0',
    model: input.model, harness: `native-${input.runtime}`, budget: input.task.budget, allowed_tools: input.task.allowed_tools,
    trace_ref: `${ref}#trace`, diff_ref: `${ref}#source`, touched_paths: input.task.expected_touched_paths,
    verifier_evidence: measurement.acceptance ?? { kind: 'command', command: '', exit_code: null, stdout: '', stderr: measurement.problems.join('; ') },
    episode_kind: 'agent', split: input.task.split, task_fingerprint: taskFingerprint, pair_id: input.pairId,
    verifier_sha256: verifierHash, false_gate: false, ...(exit == null ? {} : { regression: exit !== 0 }),
    token_usage: measurement.usage.totalTokens === null ? null : { total_tokens: measurement.usage.totalTokens,
      ...(measurement.usage.estimatedCost === null ? {} : { estimated_cost: measurement.usage.estimatedCost }) },
    wall_time_ms: measurement.wallTimeMs,
    injected_context: { static_skill: null, observe_only: false, rule_gates: [] },
    policy_ref: input.policyId, decision_ref: record.decision!.id, delivery_ref: `task-delivery:${input.attemptId}`,
    outcome: { verified_success: measurement.outcome },
  };
}

function trainingSummary(records: TaskRecord[]) {
  return { episodes: records.length,
    unknownOutcomes: records.filter(r => r.receipt!.measurement.outcome === null).length,
    totalTokens: records.every(r => r.receipt!.measurement.usage.totalTokens !== null)
      ? records.reduce((sum, r) => sum + r.receipt!.measurement.usage.totalTokens!, 0) : null,
    wallTimeMs: records.reduce((sum, r) => sum + r.receipt!.measurement.wallTimeMs, 0) };
}
