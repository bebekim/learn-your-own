import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashValue } from '../../contract/refs.ts';
import { fingerprintHookValue } from '../../adapters/runtime.ts';
import { createKernel, closeKernel, type LearningKernel } from '../../ledger.ts';
import { extractHookFacts } from '../../hooks/normalizer.ts';
import { isWithinRoot, workspaceSyncConfig } from '../../corpus/workspace-sync.ts';
import { FeedbackController, type ControlDecision } from './feedback-controller.ts';
import { nativeCheckReceiptSchema } from './native-check.ts';

type Runtime = 'codex' | 'claude';
type Status = 'passed' | 'failed' | 'unknown';
interface Measurement { status: Status; basis: string; exitCode?: number; cwd?: string }
interface NativeOutput { additionalContext?: string; permissionDecision?: 'allow'; updatedInput?: Record<string, unknown> }
interface Turn {
  model: string;
  turnId?: string;
  startedAfter?: number;
  episodeId?: string;
  commandKey?: string;
  origin?: number;
  status?: Status;
  resultRef?: string;
  pending?: Record<string, string>;
  closed?: boolean;
}

function specification(runtime: Runtime) {
  return { domain: `coding/native-recovery/${runtime}`, objective: 'same-check-last-result-passes-at-turn-stop@1',
    evaluator: `${runtime}-foreground-check@1`, stateSchema: 'verifier-class-and-model@1',
    actions: ['no-guidance', 'recovery-reminder'], baselineAction: 'no-guidance' };
}

/** A hook emits context; the experiment measures the subsequent check, not whether advice was obeyed. */
export function nativeFeedback(runtime: Runtime, event: Record<string, any>, env = process.env): NativeOutput | null {
  // Kimi shares the hook command, but not Claude's measurement and delivery contract.
  if (event.client_type === 'kimi_code_cli') return null;
  const name = event.hook_event_name;
  if (!['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SessionEnd'].includes(name)) return null;
  const config = workspaceSyncConfig(env);
  if (!config?.adaptiveFeedback || typeof event.session_id !== 'string' || !event.session_id.trim()
    || typeof event.cwd !== 'string') return null;
  const cwd = realpathSync(event.cwd);
  if (!isWithinRoot(config.rootDir, cwd)) return null;
  const kernel = createKernel({ dbPath: config.corpusPath });
  try {
    const controller = new FeedbackController(kernel, specification(runtime));
    const db = kernel.db;
    db.exec(`CREATE TABLE IF NOT EXISTS native_control_sessions (id TEXT PRIMARY KEY, record_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS native_control_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        record_json TEXT NOT NULL, output TEXT);`);
    db.exec('BEGIN IMMEDIATE');
    try {
      const sessionKey = hashValue([runtime, event.session_id, cwd]);
      const stored = db.prepare('SELECT record_json FROM native_control_sessions WHERE id = ?').get(sessionKey);
      let turn: Turn = stored ? JSON.parse(String(stored.record_json)) : { model: 'unknown' };
      const finish = (reward: number | null, reason: string) => {
        if (!turn.episodeId || turn.closed) return;
        const { decision } = controller.inspect(turn.episodeId);
        const boundaryId = hashValue([sessionKey, turn.episodeId, name]);
        const boundary = { runtime, sessionId: event.session_id, cwd, name, reason, reward,
          resultRef: turn.resultRef ?? null, pendingChecks: turn.pending ?? {}, createdAt: new Date().toISOString() };
        const sequence = Number(db.prepare('INSERT INTO native_control_events (id, record_json) VALUES (?, ?)')
          .run(boundaryId, JSON.stringify(boundary)).lastInsertRowid);
        controller.feedback({ decisionId: decision.id, executedAction: decision.action,
          evaluator: decision.specification.evaluator, reward, evidenceRef: `native-hook:${sequence}` });
        turn.closed = true;
      };
      const differentTurn = event.turn_id && turn.turnId && event.turn_id !== turn.turnId;
      if (differentTurn && !['SessionStart', 'UserPromptSubmit', 'PreToolUse'].includes(name)) {
        db.exec('COMMIT');
        return null;
      }
      if (name === 'SessionStart' || (name === 'UserPromptSubmit' && (!event.turn_id || differentTurn || !turn.turnId))
        || (name === 'PreToolUse' && differentTurn)) {
        finish(null, 'new turn or resumed session before a measured Stop');
        turn = { model: turn.model, startedAfter: Number(db.prepare(
          'SELECT COALESCE(MAX(sequence), 0) sequence FROM native_control_events').get()!.sequence) };
      }
      if (typeof event.model === 'string') turn.model = event.model;
      if (typeof event.turn_id === 'string') turn.turnId = event.turn_id;
      let output: NativeOutput | null = null;
      if (name === 'Stop' || name === 'SessionEnd') {
        finish(name === 'SessionEnd' || turn.status === 'unknown' || Object.keys(turn.pending ?? {}).length
          ? null : turn.status === 'passed' ? 1 : 0,
          name === 'Stop' ? 'turn stopped' : 'session ended without a measured Stop');
      } else if (event.tool_use_id && typeof event.tool_use_id === 'string') {
        const beforeId = hashValue([sessionKey, event.tool_use_id, 'PreToolUse']);
        const before = db.prepare('SELECT sequence, record_json FROM native_control_events WHERE id = ?').get(beforeId);
        const original = before ? JSON.parse(String(before.record_json)) : null;
        const command = original ? { argv: original.command, classification: original.classification }
          : extractHookFacts({ eventId: event.tool_use_id, sessionId: event.session_id,
          turnId: event.turn_id ?? null, cwd, eventName: name, payloadJson: JSON.stringify(event) }).commands[0];
        if (command && ['test', 'build', 'lint'].includes(command.classification)) {
          let workdir = original?.workdir ?? resolve(cwd, event.tool_input?.workdir ?? event.tool_input?.cwd ?? '.');
          const id = hashValue([sessionKey, event.tool_use_id, name]);
          const prior = db.prepare('SELECT output FROM native_control_events WHERE id = ?').get(id);
          if (prior) output = prior.output === null ? null : JSON.parse(String(prior.output));
          else {
            const measurement = measure(runtime, event, original);
            const { status } = measurement;
            workdir = measurement.cwd ?? workdir;
            const commandKey = hashValue([command.argv, workdir]);
            let receiptPath: string | undefined;
            // Only simple foreground checks: shell pipelines and stateful command lists keep their original execution.
            if (runtime === 'codex' && name === 'PreToolUse' && event.tool_name === 'Bash'
              && !event.tool_input?.run_in_background && !/[;&|<>\n`$()]/.test(command.argv)) {
              const receipts = join(cwd, '.agent-learning', 'control-receipts');
              for (const parent of [join(cwd, '.agent-learning'), receipts]) {
                if (existsSync(parent) && !isWithinRoot(cwd, realpathSync(parent)))
                  throw new Error('Measurement directory points outside the workspace');
              }
              mkdirSync(receipts, { recursive: true });
              receiptPath = join(receipts, `${id}.json`);
              const request = Buffer.from(JSON.stringify({ id, command: command.argv,
                workspace: cwd, receiptPath })).toString('base64url');
              const executable = fileURLToPath(new URL(`./native-check.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url));
              const wrapped = [process.execPath, executable, request].map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ');
              output = { permissionDecision: 'allow', updatedInput: { ...event.tool_input, command: wrapped } };
            }
            const observation = { runtime, sessionId: event.session_id, cwd, workdir, name,
              toolUseId: event.tool_use_id, command: command.argv, classification: command.classification,
              id, commandKey, receiptPath,
              measurement, resultHash: fingerprintHookValue(event.tool_response ?? event.error ?? null),
              createdAt: new Date().toISOString() };
            const sequence = Number(db.prepare('INSERT INTO native_control_events (id, record_json) VALUES (?, ?)')
              .run(id, JSON.stringify(observation)).lastInsertRowid);
            const ref = `native-hook:${sequence}`;
            if (name === 'PreToolUse' && turn.episodeId && !turn.closed && commandKey === turn.commandKey) {
              (turn.pending ??= {})[event.tool_use_id] = ref;
            }
            if (name !== 'PreToolUse' && !turn.closed && before && Number(before.sequence) > (turn.startedAfter ?? 0)) {
              if (turn.pending) delete turn.pending[event.tool_use_id];
              if (!turn.episodeId && status === 'failed') {
                const episodeId = `native:${runtime}:${id}`;
                const decision = controller.decide({ episodeId,
                  state: { verifier: command.classification, model: turn.model }, observationRef: ref,
                  ...config.adaptiveFeedback });
                turn = { ...turn, episodeId, commandKey, origin: sequence, status: 'failed', resultRef: ref };
                if (decision.action === 'recovery-reminder') output = { additionalContext:
                  `LYO recovery experiment: a ${command.classification} check failed. ` +
                  'Use its failure output to diagnose the cause, make the smallest justified correction, ' +
                  'and rerun the same check before finishing this turn. Report an unresolved check honestly.' };
              } else if (turn.episodeId && commandKey === turn.commandKey
                && Number(before.sequence) > turn.origin!) {
                turn.status = status;
                turn.resultRef = ref;
              }
            }
            db.prepare('UPDATE native_control_events SET output = ? WHERE sequence = ?').run(output ? JSON.stringify(output) : null, sequence);
          }
        }
      }
      db.prepare('INSERT INTO native_control_sessions VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json')
        .run(sessionKey, JSON.stringify(turn));
      db.exec('COMMIT');
      return output;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } finally { closeKernel(kernel); }
}

function measure(runtime: Runtime, event: Record<string, any>, original?: Record<string, any>): Measurement {
  const result = event.tool_response;
  if (event.tool_input?.run_in_background || event.is_interrupt || result?.interrupted || result?.backgroundTaskId)
    return { status: 'unknown', basis: 'interrupted-or-background' };
  if (runtime === 'codex' && event.hook_event_name === 'PostToolUse' && original?.receiptPath && existsSync(original.receiptPath)) {
    try {
      const receipt = nativeCheckReceiptSchema.parse(JSON.parse(readFileSync(original.receiptPath, 'utf8')));
      if (receipt.id !== original.id || receipt.commandHash !== hashValue(original.command) || receipt.exitCode === null || receipt.signal)
        return { status: 'unknown', basis: 'unmatched-or-interrupted-receipt' };
      return { status: receipt.exitCode === 0 ? 'passed' : 'failed', basis: 'command-receipt', exitCode: receipt.exitCode, cwd: receipt.cwd };
    } catch { return { status: 'unknown', basis: 'invalid-receipt' }; }
  }
  const exit = result?.exit_code;
  if (Number.isSafeInteger(exit)) return { status: exit === 0 ? 'passed' : 'failed', basis: 'numeric-exit-status', exitCode: exit };
  if (runtime === 'claude' && event.tool_name === 'Bash') {
    if (event.hook_event_name === 'PostToolUseFailure' && /^Exit code [1-9]\d*\n/.test(event.error ?? ''))
      return { status: 'failed', basis: 'claude-bash-failure-envelope' };
    if (event.hook_event_name === 'PostToolUse' && result?.interrupted === false
      && typeof result.stdout === 'string' && typeof result.stderr === 'string')
      return { status: 'passed', basis: 'claude-bash-foreground-success' };
  }
  return { status: 'unknown', basis: 'no-supported-status' };
}

export function nativeFeedbackStatus(kernel: LearningKernel) {
  // ponytail: scan the small native experiment history; use paged SQL aggregation if reports become slow.
  const evidence = (ref: string): any => {
    const sequence = /^native-hook:(\d+)$/.exec(ref)?.[1];
    if (!sequence) return null;
    const row = kernel.db.prepare('SELECT record_json FROM native_control_events WHERE sequence = ?').get(Number(sequence));
    return row ? JSON.parse(String(row.record_json)) : null;
  };
  const exists = kernel.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'control_decisions'").get();
  const nativeExists = kernel.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'native_control_events'").get();
  const decisions = exists ? kernel.db.prepare(`SELECT record_json FROM control_decisions
    WHERE json_extract(record_json, '$.specification.domain') LIKE 'coding/native-recovery/%' ORDER BY rowid DESC`)
    .all().map(row => JSON.parse(String(row.record_json)) as ControlDecision) : [];
  const episodes = decisions.map(decision => ({ decision, observation: evidence(decision.observationRef), feedback: kernel.db.prepare(
    'SELECT record_json FROM control_feedback WHERE decision_id = ? ORDER BY sequence').all(decision.id)
    .map(row => {
      const feedback = JSON.parse(String(row.record_json));
      const boundary = evidence(feedback.evidenceRef);
      return { ...feedback, evidence: boundary ? { ...boundary,
        result: boundary.resultRef ? evidence(boundary.resultRef) : null } : null };
    }) }));
  return { ok: true, dbPath: kernel.dbPath, decisions: episodes.length,
    observations: nativeExists ? Number(kernel.db.prepare('SELECT COUNT(*) n FROM native_control_events').get()!.n) : 0,
    sessions: nativeExists ? Number(kernel.db.prepare('SELECT COUNT(*) n FROM native_control_sessions').get()!.n) : 0,
    measured: episodes.filter(row => row.feedback.some(f => f.reward !== null)).length,
    unknown: episodes.filter(row => row.feedback.length && row.feedback.every(f => f.reward === null)).length,
    pending: episodes.filter(row => !row.feedback.length).length,
    recent: episodes.slice(0, 20) };
}
