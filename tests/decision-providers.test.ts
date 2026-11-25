import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecisionProvider, decisionConfigSchema, expectedLevel, configuredDecisionModel } from '../src/lyo/decisions/providers.ts';

const question = { type: 'score' as const, instructions: 'How closely does this match?', criteria: ['no', 'maybe', 'yes'] };
const systemOne = { model: 'answered-model', answers: { match: { type: 'score', score: 1.9, confidence: 0.9,
  probabilities: { '0': 0.05, '1': 0.05, '2': 0.9 }, legend: { '0': 'no', '1': 'maybe', '2': 'yes' } } },
  usage: { input_tokens: 40, output_tokens: 1 } };

function recordingFetch(body: unknown) {
  const calls: Array<{ url: string; body: any; auth: string | null }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('Authorization') });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test('every adapter returns the same provider-neutral record for the same answer', async () => {
  const mlxcelOut = JSON.stringify({ model: 'decider', answers: { match: { type: 'score', value: 1.9,
    probabilities: { '0': 0.05, '1': 0.05, '2': 0.9 }, metadata: { confidence: 0.9, legend: { '0': 'no', '1': 'maybe', '2': 'yes' } } } },
    usage: { input_tokens: 40, output_tokens: 0 } });
  const cases = [
    { config: { provider: 'mlxcel' }, deps: { runMlxcel: async () => `[load] model\n${mlxcelOut}` } },
    { config: { provider: 'openrouter' }, deps: { env: { OPENROUTER_API_KEY: 'k' }, fetch: recordingFetch(systemOne).fetchImpl } },
    { config: { provider: 'jev' }, deps: { env: { TYPESAFE_API_KEY: 'k' }, fetch: recordingFetch(systemOne).fetchImpl } },
  ];
  for (const { config, deps } of cases) {
    const record = await createDecisionProvider(decisionConfigSchema.parse(config), deps as any).decide({ state: 'x', questions: { match: question } });
    assert.equal(record.source, 'typed-decision@1');
    assert.equal(record.answers.match.type, 'score', config.provider);
    assert.deepEqual((record.answers.match as any).probabilities, { '0': 0.05, '1': 0.05, '2': 0.9 }, config.provider);
    assert.ok(Math.abs(expectedLevel(record.answers.match)! - 2.85) < 1e-9, config.provider);
    assert.equal(record.provider, config.provider === 'jev' ? 'typesafe-jev' : config.provider);
  }
});

test('OpenRouter requests zero-data-retention routing, and routing does not change the request hash', async () => {
  const { calls, fetchImpl } = recordingFetch(systemOne);
  const zdr = createDecisionProvider(decisionConfigSchema.parse({ provider: 'openrouter' }), { env: { OPENROUTER_API_KEY: 'secret' }, fetch: fetchImpl });
  const open = createDecisionProvider(decisionConfigSchema.parse({ provider: 'openrouter', openrouter: { zdr: false } }), { env: { OPENROUTER_API_KEY: 'secret' }, fetch: fetchImpl });
  const a = await zdr.decide({ state: 's', questions: { match: question } });
  const b = await open.decide({ state: 's', questions: { match: question } });
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/systemone');
  assert.deepEqual(calls[0].body.provider, { zdr: true, allow_fallbacks: false });
  assert.equal(calls[1].body.provider, undefined);
  assert.equal(calls[0].body.model, 'upstage/solar-decide');
  assert.equal(calls[0].auth, 'Bearer secret');
  assert.equal(a.requestHash, b.requestHash);
});

test('mlxcel maps bool and choice answers, and a server URL replaces the CLI', async () => {
  const { calls, fetchImpl } = recordingFetch({ answers: {
    ok: { type: 'bool', value: true, probability: 0.8 },
    pick: { type: 'choice', value: 'b', probabilities: { a: 0.3, b: 0.7 }, metadata: { confidence: 0.7 } } } });
  const provider = createDecisionProvider(decisionConfigSchema.parse({ provider: 'mlxcel', mlxcel: { serverUrl: 'http://127.0.0.1:9/' } }),
    { fetch: fetchImpl, runMlxcel: async () => { throw new Error('the CLI must not run when a server is configured'); } });
  const record = await provider.decide({ state: 's', questions: { ok: { type: 'noul', instructions: 'q' }, pick: { type: 'choice', criteria: { a: null, b: null } } } });
  assert.equal(calls[0].url, 'http://127.0.0.1:9/v1/decisions');
  assert.deepEqual(record.answers.ok, { type: 'noul', noul: 0.8 });
  assert.deepEqual(record.answers.pick, { type: 'choice', choice: 'b', confidence: 0.7, probabilities: { a: 0.3, b: 0.7 } });
  await assert.rejects(provider.decide({ state: 's', questions: { missing: { type: 'noul', instructions: 'q' } } }), /no answer for missing/);
});

test('a hosted adapter without its key refuses to construct; the configured model names the calibration', () => {
  assert.throws(() => createDecisionProvider(decisionConfigSchema.parse({ provider: 'openrouter' }), { env: {} }), /OPENROUTER_API_KEY/);
  assert.throws(() => createDecisionProvider(decisionConfigSchema.parse({ provider: 'jev' }), { env: {} }), /TYPESAFE_API_KEY/);
  assert.deepEqual(configuredDecisionModel(decisionConfigSchema.parse({ provider: 'mlxcel' })), { provider: 'mlxcel', model: 'nativ-community/decider-2b' });
  assert.deepEqual(configuredDecisionModel(decisionConfigSchema.parse({ provider: 'openrouter' })), { provider: 'openrouter', model: 'upstage/solar-decide' });
});
