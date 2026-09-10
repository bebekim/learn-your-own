// Read-only, deliberately selected retrospective cases; never awards learning credit.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const hash = value => createHash('sha256').update(value).digest('hex');
const home = homedir();
const corpus = new DatabaseSync(`${home}/.lyo/corpus.sqlite`, { readOnly: true });
const lessons = new DatabaseSync(`${home}/.zeroshot/lyo-lessons.db`, { readOnly: true });
corpus.exec('BEGIN');
lessons.exec('BEGIN');
const query = sql => corpus.prepare(sql).all();
const selected = [
  { id: 'mlops-link-check-false-positive', session: '01a08948-8ba3-78d2-bbbc-479ac8a00b00',
    trace: '2026/09/10/rollout-2026-09-10T13-07-08-01a08948-8ba3-78d2-bbbc-479ac8a00b00.jsonl',
    line: 137, block: 3, exit: 1, contains: 'AssertionError', conclusion: 'Link checker rejected paths containing parentheses.' },
  { id: 'mlops-corrected-link-check', session: '01a08948-8ba3-78d2-bbbc-479ac8a00b00',
    trace: '2026/09/10/rollout-2026-09-10T13-07-08-01a08948-8ba3-78d2-bbbc-479ac8a00b00.jsonl',
    line: 146, block: 2, exit: 0, contains: '15 local links verified', conclusion: 'Corrected link parser verified 15 local links.' },
  { id: 'mlops-unsupported-type-check', session: '01a08948-8ba3-78d2-bbbc-479ac8a00b00',
    trace: '2026/09/10/rollout-2026-09-10T13-07-08-01a08948-8ba3-78d2-bbbc-479ac8a00b00.jsonl',
    line: 155, block: 1, exit: 1, contains: 'PYTHON_TYPES_UNSUPPORTED_TARGET', conclusion: 'Required check lacked configured Python type-checker authority; this is not a demonstrated code regression.' },
  { id: 'data-engineering-full-suite-failure', session: '01a0862c-8a58-78a3-adde-93b7b42f9f83',
    trace: '2026/09/09/rollout-2026-09-09T22-37-41-01a0862c-8a58-78a3-adde-93b7b42f9f83.jsonl',
    line: 496, block: 4, exit: 1, contains: '1 failed, 682 passed, 13 skipped', conclusion: 'Full pytest run failed a live-data current-month assertion; cause and task acceptance remain unresolved.' },
  { id: 'data-engineering-subset-pass', session: '01a0862c-8a58-78a3-adde-93b7b42f9f83',
    trace: '2026/09/09/rollout-2026-09-09T22-37-41-01a0862c-8a58-78a3-adde-93b7b42f9f83.jsonl',
    line: 1075, block: 1, exit: 0, contains: '18 passed in', conclusion: 'Three selected test files passed; this does not recheck the earlier failing full-suite test.' },
];

try {
  const observations = selected.map(item => {
    const path = `${home}/.codex/sessions/${item.trace}`;
    const bytes = readFileSync(path);
    const line = bytes.toString().split('\n')[item.line - 1];
    const envelope = JSON.parse(line);
    const result = JSON.parse(envelope.payload.output[item.block].text);
    assert.equal(result.exit_code, item.exit);
    assert.ok(result.output.includes(item.contains));
    const responseHash = hash(JSON.stringify(result.output));
    const matches = corpus.prepare(`SELECT source_ledger_id, event_id, created_at, payload_json
      FROM corpus_events WHERE session_id = ? AND event_name = 'tool.after'
      AND json_extract(payload_json, '$.tool_response.sha256') = ?`).all(item.session, responseHash);
    assert.equal(matches.length, 1, `${item.id}: expected an unambiguous hook fingerprint`);
    const { payload_json, ...event } = matches[0];
    const payload = JSON.parse(payload_json);
    assert.equal(payload.tool_response.truncated, false);
    assert.equal(payload.tool_response.exit_code, undefined);
    assert.equal(payload.tool_response.output_size, result.output.length);
    return { id: item.id, classification: 'retrospective-observation', sessionId: item.session,
      event, toolCallId: payload.tool_use_id, command: payload.tool_input.command,
      outputFingerprint: responseHash, fingerprintFormat: 'sha256(JSON.stringify(stdout))',
      transcript: { path, sha256: hash(bytes), line: item.line, lineSha256: hash(line),
        block: item.block, outerCallId: envelope.payload.call_id },
      observedExitCode: result.exit_code, ledgerExitCode: null, conclusion: item.conclusion,
      prospectiveRegistration: false, taskAcceptance: null, incrementalBenefit: null, causalCredit: false };
  });
  const live = corpus.prepare(`SELECT event_name, payload_json FROM corpus_events
    WHERE lyo_version = '0.4.3-adaptive.4' AND cwd LIKE ?`).all(`${home}/repositories/work/%`);
  const before = live.filter(r => r.event_name === 'tool.before').map(r => JSON.parse(r.payload_json));
  const after = live.filter(r => r.event_name === 'tool.after').map(r => JSON.parse(r.payload_json));
  const pairs = after.filter(a => before.some(b => b.session_id === a.session_id && b.tool_use_id === a.tool_use_id
    && b.tool_name === a.tool_name && JSON.stringify(b.tool_input) === JSON.stringify(a.tool_input)));
  const snapshot = {
    collectedAt: new Date().toISOString(), collectorSha256: hash(readFileSync(new URL(import.meta.url))),
    method: 'Two read-only SQLite transactions; selected original transcript outputs matched by exact untruncated stdout fingerprints. No tasks replayed, no backdated registrations, no learning credit.',
    sampling: 'Convenience sample: most recent work repository plus a recent coding session with recoverable verification outputs. Not a representative or randomized task sample.',
    corpus: query(`SELECT count(*) eventRows, count(DISTINCT event_id) distinctEventIds,
      count(DISTINCT session_id) sessionIds, count(DISTINCT source_ledger_id) sourceLedgers,
      min(created_at) earliestEvent, max(created_at) latestEvent FROM corpus_events`)[0],
    workCorpus: corpus.prepare(`SELECT count(*) eventRows, count(DISTINCT event_id) distinctEventIds,
      count(DISTINCT session_id) sessionIds, count(DISTINCT source_ledger_id) sourceLedgers
      FROM corpus_events WHERE cwd LIKE ?`).get(`${home}/repositories/work/%`),
    registeredWorkTasks: corpus.prepare('SELECT count(*) n FROM task_attempts WHERE cwd LIKE ?').get(`${home}/repositories/work/%`).n,
    deliveryTraceSources: lessons.prepare(`SELECT json_extract(payload_json,'$.source') source,
      count(*) n, max(created_at) latest FROM learning_trace GROUP BY 1`).all(),
    deliveryTracePrefixes: lessons.prepare(`SELECT substr(trace_id,1,instr(trace_id,':')-1) prefix,
      count(*) n FROM learning_trace GROUP BY 1`).all(),
    lessonCounters: lessons.prepare('SELECT lesson_id,status,helpful_count,harmful_count,uses FROM lesson').all(),
    upgradedWorkHooks: { version: '0.4.3-adaptive.4', eventRows: live.length,
      sessions: [...new Set(live.map(r => JSON.parse(r.payload_json).session_id))],
      before: before.length, after: after.length, exactInputPairs: pairs.length,
      bashAfter: after.filter(p => p.tool_name === 'Bash').length,
      bashAfterWithExitCode: after.filter(p => p.tool_name === 'Bash' && Number.isInteger(p.tool_response?.exit_code)).length },
    observations,
  };
  writeFileSync(new URL('./snapshot.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
  console.log(JSON.stringify({ corpus: snapshot.corpus, workCorpus: snapshot.workCorpus,
    registeredWorkTasks: snapshot.registeredWorkTasks, upgradedWorkHooks: snapshot.upgradedWorkHooks,
    observations: observations.map(o => ({ id: o.id, event: o.event.event_id, exitCode: o.observedExitCode })) }, null, 2));
} finally {
  corpus.close();
  lessons.close();
}
