import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { LYO_LEARNED_RULE_DDL } from './schema.ts';

export type LearnedRuleStatus = 'candidate' | 'active' | 'quarantined' | 'retired';
export type LearnedRuleOutcome = 'helpful' | 'harmful' | 'neutral';

export interface LearnedRuleRow {
  rule_id: string;
  kind: string;
  scope_kind: string;
  scope_value: string;
  condition_json: string;
  action_json: string;
  status: LearnedRuleStatus;
  helpful_count: number;
  harmful_count: number;
  created_from_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearnedRuleDeltaRow {
  delta_id: number;
  rule_id: string;
  run_id: string | null;
  actor: string;
  delta_type: string;
  payload_json: string;
  created_at: string;
}

export interface LearnedRuleApplicationRow {
  application_id: string;
  rule_id: string;
  run_id: string;
  trigger_ref: string | null;
  emitted_fact_json: string;
  outcome: string;
  counted: number;
  created_at: string;
  updated_at: string;
}

export interface CreateVerifierRuleInput {
  scope_kind: string;
  scope_value: string;
  path_glob: string;
  command: string;
  require_before_done?: boolean;
  status?: LearnedRuleStatus;
  run_id?: string | null;
  actor?: string;
  created_from_ref?: string | null;
}

export interface ApplyVerifierRulesInput {
  run_id: string;
  scope_kind: string;
  scope_value: string;
  touched_paths: string[];
  trigger_ref?: string | null;
}

export interface VerifierGate {
  ruleId: string;
  command: string;
  requireBeforeDone: boolean;
  matchedPaths: string[];
  applicationId: string;
}

export class LearnedRuleStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(dbPath = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(LYO_LEARNED_RULE_DDL);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  createVerifierRule(input: CreateVerifierRuleInput): LearnedRuleRow {
    if (!input.path_glob) throw new Error('createVerifierRule: path_glob is required');
    if (!input.command) throw new Error('createVerifierRule: command is required');
    const now = nowIso();
    const ruleId = randomId('rule');
    const row = {
      rule_id: ruleId,
      kind: 'verifier_for_path',
      scope_kind: input.scope_kind,
      scope_value: input.scope_value,
      condition_json: JSON.stringify({ path_glob: input.path_glob }),
      action_json: JSON.stringify({
        command: input.command,
        require_before_done: input.require_before_done ?? true,
      }),
      status: input.status ?? 'candidate',
      helpful_count: 0,
      harmful_count: 0,
      created_from_ref: input.created_from_ref ?? null,
      created_at: now,
      updated_at: now,
    };

    return transaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO learned_rule (
             rule_id, kind, scope_kind, scope_value, condition_json, action_json,
             status, helpful_count, harmful_count, created_from_ref, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
        )
        .run(
          row.rule_id,
          row.kind,
          row.scope_kind,
          row.scope_value,
          row.condition_json,
          row.action_json,
          row.status,
          row.created_from_ref,
          row.created_at,
          row.updated_at
        );
      this.emitDelta({
        ruleId,
        runId: input.run_id ?? null,
        actor: input.actor ?? 'proposer',
        deltaType: 'CREATE',
        payload: row,
      });
      return this.getRule(ruleId) as LearnedRuleRow;
    });
  }

  setRuleStatus(
    ruleId: string,
    status: LearnedRuleStatus,
    input: { run_id?: string | null; actor?: string } = {}
  ): LearnedRuleRow {
    const now = nowIso();
    return transaction(this.db, () => {
      this.db
        .prepare('UPDATE learned_rule SET status = ?, updated_at = ? WHERE rule_id = ?')
        .run(status, now, ruleId);
      this.emitDelta({
        ruleId,
        runId: input.run_id ?? null,
        actor: input.actor ?? 'evaluator',
        deltaType: statusDeltaType(status),
        payload: { status },
      });
      const row = this.getRule(ruleId);
      if (!row) throw new Error(`unknown learned rule: ${ruleId}`);
      return row;
    });
  }

  applyVerifierRules(input: ApplyVerifierRulesInput): VerifierGate[] {
    const rules = this.db
      .prepare(
        `SELECT * FROM learned_rule
         WHERE kind = 'verifier_for_path'
           AND status = 'active'
           AND scope_kind = ?
           AND scope_value = ?
         ORDER BY created_at, rule_id`
      )
      .all(input.scope_kind, input.scope_value) as unknown as LearnedRuleRow[];

    const gates: VerifierGate[] = [];
    for (const rule of rules) {
      const condition = JSON.parse(rule.condition_json) as { path_glob?: string };
      const action = JSON.parse(rule.action_json) as {
        command?: string;
        require_before_done?: boolean;
      };
      const matchedPaths = input.touched_paths.filter((path) =>
        pathMatchesGlob(path, condition.path_glob ?? '')
      );
      if (matchedPaths.length === 0 || !action.command) continue;

      const emitted = {
        kind: 'verifier_gate',
        command: action.command,
        require_before_done: action.require_before_done ?? true,
        matched_paths: matchedPaths,
      };
      const application = this.recordApplication({
        ruleId: rule.rule_id,
        runId: input.run_id,
        triggerRef: input.trigger_ref ?? input.touched_paths.join(','),
        emitted,
      });
      gates.push({
        ruleId: rule.rule_id,
        command: action.command,
        requireBeforeDone: emitted.require_before_done,
        matchedPaths,
        applicationId: application.application_id,
      });
    }
    return gates;
  }

  recordRuleOutcome({ run_id, outcome }: { run_id: string; outcome: LearnedRuleOutcome }): {
    runId: string;
    outcome: LearnedRuleOutcome;
    updated: number;
    rules: string[];
  } {
    if (outcome !== 'helpful' && outcome !== 'harmful' && outcome !== 'neutral') {
      throw new Error('recordRuleOutcome: outcome must be helpful, harmful, or neutral');
    }
    const affected: string[] = [];
    let updated = 0;

    transaction(this.db, () => {
      const applications = this.db
        .prepare('SELECT * FROM learned_rule_application WHERE run_id = ? AND counted = 0')
        .all(run_id) as unknown as LearnedRuleApplicationRow[];
      for (const application of applications) {
        if (outcome !== 'neutral') {
          const counter = outcome === 'helpful' ? 'helpful_count' : 'harmful_count';
          this.db
            .prepare(`UPDATE learned_rule SET ${counter} = ${counter} + 1 WHERE rule_id = ?`)
            .run(application.rule_id);
        }
        this.db
          .prepare(
            'UPDATE learned_rule_application SET outcome = ?, counted = 1, updated_at = ? WHERE application_id = ?'
          )
          .run(outcome, nowIso(), application.application_id);
        this.emitDelta({
          ruleId: application.rule_id,
          runId: run_id,
          actor: 'evaluator',
          deltaType: outcome === 'neutral' ? 'MARK_NEUTRAL' : outcome === 'helpful' ? 'MARK_HELPFUL' : 'MARK_HARMFUL',
          payload: { application_id: application.application_id, outcome },
        });
        if (!affected.includes(application.rule_id)) affected.push(application.rule_id);
        updated++;
      }
    });

    return { runId: run_id, outcome, updated, rules: affected };
  }

  getRule(ruleId: string): LearnedRuleRow | null {
    return (
      (this.db.prepare('SELECT * FROM learned_rule WHERE rule_id = ?').get(ruleId) as
        | LearnedRuleRow
        | undefined) ?? null
    );
  }

  getRuleDeltas(ruleId: string): LearnedRuleDeltaRow[] {
    return this.db
      .prepare('SELECT * FROM learned_rule_delta WHERE rule_id = ? ORDER BY delta_id')
      .all(ruleId) as unknown as LearnedRuleDeltaRow[];
  }

  getRuleApplications(ruleId: string): LearnedRuleApplicationRow[] {
    return this.db
      .prepare('SELECT * FROM learned_rule_application WHERE rule_id = ? ORDER BY created_at')
      .all(ruleId) as unknown as LearnedRuleApplicationRow[];
  }

  private recordApplication({
    ruleId,
    runId,
    triggerRef,
    emitted,
  }: {
    ruleId: string;
    runId: string;
    triggerRef: string | null;
    emitted: unknown;
  }): LearnedRuleApplicationRow {
    const now = nowIso();
    const applicationId = randomId('rapp');
    this.db
      .prepare(
        `INSERT OR IGNORE INTO learned_rule_application (
           application_id, rule_id, run_id, trigger_ref, emitted_fact_json,
           outcome, counted, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
      )
      .run(applicationId, ruleId, runId, triggerRef, JSON.stringify(emitted), now, now);
    return this.db
      .prepare(
        `SELECT * FROM learned_rule_application
         WHERE rule_id = ? AND run_id = ? AND trigger_ref IS ?`
      )
      .get(ruleId, runId, triggerRef) as unknown as LearnedRuleApplicationRow;
  }

  private emitDelta({
    ruleId,
    runId,
    actor,
    deltaType,
    payload,
  }: {
    ruleId: string;
    runId: string | null;
    actor: string;
    deltaType: string;
    payload: unknown;
  }): void {
    this.db
      .prepare(
        `INSERT INTO learned_rule_delta
           (rule_id, run_id, actor, delta_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(ruleId, runId, actor, deltaType, JSON.stringify(payload), nowIso());
  }
}

function pathMatchesGlob(path: string, glob: string): boolean {
  if (!glob) return false;
  if (glob.endsWith('/**')) {
    const prefix = glob.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (!glob.includes('*')) return path === glob;
  const pattern = glob
    .split('*')
    .map(escapeRegExp)
    .join('[^/]*');
  return new RegExp(`^${pattern}$`).test(path);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const value = work();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function statusDeltaType(status: LearnedRuleStatus): string {
  if (status === 'active') return 'ACTIVATE';
  if (status === 'quarantined') return 'QUARANTINE';
  if (status === 'retired') return 'RETIRE';
  return 'MARK_CANDIDATE';
}
