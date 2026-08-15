/**
 * LYO lesson-delta DDL. Extracted from lesson-store.ts so the schema is
 * inspectable without reading the class implementation. The kernel's own
 * 27-table schema lives in src/schema.ts; this is the LYO lesson store's
 * separate schema (design doc §3 + §5.3 decision log + v4 pair stats).
 * Migration v5 adds lesson_decision.posterior_snapshot_id and the
 * run_randomness table via LessonStore._migrate (fresh and old databases
 * converge through that one path; the DDL below keeps its original shapes).
 *
 * DEVIATION 1 (see lesson-store.ts header): lesson_application carries
 * trigger_message_id and is UNIQUE(lesson_id, run_id, trigger_message_id)
 * — the attribution unit is the validation cycle, not the run.
 */

export const WILSON_Z = 1.96;
export const STATUS_RULE_MIN_SAMPLES = 8;
export const PROMOTION_WILSON_LOWER = 0.5;
export const QUARANTINE_WILSON_UPPER = 0.45;

export const LYO_LESSON_DDL = `
CREATE TABLE IF NOT EXISTS lesson_delta (
  delta_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id   TEXT NOT NULL,              -- lesson this delta mutates
  run_id      TEXT,                       -- provenance run; NULL for curator passes
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  actor       TEXT NOT NULL,              -- 'reflector' | 'validator-rule' | 'curator'
  delta_type  TEXT NOT NULL,              -- CREATE | EDIT | MARK_HELPFUL | MARK_HARMFUL
                                           -- MERGE_INTO | QUARANTINE | REINSTATE | RETIRE
  payload     TEXT NOT NULL               -- JSON; per-type shape documented in methods
);

CREATE TABLE IF NOT EXISTS lesson (
  lesson_id     TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'candidate',  -- candidate | active | quarantined | retired
  failure_class TEXT NOT NULL,
  trigger_cue   TEXT NOT NULL,
  explanation   TEXT NOT NULL,
  intervention  TEXT NOT NULL,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  harmful_count INTEGER NOT NULL DEFAULT 0,
  uses          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  provenance    TEXT NOT NULL DEFAULT '[]'      -- JSON array of run_ids
);

CREATE TABLE IF NOT EXISTS lesson_application (
  application_id     TEXT PRIMARY KEY,
  lesson_id          TEXT NOT NULL REFERENCES lesson(lesson_id),
  run_id             TEXT NOT NULL,
  trigger_message_id TEXT,
  task_cue           TEXT,                  -- what matched at retrieval time
  sampled_score      REAL,                  -- the Thompson draw that selected it (audit)
  outcome            TEXT NOT NULL DEFAULT 'pending',  -- pending | passed | failed
  counted            INTEGER NOT NULL DEFAULT 0,       -- 1 once folded into counters
  UNIQUE(lesson_id, run_id, trigger_message_id)
);

CREATE TABLE IF NOT EXISTS lyo_meta (key TEXT PRIMARY KEY, value TEXT);

-- Preference-pair learning evidence (ported from lyo-kernel recordTrace /
-- recordPreferencePair semantics). These are plain evidence tables, NOT
-- lesson deltas: they record which behavior trace was preferred over which,
-- so a future reflector can turn audited preferences into lessons.
CREATE TABLE IF NOT EXISTS learning_trace (
  trace_id     TEXT PRIMARY KEY,
  run_id       TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('behavior', 'protocol_application', 'agent_response', 'tool_use', 'other')),
  summary      TEXT NOT NULL,
  ref          TEXT,
  payload_json TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preference_pair (
  preference_id     TEXT PRIMARY KEY,
  context_hash      TEXT NOT NULL,
  chosen_trace_id   TEXT NOT NULL REFERENCES learning_trace(trace_id),
  rejected_trace_id TEXT NOT NULL REFERENCES learning_trace(trace_id),
  reason            TEXT NOT NULL,
  evidence_ref      TEXT NOT NULL,
  recorded_by       TEXT,
  confidence        TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  created_at        TEXT NOT NULL,
  CHECK (chosen_trace_id <> rejected_trace_id)
);

-- §5.3 decision log (v0.2). One row per intervention decision: every
-- candidate's posterior parameters (alpha = helpful+1, beta = harmful+1) and
-- selection propensity at decision time, the selected arms with their
-- policy scores, and the null-arm indicator (1 = no candidate existed, the
-- decision was "inject no lesson"). Immutable once written. The policy
-- column (added by migration v3) records which selection policy logged the
-- decision — logged-bandit provenance for off-policy evaluation.
CREATE TABLE IF NOT EXISTS lesson_decision (
  decision_id        TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL,
  trigger_message_id TEXT,
  cycle_index        INTEGER,
  failure_class      TEXT NOT NULL,
  task_cue           TEXT,
  candidates         TEXT NOT NULL,   -- JSON [{lesson_id, alpha, beta, propensity}]
  selected           TEXT NOT NULL,   -- JSON [{lesson_id, score}]
  null_arm           REAL NOT NULL DEFAULT 0,
  context            TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_delta_lesson ON lesson_delta(lesson_id, delta_id);
CREATE INDEX IF NOT EXISTS idx_app_run      ON lesson_application(run_id, counted);
CREATE INDEX IF NOT EXISTS idx_lesson_class ON lesson(failure_class, status);
CREATE INDEX IF NOT EXISTS idx_decision_run   ON lesson_decision(run_id);
CREATE INDEX IF NOT EXISTS idx_decision_class ON lesson_decision(failure_class);

-- §4.1 the library view. Candidates stay retrievable for exploration.
CREATE VIEW IF NOT EXISTS v_lesson_library AS
SELECT lesson_id, failure_class, trigger_cue, explanation, intervention,
  helpful_count, harmful_count, uses,
  CAST(helpful_count + 1 AS REAL) / (helpful_count + harmful_count + 2) AS posterior_mean
FROM lesson
WHERE status IN ('active', 'candidate');

-- Model-inversion pair stats (migration v4 columns). Which executor ×
-- reflector(-model) combination authors lessons that survive grounding?
-- pair_posterior_mean is the Beta-Bernoulli posterior over the pair's pooled
-- grounded outcomes — pairs are comparable exactly like lessons.
CREATE VIEW IF NOT EXISTS v_lyo_pair_stats AS
SELECT
  COALESCE(executor_model, '(unknown)') AS executor_model,
  COALESCE(reflector_policy, '(unknown)') AS reflector_policy,
  COALESCE(reflector_model, '(none)') AS reflector_model,
  COUNT(*) AS lessons,
  SUM(helpful_count) AS helpful,
  SUM(harmful_count) AS harmful,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS promoted,
  SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) AS quarantined,
  CAST(SUM(helpful_count) + 1 AS REAL) / (SUM(helpful_count) + SUM(harmful_count) + 2)
    AS pair_posterior_mean
FROM lesson
GROUP BY executor_model, reflector_policy, reflector_model;
`;

/**
 * Learned-rule store DDL (separate from the lesson-delta schema above).
 * The learned-rule store is a parallel durable store for verifier-gated
 * rules, with the same delta/application pattern as the lesson store.
 */
export const LYO_LEARNED_RULE_DDL = `
CREATE TABLE IF NOT EXISTS learned_rule (
  rule_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_value TEXT NOT NULL,
  condition_json TEXT NOT NULL,
  action_json TEXT NOT NULL,
  status TEXT NOT NULL,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  harmful_count INTEGER NOT NULL DEFAULT 0,
  created_from_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learned_rule_delta (
  delta_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  run_id TEXT,
  actor TEXT NOT NULL,
  delta_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learned_rule_application (
  application_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  trigger_ref TEXT,
  emitted_fact_json TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending',
  counted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(rule_id, run_id, trigger_ref)
);

CREATE INDEX IF NOT EXISTS idx_learned_rule_scope ON learned_rule(kind, scope_kind, scope_value, status);
CREATE INDEX IF NOT EXISTS idx_learned_rule_app_run ON learned_rule_application(run_id, counted);
`;

/**
 * Schema relationship map — three DDL systems, three separate databases:
 *
 * 1. src/schema.ts (initLedger) → .agent-learning/learning.sqlite
 *    Kernel 27-table schema: runs, model_calls, learning_traces, etc.
 *    Written by reducers (recordRun, recordModelCall, recordTrace, ...).
 *
 * 2. LYO_LESSON_DDL (this file, used by LessonStore) → .zeroshot/lyo-lessons.db
 *    Lesson-delta schema: lesson, lesson_delta, lesson_decision, etc.
 *    Has its own learning_trace + preference_pair tables (singular names)
 *    because the lesson store is a separate database (design doc §1.4:
 *    "LYO is the SOLE WRITER of this store: it never shares a run ledger's DB").
 *    The kernel's learning_traces/preference_pairs (plural) are the same
 *    concepts with different names — they serve different stores.
 *
 * 3. LYO_LEARNED_RULE_DDL (this file, used by LearnedRuleStore) → separate db
 *    Learned-rule schema: learned_rule, learned_rule_delta, _application.
 *    Same delta/application pattern as the lesson store, different domain.
 */
