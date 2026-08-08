/**
 * LessonStore - LYO's durable lesson library (lesson-delta learning layer, v0.1)
 *
 * LYO is the SOLE WRITER of this store: it never shares a run ledger's DB
 * (design doc §1.4, Appendix B.3). Implements:
 * - §3 schema (append-only lesson_delta log + folded lesson state + attribution
 *   join table lesson_application)
 * - §4.1 v_lesson_library view + §4.2 selection under a PLUGGABLE policy
 *   (see selection-policies.ts; lesson_decision.policy records which policy
 *   logged each decision — logged-bandit provenance for off-policy eval)
 * - §5.1 validation-grounded counter rule + §5.2 Wilson status rules
 * - §5.3 lesson_decision log: per-decision candidate snapshot (alpha/beta at
 *   decision time) + Monte-Carlo selection propensities (v0.2). This is the
 *   logged-bandit data the ratio-lift estimator joins against outcomes.
 * - §6 replay (fold deltas back into state)
 * - §7 curator (merge / prune, watermark-driven)
 *
 * Documented deviations from the design doc (each also noted inline):
 *  1. lesson_application adds trigger_message_id and its uniqueness is
 *     UNIQUE(lesson_id, run_id, trigger_message_id) instead of
 *     UNIQUE(lesson_id, run_id). Rationale: a Zeroshot "run" (cluster) contains
 *     multiple validation cycles (rejection -> intervention -> next
 *     validation); the grounded attribution unit is the cycle, not the run.
 *     run_id = cluster_id remains for provenance/metrics.
 *  2. Promotion (candidate -> active) is applied to the lesson row WITHOUT
 *     emitting a delta (the design's delta_type list has no PROMOTE; §6 replay
 *     recomputes status from counters during fold). QUARANTINE / RETIRE /
 *     MERGE_INTO / REINSTATE ARE deltas.
 */

import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { normalizeCue } from '../selection/failure-classifier.ts';
import { DEFAULT_POLICY_ID, policyId, resolvePolicy } from '../selection/selection-policies.ts';
import type {
  ScoredSelection,
  SelectionCandidate,
  SelectionPolicyRef,
} from '../selection/selection-policies.ts';
import {
  LYO_LESSON_DDL,
  WILSON_Z,
  STATUS_RULE_MIN_SAMPLES,
  PROMOTION_WILSON_LOWER,
  QUARANTINE_WILSON_UPPER,
} from './schema.ts';
import type {
  ApplicationRow,
  CreateLessonInput,
  DecisionCandidate,
  DecisionRow,
  DeltaRow,
  LibraryRow,
  LessonRow,
  PairStatsRow,
  PreferencePairRow,
  RecordApplicationInput,
  RecordDecisionInput,
  RecordPreferencePairInput,
  RecordTraceInput,
  ReplayState,
  SelectLessonsInput,
  SelectedLesson,
  SelectWithDecisionInput,
  SelectWithDecisionResult,
  TraceRow,
} from './lesson-types.ts';

export type {
  ApplicationRow,
  CreateLessonInput,
  DecisionCandidate,
  DecisionRow,
  DeltaRow,
  LibraryRow,
  LessonRow,
  PairStatsRow,
  PreferencePairRow,
  RecordApplicationInput,
  RecordDecisionInput,
  RecordPreferencePairInput,
  RecordTraceInput,
  ReplayState,
  SelectLessonsInput,
  SelectedLesson,
  SelectWithDecisionInput,
  SelectWithDecisionResult,
  TraceRow,
} from './lesson-types.ts';

interface TableInfoRow {
  name: string;
}

interface CountRow {
  n: number;
}

interface MaxDeltaRow {
  maxId: number | null;
}

interface MetaRow {
  value: string;
}

interface CreateDeltaPayload {
  failure_class: string;
  trigger_cue: string;
  explanation: string;
  intervention: string;
  created_at: string;
  updated_at: string;
  provenance?: string[];
}

interface EditDeltaPayload {
  run_id?: string | null;
  updated_at?: string;
}

interface MergeDeltaPayload {
  target_lesson_id?: string;
  helpful_count?: number;
  harmful_count?: number;
  uses?: number;
  provenance?: string[];
}

interface ReinstateDeltaPayload {
  to_status?: string;
}

function randomId(prefix: string): string {
  // les_<16 hex> / app_<16 hex>
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// §5.2 Wilson score interval with z = 1.96.
function wilsonInterval(helpful: number, n: number, z = WILSON_Z): { lower: number; upper: number } {
  const phat = helpful / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return {
    lower: (center - margin) / denominator,
    upper: (center + margin) / denominator,
  };
}

interface StatusFoldState {
  status: string;
  helpful_count: number;
  harmful_count: number;
}

// Pure status-rule fold shared by applyStatusRules (DB path) and replayLesson
// (reconstruction path). Mutates and returns the given state object.
function foldStatusRules<T extends StatusFoldState>(state: T): T {
  const n = state.helpful_count + state.harmful_count;
  if (n < STATUS_RULE_MIN_SAMPLES) return state;
  const { lower, upper } = wilsonInterval(state.helpful_count, n);
  if (lower > PROMOTION_WILSON_LOWER && state.status === 'candidate') {
    state.status = 'active';
  }
  if (upper < QUARANTINE_WILSON_UPPER && state.status !== 'quarantined') {
    state.status = 'quarantined';
  }
  return state;
}

function unionProvenance(provenance: string[], runId: string | null | undefined): string[] {
  if (runId && !provenance.includes(runId)) {
    provenance.push(runId);
  }
  return provenance;
}

// node:sqlite DatabaseSync has no transaction helper (unlike better-sqlite3's
// db.transaction(fn)): bracket fn in an immediate transaction manually.
function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export class LessonStore {
  dbPath: string;
  db: DatabaseSync;
  private _closed: boolean;

  constructor(dbPath = ':memory:') {
    this.dbPath = dbPath;
    this._closed = false;

    // node:sqlite has no `timeout` open option (better-sqlite3 parity note):
    // the busy timeout is simply not configured here.
    this.db = new DatabaseSync(dbPath);
    this._initSchema();
  }

  private _initSchema(): void {
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA wal_autocheckpoint = 1000');
    this.db.exec(LYO_LESSON_DDL);
    this._migrate();
  }

  // Idempotent migrations. v2 (§5.3): lesson_application gains decision_id,
  // the join key into the lesson_decision log. v3 (§4.2): lesson_decision
  // gains policy, the id of the selection policy that logged the decision —
  // logged-bandit provenance. The DEFAULT is factually correct for existing
  // rows: they were all logged by thompson-beta@1, the only policy that
  // existed then. The DDL intentionally keeps the original table shapes so
  // fresh and old databases converge through this ONE path. schema_version
  // is upserted every open.
  private _migrate(): void {
    const applicationColumns = (this.db.prepare('PRAGMA table_info(lesson_application)').all() as unknown as TableInfoRow[]).map(
      (column) => column.name
    );
    if (!applicationColumns.includes('decision_id')) {
      this.db.exec('ALTER TABLE lesson_application ADD COLUMN decision_id TEXT');
    }
    const decisionColumns = (this.db.prepare('PRAGMA table_info(lesson_decision)').all() as unknown as TableInfoRow[]).map(
      (column) => column.name
    );
    if (!decisionColumns.includes('policy')) {
      this.db.exec(
        `ALTER TABLE lesson_decision ADD COLUMN policy TEXT NOT NULL DEFAULT '${DEFAULT_POLICY_ID}'`
      );
    }
    // v4 (model inversion): pair provenance columns on lesson. NULL on
    // pre-v4 rows — pair stats aggregate those under '(unknown)'.
    const lessonColumns = (this.db.prepare('PRAGMA table_info(lesson)').all() as unknown as TableInfoRow[]).map(
      (column) => column.name
    );
    if (!lessonColumns.includes('reflector_policy')) {
      this.db.exec('ALTER TABLE lesson ADD COLUMN reflector_policy TEXT');
    }
    if (!lessonColumns.includes('reflector_model')) {
      this.db.exec('ALTER TABLE lesson ADD COLUMN reflector_model TEXT');
    }
    if (!lessonColumns.includes('executor_model')) {
      this.db.exec('ALTER TABLE lesson ADD COLUMN executor_model TEXT');
    }
    this._setMeta('schema_version', '4');
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.db.close();
  }

  getLesson(lessonId: string): LessonRow | null {
    return (
      (this.db.prepare('SELECT * FROM lesson WHERE lesson_id = ?').get(lessonId) as
        | LessonRow
        | undefined) || null
    );
  }

  getDeltas(lessonId: string): DeltaRow[] {
    return this.db
      .prepare('SELECT * FROM lesson_delta WHERE lesson_id = ? ORDER BY delta_id')
      .all(lessonId) as unknown as DeltaRow[];
  }

  // Model-inversion A/B: grounded performance per executor × reflector pair.
  getPairStats(): PairStatsRow[] {
    return this.db
      .prepare('SELECT * FROM v_lyo_pair_stats ORDER BY pair_posterior_mean DESC, lessons DESC')
      .all() as unknown as PairStatsRow[];
  }

  private _getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM lyo_meta WHERE key = ?').get(key) as
      | MetaRow
      | undefined;
    return row ? row.value : null;
  }

  private _setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO lyo_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value);
  }

  private _emitDelta({
    lesson_id,
    run_id = null,
    actor,
    delta_type,
    payload,
  }: {
    lesson_id: string;
    run_id?: string | null;
    actor: string;
    delta_type: string;
    payload: unknown;
  }): number {
    const info = this.db
      .prepare(
        'INSERT INTO lesson_delta (lesson_id, run_id, actor, delta_type, payload) VALUES (?, ?, ?, ?, ?)'
      )
      .run(lesson_id, run_id ?? null, actor, delta_type, JSON.stringify(payload ?? {}));
    return Number(info.lastInsertRowid);
  }

  /**
   * Create-or-merge a lesson. If a lesson with the same failure_class AND
   * identical normalized trigger_cue exists with status candidate/active, emit
   * an EDIT delta (append run_id to provenance, bump updated_at) and return the
   * existing lesson; otherwise emit a CREATE delta and insert a new candidate.
   */
  createLesson({
    failure_class,
    trigger_cue,
    explanation,
    intervention,
    run_id,
    actor,
    reflector,
    reflector_model,
    executor_model,
  }: CreateLessonInput): LessonRow | null {
    if (!failure_class) {
      throw new Error('LessonStore.createLesson: failure_class is required');
    }
    const cue = normalizeCue(trigger_cue);
    const now = nowIso();
    const lessonActor = actor || 'reflector';

    return withTransaction(this.db, (): LessonRow | null => {
      const existing = this.db
        .prepare(
          `SELECT * FROM lesson
           WHERE failure_class = ? AND trigger_cue = ? AND status IN ('candidate', 'active')`
        )
        .get(failure_class, cue) as LessonRow | undefined;

      if (existing) {
        // EDIT merge: provenance + updated_at only. The explanation /
        // intervention / trigger_cue text is NEVER rewritten (ACE
        // brevity-bias/context-collapse rule, design doc §7); the reflector's
        // proposed text is kept in the delta payload for audit only.
        this._emitDelta({
          lesson_id: existing.lesson_id,
          run_id,
          actor: lessonActor,
          delta_type: 'EDIT',
          payload: {
            run_id: run_id ?? null,
            updated_at: now,
            explanation,
            intervention,
            reflector: reflector ?? null, // authoring reflector id, e.g. 'template@1' (A/B provenance)
            reflector_model: reflector_model ?? null,
            executor_model: executor_model ?? null,
          },
        });
        const provenance = unionProvenance(JSON.parse(existing.provenance) as string[], run_id);
        this.db
          .prepare('UPDATE lesson SET provenance = ?, updated_at = ? WHERE lesson_id = ?')
          .run(JSON.stringify(provenance), now, existing.lesson_id);
        return { ...existing, provenance: JSON.stringify(provenance), updated_at: now };
      }

      const lessonId = randomId('les');
      const provenance = run_id ? [run_id] : [];
      this._emitDelta({
        lesson_id: lessonId,
        run_id,
        actor: lessonActor,
        delta_type: 'CREATE',
        payload: {
          failure_class,
          trigger_cue: cue,
          explanation: explanation ?? '',
          intervention: intervention ?? '',
          created_at: now,
          updated_at: now,
          provenance,
          reflector: reflector ?? null, // authoring reflector id, e.g. 'template@1' (A/B provenance)
          reflector_model: reflector_model ?? null,
          executor_model: executor_model ?? null,
        },
      });
      this.db
        .prepare(
          `INSERT INTO lesson (
             lesson_id, status, failure_class, trigger_cue, explanation, intervention,
             helpful_count, harmful_count, uses, created_at, updated_at, provenance,
             reflector_policy, reflector_model, executor_model
           ) VALUES (?, 'candidate', ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          lessonId,
          failure_class,
          cue,
          explanation ?? '',
          intervention ?? '',
          now,
          now,
          JSON.stringify(provenance),
          reflector ?? null,
          reflector_model ?? null,
          executor_model ?? null
        );
      return this.getLesson(lessonId);
    });
  }

  /**
   * §4.2 retrieval + selection under the DEFAULT policy (Thompson-Beta).
   * Thin wrapper kept for callers that only need selected lessons; new code
   * should use selectWithDecision. Delegates to the same policy sampler so
   * there is exactly ONE selection code path (same rng consumption order as
   * the original inline implementation: candidate order, alpha gamma then
   * beta gamma — seeded draws are unchanged).
   */
  selectLessons({ failure_class, limit = 2, rng = Math.random }: SelectLessonsInput): SelectedLesson[] {
    const rows = this.db
      .prepare('SELECT * FROM v_lesson_library WHERE failure_class = ?')
      .all(failure_class) as unknown as LibraryRow[];
    const candidates = rows.map((row) => ({
      lesson_id: row.lesson_id,
      alpha: row.helpful_count + 1,
      beta: row.harmful_count + 1,
    }));
    return resolvePolicy(null)
      .sampleSelection(candidates, limit, rng)
      .map(({ index, score }: ScoredSelection) => ({ ...rows[index], sampled_score: score }));
  }

  /**
   * §4.2 selection with §5.3 decision-record data, under ANY selection
   * policy (default Thompson-Beta; inject another policy object or a
   * registry id string — see selection-policies.ts). Returns the selected
   * lessons, the FULL candidate set annotated with the posterior parameters
   * (alpha = helpful+1, beta = harmful+1) and each candidate's selection
   * propensity: P(lesson lands in the top `limit`) under the policy,
   * Monte-Carlo estimated by replicating the policy's OWN sampler
   * `propensityReplicates` times with the same injectable rng (the
   * propensities feed the ratio-lift estimator's inverse-propensity
   * weighting; deterministic policies degenerate to propensity 0/1, which
   * is correct). When every candidate fits in the limit, inclusion is
   * certain and propensity is exactly 1 (MC loop skipped). null_arm is 1
   * only when no candidate exists (in practice createLesson runs first, so
   * at least one always does). The returned `policy` id is the logging
   * policy of record and belongs in the decision row.
   */
  selectWithDecision({
    failure_class,
    limit = 2,
    rng = Math.random,
    propensityReplicates = 1000,
    policy: policyRef = null,
  }: SelectWithDecisionInput): SelectWithDecisionResult {
    const policy = resolvePolicy(policyRef);
    const rows = this.db
      .prepare('SELECT * FROM v_lesson_library WHERE failure_class = ?')
      .all(failure_class) as unknown as LibraryRow[];

    if (rows.length === 0) {
      return { selected: [], candidates: [], null_arm: 1, policy: policyId(policy) };
    }

    const baseCandidates = rows.map((row) => ({
      lesson_id: row.lesson_id,
      alpha: row.helpful_count + 1,
      beta: row.harmful_count + 1,
    }));

    const inclusionCertain = rows.length <= limit;
    const replicates = Math.max(0, propensityReplicates);
    const tallies = new Array<number>(rows.length).fill(0);
    if (!inclusionCertain) {
      for (let replicate = 0; replicate < replicates; replicate++) {
        for (const { index } of policy.sampleSelection(baseCandidates, limit, rng)) {
          tallies[index]++;
        }
      }
    }

    const candidates = baseCandidates.map((candidate, index) => ({
      ...candidate,
      propensity: inclusionCertain ? 1 : replicates > 0 ? tallies[index] / replicates : 0,
    }));

    // The real selection draw (independent of the MC replicates).
    const selected = policy
      .sampleSelection(baseCandidates, limit, rng)
      .map(({ index, score }) => ({ ...rows[index], sampled_score: score }));

    return { selected, candidates, null_arm: 0, policy: policyId(policy) };
  }

  /**
   * §2/§4.2 step 4: one application row per injected lesson (outcome pending).
   * INSERT OR IGNORE on UNIQUE(lesson_id, run_id, trigger_message_id); uses is
   * bumped only when a row was actually inserted. Returns the application row
   * (new or existing). NOTE: NULL trigger_message_id never dedupes (SQLite
   * treats NULLs as distinct); callers should always pass the trigger id.
   * decision_id (v0.2) joins the application to its lesson_decision row.
   */
  recordApplication({
    lesson_id,
    run_id,
    trigger_message_id,
    task_cue,
    sampled_score,
    decision_id,
  }: RecordApplicationInput): ApplicationRow | undefined {
    const applicationId = randomId('app');
    return withTransaction(this.db, (): ApplicationRow | undefined => {
      const info = this.db
        .prepare(
          `INSERT OR IGNORE INTO lesson_application
             (application_id, lesson_id, run_id, trigger_message_id, task_cue, sampled_score, decision_id, outcome, counted)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`
        )
        .run(
          applicationId,
          lesson_id,
          run_id,
          trigger_message_id ?? null,
          task_cue ?? null,
          sampled_score ?? null,
          decision_id ?? null
        );

      if (info.changes > 0) {
        this.db.prepare('UPDATE lesson SET uses = uses + 1 WHERE lesson_id = ?').run(lesson_id);
        return this.db
          .prepare('SELECT * FROM lesson_application WHERE application_id = ?')
          .get(applicationId) as ApplicationRow | undefined;
      }

      return this.db
        .prepare(
          `SELECT * FROM lesson_application
           WHERE lesson_id = ? AND run_id = ? AND trigger_message_id IS ?`
        )
        .get(lesson_id, run_id, trigger_message_id ?? null) as ApplicationRow | undefined;
    });
  }

  /**
   * §5.3 decision log: one immutable row per intervention decision, capturing
   * every candidate's (alpha, beta, propensity) at decision time plus the
   * selected arms and their policy scores. Joined against outcomes via
   * lesson_application.decision_id, this is the logged-bandit dataset the
   * ratio-lift estimator (§5.3) evaluates — including the null arm (cycles
   * where no lesson was injected). `policy` is the logging policy of record
   * (name@version, e.g. 'thompson-beta@1'); pass the value returned by
   * selectWithDecision. decision_id is dec_<16 hex>.
   */
  recordDecision({
    run_id,
    trigger_message_id = null,
    cycle_index = null,
    failure_class,
    task_cue = null,
    candidates,
    selected,
    null_arm = 0,
    context = {},
    policy = DEFAULT_POLICY_ID,
  }: RecordDecisionInput): DecisionRow | null {
    if (!run_id || !failure_class) {
      throw new Error('LessonStore.recordDecision: run_id and failure_class are required');
    }
    if (!Array.isArray(candidates) || !Array.isArray(selected)) {
      throw new Error('LessonStore.recordDecision: candidates and selected must be arrays');
    }
    const decisionId = randomId('dec');
    this.db
      .prepare(
        `INSERT INTO lesson_decision
           (decision_id, run_id, trigger_message_id, cycle_index, failure_class, task_cue,
            candidates, selected, null_arm, context, policy, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        decisionId,
        run_id,
        trigger_message_id ?? null,
        cycle_index ?? null,
        failure_class,
        task_cue ?? null,
        JSON.stringify(candidates),
        JSON.stringify(selected),
        null_arm ? 1 : 0,
        JSON.stringify(context ?? {}),
        policy ?? DEFAULT_POLICY_ID,
        nowIso()
      );
    return this.getDecision(decisionId);
  }

  getDecision(decisionId: string): DecisionRow | null {
    return (
      (this.db.prepare('SELECT * FROM lesson_decision WHERE decision_id = ?').get(decisionId) as
        | DecisionRow
        | undefined) || null
    );
  }

  /**
   * §5.1 the validation-grounded counter rule. Counters move ONLY through
   * actual injection rows (lesson_application); a lesson with no application
   * row for the run never moves (Huang et al. 2023: self-assessment proposes,
   * the environment counts).
   */
  applyValidationOutcome({ run_id, outcome }: { run_id: string; outcome: string }): {
    run_id: string;
    outcome: string;
    updated: number;
    lessons: string[];
  } {
    if (outcome !== 'passed' && outcome !== 'failed') {
      throw new Error(`LessonStore.applyValidationOutcome: outcome must be 'passed' or 'failed'`);
    }

    const affectedLessonIds: string[] = [];
    let countedApplications = 0;
    withTransaction(this.db, () => {
      const applications = this.db
        .prepare('SELECT * FROM lesson_application WHERE run_id = ? AND counted = 0')
        .all(run_id) as unknown as ApplicationRow[];

      for (const application of applications) {
        const isPassed = outcome === 'passed';
        const counterColumn = isPassed ? 'helpful_count' : 'harmful_count';
        this._emitDelta({
          lesson_id: application.lesson_id,
          run_id,
          actor: 'validator-rule',
          delta_type: isPassed ? 'MARK_HELPFUL' : 'MARK_HARMFUL',
          payload: { application_id: application.application_id, outcome },
        });
        this.db
          .prepare(`UPDATE lesson SET ${counterColumn} = ${counterColumn} + 1 WHERE lesson_id = ?`)
          .run(application.lesson_id);
        this.db
          .prepare(
            'UPDATE lesson_application SET counted = 1, outcome = ? WHERE application_id = ?'
          )
          .run(outcome, application.application_id);
        if (!affectedLessonIds.includes(application.lesson_id)) {
          affectedLessonIds.push(application.lesson_id);
        }
        countedApplications++;
      }
    });

    for (const lessonId of affectedLessonIds) {
      const lesson = this.getLesson(lessonId);
      if (lesson) {
        this.applyStatusRules(lesson, run_id);
      }
    }

    this.maybeCurate();

    return { run_id, outcome, updated: countedApplications, lessons: affectedLessonIds };
  }

  /**
   * §5.2 status rules (retention as inference). n = helpful + harmful, Wilson
   * z = 1.96. Promote candidate -> active when n >= 8 and wilson_lower > 0.5.
   * Quarantine when n >= 8 and wilson_upper < 0.45. Never hard-delete.
   */
  applyStatusRules(lesson: LessonRow, runId: string | null = null): LessonRow {
    const n = lesson.helpful_count + lesson.harmful_count;
    if (n < STATUS_RULE_MIN_SAMPLES) {
      return lesson;
    }

    const { lower, upper } = wilsonInterval(lesson.helpful_count, n);

    if (lower > PROMOTION_WILSON_LOWER && lesson.status === 'candidate') {
      // DEVIATION 2 (see file header): promotion is applied to the lesson row
      // WITHOUT emitting a delta; replay (§6) recomputes it from counters.
      this.db
        .prepare("UPDATE lesson SET status = 'active' WHERE lesson_id = ?")
        .run(lesson.lesson_id);
      lesson.status = 'active';
    }

    if (upper < QUARANTINE_WILSON_UPPER && lesson.status !== 'quarantined') {
      this._emitDelta({
        lesson_id: lesson.lesson_id,
        run_id: runId,
        actor: 'validator-rule',
        delta_type: 'QUARANTINE',
        payload: {
          helpful_count: lesson.helpful_count,
          harmful_count: lesson.harmful_count,
          wilson_upper: upper,
        },
      });
      this.db
        .prepare("UPDATE lesson SET status = 'quarantined' WHERE lesson_id = ?")
        .run(lesson.lesson_id);
      lesson.status = 'quarantined';
    }

    return lesson;
  }

  /**
   * §7 curator pass. Acts only when at least `markInterval` MARK_* deltas sit
   * above the last_curation_delta_id watermark; then, in ONE transaction:
   * (a) merge candidate+active lessons sharing (failure_class, normalized
   *     trigger_cue) into the row with the highest helpful+harmful (counters
   *     and uses add, provenance unions, sources retire via MERGE_INTO delta),
   * (b) retire candidates with uses = 0 older than pruneDays via RETIRE delta,
   * (c) advance the watermark.
   *
   * The curator NEVER modifies explanation / intervention / trigger_cue text —
   * no re-summarization (ACE brevity-bias/context-collapse rule, §7).
   */
  maybeCurate({ markInterval = 25, pruneDays = 30 } = {}): {
    curated: boolean;
    merged: number;
    pruned: number;
  } {
    const watermark = Number(this._getMeta('last_curation_delta_id') || '0');
    const pendingMarks = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM lesson_delta
         WHERE delta_id > ? AND delta_type IN ('MARK_HELPFUL', 'MARK_HARMFUL')`
        )
        .get(watermark) as unknown as CountRow
    ).n;

    if (pendingMarks < markInterval) {
      return { curated: false, merged: 0, pruned: 0 };
    }

    const { merged, pruned } = withTransaction(this.db, () => {
      const maxDeltaId =
        (this.db.prepare('SELECT MAX(delta_id) AS maxId FROM lesson_delta').get() as unknown as MaxDeltaRow)
          .maxId ?? watermark;
      let merged = 0;
      let pruned = 0;

      // (a) MERGE exact-duplicate (failure_class, normalized trigger_cue) groups.
      const lessons = this.db
        .prepare("SELECT * FROM lesson WHERE status IN ('candidate', 'active')")
        .all() as unknown as LessonRow[];
      const groups = new Map<string, LessonRow[]>();
      for (const lesson of lessons) {
        const key = `${lesson.failure_class} ${normalizeCue(lesson.trigger_cue)}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(lesson);
      }

      for (const group of groups.values()) {
        if (group.length < 2) continue;
        // Absorber: highest (helpful + harmful); ties broken by oldest, then id.
        group.sort((a, b) => {
          const nA = a.helpful_count + a.harmful_count;
          const nB = b.helpful_count + b.harmful_count;
          if (nB !== nA) return nB - nA;
          if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
          return a.lesson_id < b.lesson_id ? -1 : 1;
        });
        const target = group[0];
        let helpful = target.helpful_count;
        let harmful = target.harmful_count;
        let uses = target.uses;
        const provenance = JSON.parse(target.provenance) as string[];

        for (const source of group.slice(1)) {
          this._emitDelta({
            lesson_id: source.lesson_id,
            run_id: null,
            actor: 'curator',
            delta_type: 'MERGE_INTO',
            // Moved amounts are recorded so replay can reconstruct both sides.
            payload: {
              target_lesson_id: target.lesson_id,
              helpful_count: source.helpful_count,
              harmful_count: source.harmful_count,
              uses: source.uses,
              provenance: JSON.parse(source.provenance) as string[],
            },
          });
          helpful += source.helpful_count;
          harmful += source.harmful_count;
          uses += source.uses;
          for (const runId of JSON.parse(source.provenance) as string[]) {
            unionProvenance(provenance, runId);
          }
          this.db
            .prepare(
              `UPDATE lesson
               SET helpful_count = 0, harmful_count = 0, uses = 0, status = 'retired'
               WHERE lesson_id = ?`
            )
            .run(source.lesson_id);
          merged++;
        }

        this.db
          .prepare(
            'UPDATE lesson SET helpful_count = ?, harmful_count = ?, uses = ?, provenance = ? WHERE lesson_id = ?'
          )
          .run(helpful, harmful, uses, JSON.stringify(provenance), target.lesson_id);
      }

      // (b) PRUNE stale unused candidates. Text fields are never touched.
      const cutoff = new Date(Date.now() - pruneDays * 24 * 60 * 60 * 1000).toISOString();
      const stale = this.db
        .prepare("SELECT * FROM lesson WHERE status = 'candidate' AND uses = 0 AND created_at < ?")
        .all(cutoff) as unknown as LessonRow[];
      for (const lesson of stale) {
        this._emitDelta({
          lesson_id: lesson.lesson_id,
          run_id: null,
          actor: 'curator',
          delta_type: 'RETIRE',
          payload: { reason: 'stale_candidate', prune_days: pruneDays },
        });
        this.db
          .prepare("UPDATE lesson SET status = 'retired' WHERE lesson_id = ?")
          .run(lesson.lesson_id);
        pruned++;
      }

      // (c) advance the curation watermark.
      this._setMeta('last_curation_delta_id', String(maxDeltaId));

      return { merged, pruned };
    });

    return { curated: true, merged, pruned };
  }

  /**
   * Record an explicit behavior trace (ported from lyo-kernel recordTrace).
   * Traces are the evidence units preference pairs compare; they are plain
   * records, not lesson deltas. When trace_id is omitted it is derived
   * deterministically from content, identical inputs collapse to one row.
   */
  recordTrace({ trace_id, run_id = null, kind, summary, ref = null, payload }: RecordTraceInput): TraceRow {
    if (!kind || !summary) {
      throw new Error('LessonStore.recordTrace: kind and summary are required');
    }
    const traceId =
      trace_id ??
      `trace-${sha256(
        JSON.stringify({
          run_id: run_id ?? null,
          kind,
          summary,
          ref: ref ?? null,
          payload: payload ?? null,
        })
      ).slice(0, 24)}`;
    this.db
      .prepare(
        `INSERT INTO learning_trace (trace_id, run_id, kind, summary, ref, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        traceId,
        run_id ?? null,
        kind,
        summary,
        ref ?? null,
        payload === undefined ? null : JSON.stringify(payload),
        nowIso()
      );
    return this._ensureTrace(traceId);
  }

  getTrace(traceId: string): TraceRow | null {
    return (
      (this.db
        .prepare(
          `SELECT trace_id, run_id, kind, summary, ref, payload_json, created_at
           FROM learning_trace WHERE trace_id = ?`
        )
        .get(traceId) as TraceRow | undefined) || null
    );
  }

  private _ensureTrace(traceId: string): TraceRow {
    const trace = this.getTrace(traceId);
    if (!trace) throw new Error(`unknown trace: ${traceId}`);
    return trace;
  }

  /**
   * Record a user preference of one trace over another (ported from
   * lyo-kernel recordPreferencePair). Guards mirror the kernel exactly:
   * distinct traces, an auditable reason, and both traces must exist.
   * context_hash defaults to a hash of the ordered pair so identical
   * comparisons share a context; preference_id is content-derived.
   */
  recordPreferencePair({
    chosen_trace_id,
    rejected_trace_id,
    reason,
    evidence_ref,
    confidence,
    recorded_by,
    context,
    context_hash,
    preference_id,
  }: RecordPreferencePairInput): PreferencePairRow | null {
    if (!chosen_trace_id || !rejected_trace_id || !reason || !evidence_ref) {
      throw new Error(
        'LessonStore.recordPreferencePair: chosen_trace_id, rejected_trace_id, reason, and evidence_ref are required'
      );
    }
    if (chosen_trace_id === rejected_trace_id) {
      throw new Error('preference pair requires distinct chosen and rejected traces');
    }
    if (reason.trim().length < 12) {
      throw new Error('preference reason must be specific enough to audit');
    }
    this._ensureTrace(chosen_trace_id);
    this._ensureTrace(rejected_trace_id);
    const contextHash =
      context_hash ?? sha256(context ?? `${chosen_trace_id}>${rejected_trace_id}`);
    const preferenceId =
      preference_id ??
      `pref-${contextHash.slice(0, 16)}-${sha256(`${chosen_trace_id}:${rejected_trace_id}:${reason}`).slice(0, 8)}`;
    this.db
      .prepare(
        `INSERT INTO preference_pair (
           preference_id, context_hash, chosen_trace_id, rejected_trace_id,
           reason, evidence_ref, recorded_by, confidence, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        preferenceId,
        contextHash,
        chosen_trace_id,
        rejected_trace_id,
        reason,
        evidence_ref,
        recorded_by ?? null,
        confidence ?? 'medium',
        nowIso()
      );
    return this.getPreferencePair(preferenceId);
  }

  getPreferencePair(preferenceId: string): PreferencePairRow | null {
    return (
      (this.db.prepare('SELECT * FROM preference_pair WHERE preference_id = ?').get(preferenceId) as
        | PreferencePairRow
        | undefined) || null
    );
  }

  /**
   * §6 replay: fold a lesson's deltas in delta_id order back into its state
   * (CREATE/EDIT payloads, MARK_* counts, status deltas; promotion recomputed
   * from counters per deviation 2). MERGE_INTO deltas targeting this lesson
   * are folded in as absorbed counters. `uses` is application-derived (not a
   * delta) and is therefore NOT part of the reconstructed state.
   */
  replayLesson(lessonId: string): ReplayState | null {
    const own = this.getDeltas(lessonId);
    const absorbed = (this.db
      .prepare("SELECT * FROM lesson_delta WHERE delta_type = 'MERGE_INTO' ORDER BY delta_id")
      .all() as unknown as DeltaRow[]).filter((delta) => {
      try {
        return (JSON.parse(delta.payload) as MergeDeltaPayload).target_lesson_id === lessonId;
      } catch {
        return false;
      }
    });
    const deltas = [...own, ...absorbed].sort((a, b) => a.delta_id - b.delta_id);

    let state: ReplayState | null = null;
    for (const delta of deltas) {
      const payload = JSON.parse(delta.payload) as CreateDeltaPayload &
        EditDeltaPayload &
        MergeDeltaPayload &
        ReinstateDeltaPayload;
      switch (delta.delta_type) {
        case 'CREATE':
          state = {
            lesson_id: lessonId,
            status: 'candidate',
            failure_class: payload.failure_class,
            trigger_cue: payload.trigger_cue,
            explanation: payload.explanation,
            intervention: payload.intervention,
            helpful_count: 0,
            harmful_count: 0,
            created_at: payload.created_at,
            updated_at: payload.updated_at,
            provenance: [...(payload.provenance || [])],
          };
          break;
        case 'EDIT':
          if (!state) break;
          unionProvenance(state.provenance, payload.run_id);
          if (payload.updated_at) state.updated_at = payload.updated_at;
          break;
        case 'MARK_HELPFUL':
          if (!state) break;
          state.helpful_count += 1;
          foldStatusRules(state);
          break;
        case 'MARK_HARMFUL':
          if (!state) break;
          state.harmful_count += 1;
          foldStatusRules(state);
          break;
        case 'QUARANTINE':
          if (state) state.status = 'quarantined';
          break;
        case 'RETIRE':
          if (state) state.status = 'retired';
          break;
        case 'REINSTATE':
          if (state) state.status = payload.to_status || 'candidate';
          break;
        case 'MERGE_INTO':
          if (!state) break;
          if (delta.lesson_id === lessonId) {
            // This lesson was merged away into a target.
            state.status = 'retired';
            state.helpful_count = 0;
            state.harmful_count = 0;
          } else {
            // This lesson absorbed the source's counters.
            state.helpful_count += payload.helpful_count || 0;
            state.harmful_count += payload.harmful_count || 0;
            for (const runId of payload.provenance || []) {
              unionProvenance(state.provenance, runId);
            }
          }
          break;
        default:
          break;
      }
    }

    return state;
  }
}
