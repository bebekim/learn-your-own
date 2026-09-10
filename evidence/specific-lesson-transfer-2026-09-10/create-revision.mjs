// Transcribe the approved wording with its actual drafting-turn cost; no model call.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createKernel, closeKernel } from '../../src/ledger.ts';
import { hashValue } from '../../src/contract/refs.ts';
import { TaskFeedback } from '../../src/lyo/control/task-feedback.ts';
import { renderTaskIntervention } from '../../src/lyo/control/task-intervention.ts';

const parentId = '975c1140f2b7b8c5bae5817a9cf2f74a8b9f780b2fccf45d2cc742b21a8e8799';
const turnId = '01a08689-0cc1-7bc3-b75b-03dbd9f1a476';
const tracePath = '/Users/marcus.kim/.codex/sessions/2026/09/08/rollout-2026-09-08T18-40-31-01a0802d-0fb4-7fb1-b6f9-d0cbedd5c7d2.jsonl';
const intervention = 'When a string must contain meaningful text, validate its trimmed length while preserving the original accepted value.';
const rows = readFileSync(tracePath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const start = rows.findIndex(r => r.type === 'event_msg' && r.payload.type === 'task_started' && r.payload.turn_id === turnId);
const end = rows.findIndex((r, i) => i > start && r.type === 'event_msg' && r.payload.type === 'task_complete' && r.payload.turn_id === turnId);
assert.ok(start >= 0 && end > start);
const turn = rows.slice(start, end + 1);
const usage = turn.filter(r => r.type === 'token_usage_record').map(r => r.payload);
assert.equal(usage.length, 1);
assert.equal(usage[0].usage.total_tokens, 136402);
const response = turn.find(r => r.type === 'response_item' && r.payload.type === 'message'
  && r.payload.role === 'assistant' && JSON.stringify(r.payload.content).includes(intervention)).payload;
const draftingReceipt = { tracePath, turnId, response, usage,
  startedAt: rows[start].timestamp, completedAt: rows[end].timestamp };

const kernel = createKernel({ dbPath: process.argv[2] ?? '/Users/marcus.kim/.lyo/corpus.sqlite' });
try {
  const loop = new TaskFeedback(kernel), parent = loop.intervention(parentId);
  const { id, evaluations, ...base } = parent;
  const content = { ...base, revisionOf: parentId, proposal: { ...parent.proposal, intervention },
    generator: { kind: 'assistant-revision', model: 'gpt-6-astra', approval: 'User: 1. 2. 3 proceed in the order',
      response, draftingReceipt },
    cost: { sourceTokens: parent.cost.sourceTokens, reflectionTokens: usage[0].usage.total_tokens,
      totalTokens: parent.cost.sourceTokens + usage[0].usage.total_tokens,
      analysisWallTimeMs: Date.parse(draftingReceipt.completedAt) - Date.parse(draftingReceipt.startedAt),
      wallTimeMs: loop.inspect(parent.source.attemptId).receipt.measurement.wallTimeMs
        + Date.parse(draftingReceipt.completedAt) - Date.parse(draftingReceipt.startedAt) },
    createdAt: draftingReceipt.completedAt };
  const revision = { ...content, id: hashValue(content) };
  assert.equal(revision.status, 'candidate');
  assert.deepEqual(revision.mechanism, parent.mechanism);
  assert.deepEqual(revision.proposal.repair, parent.proposal.repair);
  const key = hashValue(['task-approved-revision@1', parentId, intervention, turnId]);
  const saved = kernel.db.prepare('SELECT record_json FROM task_interventions WHERE id = ?').get(key);
  if (saved) assert.deepEqual(JSON.parse(saved.record_json), revision);
  else kernel.db.prepare('INSERT INTO task_interventions VALUES (?, ?)').run(key, JSON.stringify(revision));
  assert.deepEqual(loop.intervention(parentId), parent, 'the parent must stay unchanged');
  const policy = loop.trial(revision.id);
  assert.equal(policy.training.totalTokens, 442269);
  for (const [name, value] of Object.entries({ 'revision.json': revision, 'policy.json': policy, 'drafting-receipt.json': draftingReceipt }))
    writeFileSync(new URL(name, import.meta.url), JSON.stringify(value, null, 2) + '\n');
  writeFileSync(new URL('candidate.md', import.meta.url), renderTaskIntervention(revision));
  console.log(JSON.stringify({ revisionId: revision.id, policyId: policy.id, draftingTokens: revision.cost.reflectionTokens,
    recordedSourceAndLearningTokens: policy.training.totalTokens }));
} finally { closeKernel(kernel); }
