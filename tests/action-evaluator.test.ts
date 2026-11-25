import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trialFixture } from './helpers/finding-trial-fixture.ts';
import { inspectFinding } from '../src/lyo/interface/session-findings.ts';
import * as trials from '../src/lyo/interface/finding-trials.ts';
import { decisionQueueDir } from '../src/lyo/interface/finding-decision-triggers.ts';
import { runDecisionWorker } from '../src/lyo/interface/finding-decision-worker.ts';
import { decisionConfigSchema } from '../src/lyo/decisions/providers.ts';
import { spoolClaudeHookEvent } from '../src/lyo/hooks/runtime.ts';
import type { TypedDecisionProvider } from '../src/lyo/application/typed-decisions.ts';

const EVALUATOR = fileURLToPath(new URL('../eval/finding-evaluators/action-outcome.mjs', import.meta.url));
const config = decisionConfigSchema.parse({ provider: 'mlxcel', mlxcel: { decisionModel: 'test-decider' },
  worker: { idleSeconds: 1, ttlSeconds: 60, maxAgeSeconds: 600, timeoutMs: 1000, maxQueued: 50 } });
const decisions = { config, env: { LYO_DECISION_WORKER: '0' } };
const question = { type: 'score' as const, instructions: 'A JSON parser received input other than the JSON it assumed.',
  criteria: ['1', '2', '3', '4', '5'] };
const calibration = { provider: 'mlxcel' as const, model: 'test-decider', positives: 20, negatives: 20, inputFormat: 'command-output@1' as const,
  testHash: 'h', heldOut: { caught: 18, positives: 20, falseAlarms: 1, negatives: 20, undecided: 1 }, evidence: 'fixture' };

/** Answers each call from a queue of levels (1..5 as a point mass). */
function scripted(levels: number[]) {
  const provider = { name: 'mlxcel', calls: 0, async decide() {
    const level = levels[provider.calls++] ?? 3;
    const probabilities = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 } as Record<string, number>;
    probabilities[String(level - 1)] = 1;
    return { source: 'typed-decision@1' as const, provider: 'mlxcel', requestedModel: 'test-decider', answeredModel: 'test-decider',
      requestHash: 'h', answers: { match: { type: 'score' as const, score: 0, confidence: 1, probabilities, legend: {} } }, usage: null, decidedAt: '' };
  } };
  return provider as TypedDecisionProvider & { calls: number };
}

function setup() {
  const f = trialFixture();
  const basis = { rationale: 'The action evaluator reads the captured command and the calibrated outcome decision.', verifierPaths: [EVALUATOR] };
  const trial = { ...f.trial, id: 'action-trial',
    trigger: { toolName: 'Bash', result: 'failure' as const, decision: { question, band: { no: 2.5, yes: 4 }, calibration } },
    measurement: { ...f.trial.measurement, sourceFiles: [], verifierFiles: [EVALUATOR],
      checks: Object.fromEntries(['applicability', 'adherence', 'prediction'].map(c => [c, `node '${EVALUATOR}' ${c}`])),
      capture: { toolName: 'Bash', next: true as const, measures: 'action' as const } },
    review: { ...f.trial.review, applicability: basis, adherence: basis, prediction: basis } };
  trials.registerFindingTrial(f.store, trial);
  const hook = (event: Record<string, unknown>) => {
    spoolClaudeHookEvent(event as any, { spoolDir: join(f.root, 'spool') });
    return trials.ordinaryFindingTrialFeedback('claude', event, f.storePath, () => 0.1, decisions);
  };
  const worker = (provider: TypedDecisionProvider) => runDecisionWorker({ storePath: f.storePath, queueDir: decisionQueueDir(f.storePath),
    provider, worker: config.worker, sleep: async () => {}, pollMs: 0 });
  const base = { ...f.event, tool_response: undefined };
  const opportunity = () => inspectFinding(f.store, f.findingId).opportunities.find(o => o.registered?.sessionId === f.event.session_id);
  return { f, hook, worker, base, opportunity };
}

/** Failure → trigger yes → enrolled at the next event, ready for the measured next action. */
async function enrolled(s: ReturnType<typeof setup>, provider: TypedDecisionProvider) {
  s.hook({ ...s.base, hook_event_name: 'PostToolUseFailure', tool_use_id: 'trigger-1',
    tool_input: { command: 'curl -s x | python3 -c "import json,sys; json.load(sys.stdin)"' },
    error: 'Exit code 1\njson.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)' });
  await s.worker(provider);
  const enrolledAt = s.hook({ ...s.base, hook_event_name: 'PostToolUse', tool_use_id: 'between-1', tool_input: { command: 'ls' }, tool_response: { exit_code: 0 } });
  assert.equal(enrolledAt.managed, true);
  const registered = s.opportunity()!;
  assert.equal(registered.registered!.applicability.satisfied, true, 'applicability comes from the trigger decision');
  return registered;
}

test('a next command that fails in the same situation measures as fail, after a background decision', async () => {
  const s = setup();
  try {
    const provider = scripted([5, 5]);
    const entry = await enrolled(s, provider);
    const next = { ...s.base, tool_use_id: 'next-1', tool_input: { command: 'databricks jobs get 1 -o json | python3 -c "import json,sys; print(json.load(sys.stdin)[\'x\'])"' } };
    s.hook({ ...next, hook_event_name: 'PreToolUse' });
    s.hook({ ...next, hook_event_name: 'PostToolUseFailure', error: 'Exit code 1\nTraceback\nKeyError: \'x\'' });
    assert.equal(s.f.store.getTrace(`finding-evidence:${entry.id}`), null, 'not measured before the outcome decision');
    s.hook({ ...s.base, hook_event_name: 'Stop', tool_use_id: undefined });
    assert.equal(s.f.store.getTrace(`finding-window:${entry.id}`), null, 'the window stays open while the outcome is pending');
    await s.worker(provider);
    const done = s.opportunity()!;
    assert.equal(done.evidence?.observedOutcome, 'fail');
    assert.equal(done.evidence?.adherence, 'unknown', 'adherence is deferred, never faked');
    assert.ok(s.f.store.getTrace(`finding-window:${entry.id}`), 'the worker closes the window after measuring');
    assert.equal(provider.calls, 2);
    const receipts = s.f.store.db.prepare(`SELECT payload_json FROM learning_trace WHERE trace_id LIKE 'finding-%'`).all()
      .map(r => String(r.payload_json)).join('\n');
    assert.doesNotMatch(receipts, /Traceback/, 'no output text is retained in any receipt');
    assert.match(receipts, /"errorClass":"KeyError"/, 'closed labels are retained');
  } finally { s.f.close(); }
});

test('a failure with a different cause passes; a success passes without any decision', async () => {
  for (const [kind, nextEvent, expectedCalls] of [
    ['other cause', { hook_event_name: 'PostToolUseFailure', error: 'Exit code 1\nzsh: command not found: jqq' }, 2],
    ['success', { hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } }, 1],
  ] as const) {
    const s = setup();
    try {
      const provider = scripted([5, 1]);
      await enrolled(s, provider);
      const next = { ...s.base, tool_use_id: 'next-1', tool_input: { command: 'jqq . out.json' } };
      s.hook({ ...next, hook_event_name: 'PreToolUse' });
      s.hook({ ...next, ...nextEvent });
      await s.worker(provider);
      assert.equal(s.opportunity()!.evidence?.observedOutcome, 'pass', kind);
      assert.equal(provider.calls, expectedCalls, kind);
    } finally { s.f.close(); }
  }
});

test('a declined next command has no outcome decision and no pass/fail outcome', async () => {
  const s = setup();
  try {
    const provider = scripted([5]);
    await enrolled(s, provider);
    const next = { ...s.base, tool_use_id: 'next-1', tool_input: { command: 'rm -rf build' } };
    s.hook({ ...next, hook_event_name: 'PreToolUse' });
    s.hook({ ...next, hook_event_name: 'PostToolUseFailure', error: 'Tool "Bash" was not run because the user rejected the approval' });
    await s.worker(provider);
    const entry = s.opportunity()!;
    assert.equal(provider.calls, 1, 'no outcome decision for a call that never ran');
    assert.match(JSON.stringify(entry.evidence ?? {}), /not executed|unknown/);
    assert.notEqual(entry.evidence?.observedOutcome, 'fail');
    assert.notEqual(entry.evidence?.observedOutcome, 'pass');
  } finally { s.f.close(); }
});
