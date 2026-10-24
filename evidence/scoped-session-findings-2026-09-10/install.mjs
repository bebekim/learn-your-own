// Publish the three user-approved observations; no model calls or lesson credit.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createKernel, closeKernel } from '../../src/lyo/storage/ledger.ts';
import { recordTrace } from '../../src/lyo/storage/reducers/core.ts';
import { hashValue } from '../../src/lyo/contract/refs.ts';
import { LessonStore } from '../../src/lyo/storage/lesson-store.ts';
import { renderSessionLessons, resolveSessionLessonStorePath } from '../../src/lyo/selection/session-hook.ts';

const repo = '/Users/marcus.kim/repositories/individual/agent-learning-workflow';
const gitCommonDir = realpathSync(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
  { cwd: repo, encoding: 'utf8' }).trim());
const report = JSON.parse(readFileSync(new URL('../specific-lesson-transfer-2026-09-10/report.json', import.meta.url), 'utf8'));
const { reportId, ...body } = report;
assert.equal(hashValue(body), reportId);
const evidenceRef = `task-report:${reportId}`;
const findings = [
  { activity: 'transfer-review',
    observation: 'The guided fix accepted U+0085; baseline rejected it. Source repair verification did not establish transfer to the new Unicode contract.',
    intervention: 'When reusing a repair, compare the source and target semantics and test their boundary cases. JavaScript trim() does not cover every Unicode whitespace character.' },
  { activity: 'experiment-design',
    observation: 'Both arms passed the frozen verifier, which omitted U+0085. Legacy guidance varied in order, and approval waiting distorted the timing comparison.',
    intervention: 'Before comparing interventions, audit verifier coverage, fix ambient guidance, and measure execution separately from approval waiting.' },
  { activity: 'learning-budget',
    observation: 'Both attempts exceeded 100,000 tokens. Evaluation spent 324,915 tokens with no validated benefit; engineering and orchestration added millions more.',
    intervention: 'Before a learning trial, set an enforceable spending limit and include acquisition, evaluation and orchestration costs. A post-run budget check cannot stop token use.' },
].map(value => ({ source: 'session-finding@1', gitCommonDir, evidenceRef, ...value }));
const storePath = resolveSessionLessonStorePath(repo);
assert.ok(storePath, 'an existing delivery store is required');
const kernel = createKernel({ dbPath: '/Users/marcus.kim/.lyo/corpus.sqlite' });
const store = new LessonStore(storePath);
try {
  const source = kernel.db.prepare('SELECT record_json FROM task_reports WHERE id = ?').get(reportId);
  assert.ok(source); assert.deepEqual(JSON.parse(source.record_json), body);
  const libraryBefore = store.db.prepare('SELECT * FROM v_lesson_library ORDER BY lesson_id').all();
  const ids = [];
  for (const payload of findings) {
    assert.ok(payload.intervention.length <= 220 && payload.observation.length <= 240);
    const traceId = `finding:catalog-20260910:${payload.activity}`;
    const summary = `Approved observed finding: ${payload.activity}; future usefulness unvalidated.`;
    const central = kernel.db.prepare('SELECT payload_json FROM learning_traces WHERE trace_id = ?').get(traceId);
    if (central) assert.deepEqual(JSON.parse(central.payload_json), payload);
    else recordTrace(kernel, { traceId, kind: 'behavior', summary, ref: evidenceRef, payload });
    const delivery = store.getTrace(traceId);
    if (delivery) assert.deepEqual(JSON.parse(delivery.payload_json), payload);
    else store.recordTrace({ trace_id: traceId, kind: 'behavior', summary, ref: evidenceRef, payload });
    ids.push(traceId);
  }
  assert.deepEqual(store.db.prepare('SELECT * FROM v_lesson_library ORDER BY lesson_id').all(), libraryBefore,
    'publishing findings must not change ordinary lesson selection or credit');
  const rendered = renderSessionLessons({ cwd: repo });
  for (const payload of findings) assert.ok(rendered.includes(payload.intervention));
  assert.ok(!rendered.includes('validate its trimmed length while preserving the original accepted value'));
  writeFileSync(new URL('findings.json', import.meta.url), JSON.stringify(findings, null, 2) + '\n');
  const receipt = { sourceReportId: reportId, centralDb: kernel.dbPath ?? '/Users/marcus.kim/.lyo/corpus.sqlite',
    deliveryStore: storePath, findingIds: ids, libraryUnchanged: true, creditAwarded: false };
  writeFileSync(new URL('installation.json', import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} finally { store.close(); closeKernel(kernel); }
