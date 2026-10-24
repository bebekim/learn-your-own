import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { DEFAULT_JEV_MODEL, jevProvider, typedDecisionProviderFromEnv } from '../src/lyo/decisions/jev.ts';
import { choiceVerdict, noulVerdict } from '../src/lyo/domain/typed-decision.ts';

// The shape returned by a live POST /v1/systemone call on 2026-10-24.
const LIVE_ANSWER = { model: 'jev-1.14.0', answers: {
  transfer: { type: 'noul', noul: 0.96 },
  kind: { type: 'choice', choice: 'bugfix', confidence: 0.97, probabilities: { bugfix: 0.98, feature: 0, refactor: 0.02, review: 0 } },
}, usage: { input_tokens: 472, output_tokens: 78 } };

const REQUEST = { state: 'Port the trimming fix from the parser to the CSV reader.', questions: {
  transfer: { type: 'noul' as const, instructions: 'The request reuses an existing repair elsewhere.' },
  kind: { type: 'choice' as const, criteria: { bugfix: 'fix behaviour', feature: 'add behaviour', refactor: null, review: null } },
} };

async function fakeTypeSafe(handler: (req: IncomingMessage, body: string, res: ServerResponse) => void) {
  const seen: Array<{ method?: string; url?: string; authorization?: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body }); handler(req, body, res); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { baseUrl, seen, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

const json = (res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(value));
};

test('decide sends the pinned model and records what answered', async () => {
  const api = await fakeTypeSafe((_req, _body, res) => json(res, 200, LIVE_ANSWER));
  try {
    const record = await jevProvider({ apiKey: 'test-key', baseUrl: api.baseUrl }).decide(REQUEST);
    assert.deepEqual(api.seen.map(r => [r.method, r.url, r.authorization]), [['POST', '/v1/systemone', 'Bearer test-key']]);
    assert.deepEqual(JSON.parse(api.seen[0].body), { model: DEFAULT_JEV_MODEL, ...REQUEST });
    assert.equal(record.answeredModel, 'jev-1.14.0');
    assert.deepEqual(record.usage, { inputTokens: 472, outputTokens: 78 });
    assert.match(record.requestHash, /^[0-9a-f]{64}$/);
    assert.equal(noulVerdict(record.answers.transfer, { yes: 0.7, no: 0.3 }), 'yes');
    assert.equal(choiceVerdict(record.answers.kind, 0.5), 'bugfix');
  } finally { await api.close(); }
});

test('rate limits are retried after retry-after; validation errors surface their detail', async () => {
  let calls = 0;
  const api = await fakeTypeSafe((_req, _body, res) => {
    calls++;
    if (calls === 1) return json(res, 429, { detail: 'slow down' }, { 'retry-after': '2' });
    if (calls === 2) return json(res, 200, LIVE_ANSWER);
    return json(res, 422, { detail: [{ loc: ['body', 'questions'], msg: 'Field required', type: 'missing' }] });
  });
  const waits: number[] = [];
  try {
    const provider = jevProvider({ apiKey: 'k', baseUrl: api.baseUrl, sleep: async ms => { waits.push(ms); } });
    await provider.decide(REQUEST);
    assert.deepEqual(waits, [2000]);
    await assert.rejects(provider.decide(REQUEST), (error: any) => error.status === 422 && /Field required/.test(error.message));
  } finally { await api.close(); }
});

test('a response outside the API contract, or missing an answer, is an error rather than a decision', async () => {
  const replies = [
    { ...LIVE_ANSWER, answers: { ...LIVE_ANSWER.answers, transfer: { type: 'noul', noul: 1.4 } } },
    { ...LIVE_ANSWER, answers: { transfer: LIVE_ANSWER.answers.transfer } },
    { ...LIVE_ANSWER, answers: { ...LIVE_ANSWER.answers, kind: { type: 'noul', noul: 0.5 } } },
  ];
  const api = await fakeTypeSafe((_req, _body, res) => json(res, 200, replies.shift()));
  try {
    const provider = jevProvider({ apiKey: 'k', baseUrl: api.baseUrl });
    await assert.rejects(provider.decide(REQUEST), /did not match the API contract/);
    await assert.rejects(provider.decide(REQUEST), /no choice answer for kind/);
    await assert.rejects(provider.decide(REQUEST), /no choice answer for kind/);
  } finally { await api.close(); }
});

test('models lists the account aliases, and nothing is configured without a key', async () => {
  const api = await fakeTypeSafe((_req, _body, res) => json(res, 200, { models: [
    { name: 'jev-latest', description: 'Jev', release_date: '2026-09-10T18:38:01.391457+00:00' }] }));
  try {
    assert.deepEqual((await jevProvider({ apiKey: 'k', baseUrl: api.baseUrl }).models()).map(m => m.name), ['jev-latest']);
    assert.equal(api.seen[0].url, '/v1/models');
  } finally { await api.close(); }
  assert.equal(typedDecisionProviderFromEnv({}), null);
  assert.equal(typedDecisionProviderFromEnv({ JEV_API_KEY: 'k' })?.name, 'typesafe-jev');
});

test('verdicts keep an undecided band as unknown', () => {
  const band = { yes: 0.7, no: 0.3 };
  assert.deepEqual([0.71, 0.5, 0.29].map(noul => noulVerdict({ type: 'noul', noul }, band)), ['yes', 'unknown', 'no']);
  assert.equal(choiceVerdict({ type: 'choice', choice: 'a', confidence: 0.4, probabilities: { a: 0.7, b: 0.3 } }, 0.5), 'unknown');
  assert.throws(() => noulVerdict({ type: 'noul', noul: 0.5 }, { yes: 0.3, no: 0.7 }), /no < yes/);
});
