import type { LearningKernel } from '../storage/ledger.ts';
import { hashValue } from '../contract/refs.ts';
import { selectAction } from '../domain/tabular-mean-policy.ts';
import { z } from 'zod';

const nonempty = z.string().min(1).refine(value => value.trim().length > 0);
const specificationSchema = z.object({
  domain: nonempty, objective: nonempty, evaluator: nonempty, stateSchema: nonempty,
  actions: z.array(nonempty).min(2), baselineAction: nonempty,
}).strict().refine(value => new Set(value.actions).size === value.actions.length
  && value.actions.includes(value.baselineAction), 'actions must be distinct and contain the baseline');
const requestSchema = z.object({
  episodeId: nonempty, state: z.record(z.string(), z.json()), observationRef: nonempty,
  mode: z.enum(['explore', 'evaluate']), revision: z.number().int().nonnegative().optional(),
  fixedAction: nonempty.optional(),
}).strict();
const feedbackSchema = z.object({
  decisionId: nonempty, executedAction: nonempty, evaluator: nonempty,
  reward: z.number().min(0).max(1).nullable(), evidenceRef: nonempty,
}).strict();

export interface ControlSpecification {
  domain: string;
  objective: string;
  evaluator: string;
  stateSchema: string;
  actions: string[];
  baselineAction: string;
}

export interface ControlRequest {
  episodeId: string;
  state: Record<string, unknown>;
  observationRef: string;
  mode: 'explore' | 'evaluate';
  revision?: number;
  fixedAction?: string;
}

export interface ActionEstimate {
  action: string;
  count: number;
  mean: number | null;
}

export interface ControlDecision extends ControlRequest {
  id: string;
  controllerId: string;
  requestHash: string;
  algorithm: 'tabular-mean@1' | 'fixed-action@1';
  specification: ControlSpecification;
  revision: number;
  action: string;
  propensity: number;
  estimates: ActionEstimate[];
  createdAt: string;
}

export interface ControlFeedback {
  decisionId: string;
  executedAction: string;
  evaluator: string;
  reward: number | null;
  evidenceRef: string;
}

/** One randomized intervention per episode; measured returns train a tabular policy. */
// ponytail: exact-state means suit small discrete experiments; add a learned representation only after transfer evaluation.
export class FeedbackController {
  private readonly kernel: LearningKernel;
  private readonly specification: ControlSpecification;
  private readonly controllerId: string;

  constructor(kernel: LearningKernel, specification: ControlSpecification) {
    specification = specificationSchema.parse(specification);
    this.kernel = kernel;
    this.specification = structuredClone(specification);
    this.controllerId = hashValue(['tabular-mean@1', specification]);
    kernel.db.exec(`
      CREATE TABLE IF NOT EXISTS control_decisions (
        id TEXT PRIMARY KEY,
        controller_id TEXT NOT NULL,
        episode_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        mode TEXT NOT NULL,
        action TEXT NOT NULL,
        record_json TEXT NOT NULL,
        UNIQUE(controller_id, episode_id)
      );
      CREATE TABLE IF NOT EXISTS control_feedback (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id TEXT NOT NULL REFERENCES control_decisions(id),
        reward REAL,
        record_json TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS control_feedback_measured
        ON control_feedback(decision_id) WHERE reward IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS control_feedback_unknown
        ON control_feedback(decision_id) WHERE reward IS NULL;
    `);
  }

  decide(input: ControlRequest, rng: () => number = Math.random): ControlDecision {
    input = requestSchema.parse(input);
    if (input.fixedAction && (input.mode !== 'evaluate' || !this.specification.actions.includes(input.fixedAction)))
      throw new Error('fixed action requires evaluation and an action in the registered specification');
    const db = this.kernel.db;
    const id = hashValue([this.controllerId, input.episodeId]);
    const existing = this.storedDecision(id);
    if (existing) return this.reuse(existing, input);
    // Explicit cutoffs can be shared across controllers in the central ledger.
    const latestRevision = Number(db.prepare(`
      SELECT COALESCE(MAX(f.sequence), 0) revision FROM control_feedback f
      JOIN control_decisions d ON d.id = f.decision_id
      WHERE (d.controller_id = ? OR ? IS NOT NULL) AND d.mode = 'explore' AND f.reward IS NOT NULL
    `).get(this.controllerId, input.revision ?? null)!.revision);
    const revision = input.revision ?? latestRevision;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > latestRevision) {
      throw new Error('revision must identify existing feedback');
    }
    const rows = db.prepare(`
      SELECT d.action, COUNT(*) count, AVG(f.reward) mean FROM control_feedback f
      JOIN control_decisions d ON d.id = f.decision_id
      WHERE d.controller_id = ? AND d.state_key = ? AND d.mode = 'explore'
        AND f.reward IS NOT NULL AND f.sequence <= ? GROUP BY d.action
    `).all(this.controllerId, hashValue(input.state), revision) as unknown as ActionEstimate[];
    const estimates = this.specification.actions.map(action => rows.find(row => row.action === action)
      ?? { action, count: 0, mean: null });
    const { action, propensity } = selectAction({ actions: this.specification.actions,
      baselineAction: this.specification.baselineAction, mode: input.mode, fixedAction: input.fixedAction,
      estimates, draw: input.mode === 'explore' ? rng() : undefined });
    const decision: ControlDecision = {
      ...structuredClone(input), id, requestHash: hashValue(input), algorithm: input.fixedAction ? 'fixed-action@1' : 'tabular-mean@1',
      controllerId: this.controllerId, specification: structuredClone(this.specification),
      revision, action, propensity, estimates, createdAt: new Date().toISOString(),
    };
    db.prepare(`INSERT INTO control_decisions
      (id, controller_id, episode_id, state_key, mode, action, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING`)
      .run(decision.id, this.controllerId, input.episodeId, hashValue(input.state), input.mode,
        action, JSON.stringify(decision));
    return this.reuse(this.storedDecision(id)!, input);
  }

  feedback(input: ControlFeedback): void {
    input = feedbackSchema.parse(input);
    const decision = this.storedDecision(input.decisionId);
    if (!decision || decision.controllerId !== this.controllerId) throw new Error('unknown decision for this controller');
    if (input.evaluator !== this.specification.evaluator) throw new Error('incompatible evaluator');
    if (input.executedAction !== decision.action) throw new Error('executed action does not match the decision');
    this.kernel.db.prepare(`INSERT INTO control_feedback (decision_id, reward, record_json) VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING`)
      .run(input.decisionId, input.reward, JSON.stringify(input));
    const stored = this.kernel.db.prepare(`SELECT record_json FROM control_feedback
      WHERE decision_id = ? AND (reward IS NULL) = ?`).get(input.decisionId, input.reward === null ? 1 : 0)!;
    if (hashValue(JSON.parse(String(stored.record_json))) !== hashValue(input)) {
      throw new Error('conflicting feedback: the recorded outcome is immutable');
    }
  }

  inspect(episodeId: string): { decision: ControlDecision; feedback: Array<ControlFeedback & { sequence: number }> } {
    const decision = this.storedDecision(hashValue([this.controllerId, episodeId]));
    if (!decision) throw new Error('unknown episode for this controller');
    const feedback = this.kernel.db.prepare('SELECT sequence, record_json FROM control_feedback WHERE decision_id = ? ORDER BY sequence')
      .all(decision.id).map(row => ({ ...JSON.parse(String(row.record_json)), sequence: Number(row.sequence) }));
    return { decision, feedback };
  }

  private storedDecision(id: string): ControlDecision | undefined {
    const row = this.kernel.db.prepare('SELECT record_json FROM control_decisions WHERE id = ?').get(id);
    return row ? JSON.parse(String(row.record_json)) as ControlDecision : undefined;
  }

  private reuse(decision: ControlDecision, input: ControlRequest): ControlDecision {
    if (decision.requestHash !== hashValue(input)) throw new Error('conflicting decision: episode already recorded');
    return decision;
  }
}
