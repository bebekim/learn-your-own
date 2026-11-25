import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { readFailureEpisodes } from '../src/lyo/hypotheses/episodes.ts';
import { openRouterGenerator, parseProposals, type HypothesisGenerator, type Proposal } from '../src/lyo/hypotheses/generator.ts';
import { acceptHypothesis, evaluateRecurrence, hypothesisMatches, listHypotheses, recordHypothesisMatch } from '../src/lyo/hypotheses/store.ts';
import { harvestHypothesis, proposeHypotheses, replayHypothesis } from '../src/lyo/hypotheses/pipeline.ts';
import { shadowHypotheses } from '../src/lyo/hypotheses/shadow.ts';
import { runDecisionWorker } from '../src/lyo/interface/finding-decision-worker.ts';
import { decisionQueueDir } from '../src/lyo/interface/finding-decision-triggers.ts';
import { decisionConfigSchema } from '../src/lyo/decisions/providers.ts';
import type { TypedDecisionProvider } from '../src/lyo/application/typed-decisions.ts';

const config = decisionConfigSchema.parse({ provider: 'mlxcel', generator: { provider: 'openrouter', maxShadowing: 2 },
  worker: { idleSeconds: 1, ttlSeconds: 60, maxAgeSeconds: 600, timeoutMs: 1000, maxQueued: 50 } });

/** One transcript: failures with repairs, a declined call, and a success. `json` failures are JSON-input failures. */
function transcript(root: string, project: string, repoRoot: string, entries: Array<{ id: string; at: string; command: string; error?: string; repair?: string; ok?: boolean }>) {
  const dir = join(root, project); mkdirSync(dir, { recursive: true });
  // A real repository, so the episode's working directory resolves to a repository identity.
  const repo = join(repoRoot, project); mkdirSync(repo, { recursive: true }); execFileSync('git', ['init', '-q', repo]);
  const lines: string[] = [];
  for (const e of entries) {
    const meta = { sessionId: `s-${project}`, cwd: repo, timestamp: e.at };
    lines.push(JSON.stringify({ ...meta, type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: e.id, name: 'Bash', input: { command: e.command } }] } }));
    lines.push(JSON.stringify({ ...meta, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: e.id, is_error: !e.ok, content: e.error ?? 'fine' }] } }));
    if (e.repair) lines.push(JSON.stringify({ ...meta, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: e.repair }] } }));
  }
  writeFileSync(join(dir, 'session.jsonl'), lines.join('\n') + '\n');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lyo-hyp-')), projects = join(root, 'projects');
  const json = (i: number, day: string, repo: string) => ({ id: `${repo}-j${i}`, at: `2026-${day}T10:0${i}:00Z`, command: `curl x | python3 -c "import json,sys; json.load(sys.stdin)"`,
    error: 'Exit code 1\njson.decoder.JSONDecodeError: Expecting value', repair: 'The output was not JSON; I looked at it raw first.' });
  const repos = join(root, 'repos');
  transcript(projects, 'alpha', repos, [json(1, '09-03', 'alpha'), json(2, '09-10', 'alpha'), json(3, '10-02', 'alpha'), json(4, '10-20', 'alpha'),
    { id: 'alpha-quote', at: '2026-09-04T10:00:00Z', command: 'echo "$X"', error: 'Exit code 127\nzsh: command not found: foo', repair: 'Quoting problem.' },
    { id: 'alpha-denied', at: '2026-09-05T10:00:00Z', command: 'rm -rf x', error: "The user doesn't want to proceed with this tool use." },
    { id: 'alpha-ok', at: '2026-09-06T10:00:00Z', command: 'ls', ok: true }]);
  transcript(projects, 'beta', repos, [json(1, '09-12', 'beta'), json(2, '10-05', 'beta'), json(3, '10-25', 'beta'),
    { id: 'beta-test', at: '2026-10-06T10:00:00Z', command: 'npm test', error: 'Exit code 1\n1 failing', repair: 'Fixed the assertion.' }]);
  const store = new LessonStore(join(root, 'lessons.db'));
  return { root, projects, store, storePath: join(root, 'lessons.db'), close: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}

const proposal = (over: Partial<Proposal> = {}): Proposal => ({ situation: 'A JSON parser received input other than the JSON it assumed.',
  question: { type: 'score', instructions: 'How closely does this failure match: JSON parser got non-JSON input?', criteria: ['1', '2', '3', '4', '5'] },
  advice: 'Look at raw output before parsing JSON.', rivals: ['The API was down.'], predicted: { matchesPerMonth: 2, repositories: 2 },
  exampleIds: ['alpha-j1', 'alpha-j2', 'beta-j1'], rival: false, ...over });

const generator = (proposals: Proposal[]): HypothesisGenerator & { seen: string[][] } => {
  const g = { name: 'fake', seen: [] as string[][], async propose(req: { episodes: Array<{ id: string }> }) {
    g.seen.push(req.episodes.map(e => e.id));
    return { provider: 'fake', model: 'fake-1', proposals, rejected: 0, usage: null };
  } };
  return g as any;
};

/** Scores JSON-input failures 5 and everything else 1. */
function decider() {
  const p = { name: 'mlxcel', calls: 0, async decide(req: { state: unknown }) {
    p.calls++;
    const level = String(req.state).includes('JSONDecodeError') ? 4 : 0;
    const probabilities: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }; probabilities[String(level)] = 1;
    return { source: 'typed-decision@1' as const, provider: 'mlxcel', requestedModel: 'm', answeredModel: 'm', requestHash: 'h',
      answers: { match: { type: 'score' as const, score: level, confidence: 1, probabilities, legend: {} } }, usage: null, decidedAt: '' };
  } };
  return p as TypedDecisionProvider & { calls: number };
}

test('episodes are executed failures with their repairs; declined calls and successes are excluded', () => {
  const f = fixture();
  try {
    const all = readFailureEpisodes({ root: f.projects });
    assert.deepEqual(all.map(e => e.id).sort(), ['alpha-j1', 'alpha-j2', 'alpha-j3', 'alpha-j4', 'alpha-quote', 'beta-j1', 'beta-j2', 'beta-j3', 'beta-test']);
    const sept = readFailureEpisodes({ root: f.projects, from: new Date('2026-09-01'), until: new Date('2026-10-01') });
    assert.equal(sept.length, 4);
    const j1 = all.find(e => e.id === 'alpha-j1')!;
    assert.equal(j1.errorClass, 'JSONDecodeError');
    assert.match(j1.repair.map(s => s.text).join(' '), /looked at it raw/);
    assert.match(j1.state, /^Command:\n/);
  } finally { f.close(); }
});

test('proposals must parse and rest on at least three episodes the generator was shown', () => {
  const ids = new Set(['a', 'b', 'c', 'd']);
  const { proposals, rejected } = parseProposals({ proposals: [
    { ...proposal(), exampleIds: ['a', 'b', 'c', 'zzz'] },
    { ...proposal(), exampleIds: ['a', 'zzz', 'yyy'] },
    { ...proposal(), advice: 'x'.repeat(300) },
    'not an object'] }, ids);
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0].exampleIds, ['a', 'b', 'c'], 'unseen ids are dropped');
  assert.equal(rejected, 3);
  assert.deepEqual(parseProposals('garbage', ids), { proposals: [], rejected: 0, rejections: [] });
  assert.doesNotMatch(JSON.stringify(parseProposals({ proposals: [{ ...proposal(), advice: 'SECRET'.repeat(60) }] }, ids).rejections), /SECRET/);
});

test('propose records hypotheses and leaves already-explained failures out of the next batch', async () => {
  const f = fixture();
  try {
    const g = generator([proposal(), proposal({ situation: 'Shell quoting broke the command.', exampleIds: ['alpha-quote', 'alpha-j1', 'beta-j1'], rival: true })]);
    const window = { from: new Date('2026-09-01'), until: new Date('2026-12-01'), maxEpisodes: 50, root: f.projects };
    const first = await proposeHypotheses(f.store, g, window);
    assert.equal(first.proposed.length, 2);
    assert.equal(first.rivals, 1);
    assert.ok(listHypotheses(f.store.db).every(h => h.status === 'proposed'));
    const [json] = first.proposed;
    acceptHypothesis(f.store, json, 2);
    for (const id of ['alpha-j1', 'alpha-j2']) recordHypothesisMatch(f.store, { hypothesisId: json, episodeId: id, sessionId: 's', cwd: '/repos/alpha',
      at: '2026-09-03T00:00:00Z', level: 5, mode: 'replay', provider: 'm', model: 'm' });
    await proposeHypotheses(f.store, g, window);
    assert.ok(!g.seen[1].includes('alpha-j1') && !g.seen[1].includes('alpha-j2'), 'explained failures are not shown again');
    assert.ok(g.seen[1].includes('alpha-j3'));
    assert.equal((await proposeHypotheses(f.store, g, { ...window, from: new Date('2027-01-01'), until: new Date('2027-02-01') })).proposed.length, 0,
      'too few failures: nothing is sent');
  } finally { f.close(); }
});

test('shadowing records matches in the background, delivers nothing, and respects the cap', async () => {
  const f = fixture();
  try {
    const ids = (await proposeHypotheses(f.store, generator([proposal(), proposal({ situation: 'B', exampleIds: ['alpha-j1', 'alpha-j2', 'alpha-j3'] }),
      proposal({ situation: 'C', exampleIds: ['beta-j1', 'beta-j2', 'beta-j3'] })]),
      { from: new Date('2026-09-01'), until: new Date('2026-12-01'), maxEpisodes: 50, root: f.projects })).proposed;
    acceptHypothesis(f.store, ids[0], 2); acceptHypothesis(f.store, ids[1], 2);
    assert.throws(() => acceptHypothesis(f.store, ids[2], 2), /already shadowing 2/);
    const decisions = { config, env: { LYO_DECISION_WORKER: '0' } };
    const failure = { session_id: 's1', cwd: f.root, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_use_id: 't1',
      tool_input: { command: 'curl x | python3 -c "json.load"' }, error: 'Exit code 1\njson.decoder.JSONDecodeError: x' };
    assert.equal(shadowHypotheses('claude', failure, f.storePath, decisions).queued, true);
    assert.equal(shadowHypotheses('claude', { ...failure, tool_use_id: 't2', error: 'Tool "Bash" was not run because the user rejected the approval' },
      f.storePath, decisions).queued, false, 'a declined call is not a failure');
    assert.equal(shadowHypotheses('claude', { ...failure, tool_use_id: 't3', hook_event_name: 'PostToolUse', error: undefined, tool_response: { exit_code: 0 } },
      f.storePath, decisions).queued, false);
    const provider = decider();
    await runDecisionWorker({ storePath: f.storePath, queueDir: decisionQueueDir(f.storePath), provider, worker: config.worker, sleep: async () => {}, pollMs: 0 });
    assert.equal(provider.calls, 2, 'one decision per shadowing hypothesis');
    for (const id of ids.slice(0, 2)) assert.equal(hypothesisMatches(f.store.db, id, 'live')[0].verdict, 'match');
    assert.equal(readdirSync(join(decisionQueueDir(f.storePath), 'incoming')).length, 0);
  } finally { f.close(); }
});

test('recurrence: recurrent, refuted, untested and pending are distinct', () => {
  const m = (n: number, verdict: 'match' | 'no-match', repo = 'r') => Array.from({ length: n }, (_, i) => ({ hypothesisId: 'h', episodeId: `${verdict}${repo}${i}`,
    sessionId: 's', cwd: `/repos/${repo}`, repository: repo, at: '2026-10-10T00:00:00Z', level: verdict === 'match' ? 5 : 1, verdict, mode: 'live' as const, provider: null, model: null }));
  const window = { from: new Date('2026-10-01'), until: new Date('2026-10-31') }, after = { now: new Date('2026-11-05') };
  const predicted = { matchesPerMonth: 4, repositories: 2 };
  assert.equal(evaluateRecurrence([...m(3, 'match', 'a'), ...m(3, 'match', 'b'), ...m(30, 'no-match')], predicted, window, after).verdict, 'recurrent');
  assert.equal(evaluateRecurrence([...m(5, 'match', 'a'), ...m(30, 'no-match')], predicted, window, after).verdict, 'refuted-recurrence', 'one repository is too narrow');
  assert.equal(evaluateRecurrence(m(6, 'match', 'a'), predicted, window, after).verdict, 'untested', 'too few failures decided to judge');
  assert.equal(evaluateRecurrence(m(40, 'match'), predicted, window, { now: new Date('2026-10-15') }).verdict, 'pending');
  const unidentified = m(3, 'match', 'x').map(x => ({ ...x, repository: null, cwd: '/deleted/worktree' }));
  const spread = evaluateRecurrence([...m(5, 'match', 'a'), ...unidentified, ...m(30, 'no-match')], predicted, window, after);
  assert.equal(spread.verdict, 'untested', 'unidentified repositories leave spread untested, never confirmed by folder paths');
  assert.equal(spread.repositories, 1); assert.equal(spread.unresolvedRepositoryMatches, 3);
});

test('replay asks about historical failures, and harvest writes a review pack', async () => {
  const f = fixture();
  try {
    const [id] = (await proposeHypotheses(f.store, generator([proposal({ predicted: { matchesPerMonth: 2, repositories: 2 } })]),
      { from: new Date('2026-09-01'), until: new Date('2026-10-01'), maxEpisodes: 50, root: f.projects })).proposed;
    const provider = decider();
    const replay = await replayHypothesis(f.store, provider, id, { from: new Date('2026-10-01'), until: new Date('2026-11-01'), root: f.projects, minDecided: 3 });
    assert.equal(replay.episodes, 5);
    assert.equal(replay.evaluation.matches, 4);
    assert.equal(replay.evaluation.repositories, 2);
    assert.equal(replay.evaluation.verdict, 'recurrent');
    assert.equal((await replayHypothesis(f.store, provider, id, { from: new Date('2026-10-01'), until: new Date('2026-11-01'), root: f.projects, minDecided: 3 })).asked, 0,
      'replay is resumable');
    assert.throws(() => harvestHypothesis(f.store, id, join(f.root, 'pack'), { root: f.projects }), /recurrent/);
    acceptHypothesis(f.store, id, 2);
    const { setHypothesisStatus } = await import('../src/lyo/hypotheses/store.ts');
    setHypothesisStatus(f.store, id, 'recurrent', 'test');
    const pack = harvestHypothesis(f.store, id, join(f.root, 'pack'), { root: f.projects });
    assert.equal(pack.matched, 4); assert.equal(pack.sampled, 1);
    const rows = readFileSync(join(f.root, 'pack', 'harvest.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.ok(rows.every(r => r.label === null && r.repair.length > 0 && r.inputFormat === 'command-output@1'));
    assert.ok(existsSync(join(f.root, 'pack', 'question.json')));
    assert.equal(listHypotheses(f.store.db).find(h => h.id === id)!.status, 'harvested');
  } finally { f.close(); }
});

test('the OpenRouter generator requests ZDR routing and JSON, and validates what comes back', async () => {
  const calls: any[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ model: 'anthropic/claude-sonnet-5.5', usage: { prompt_tokens: 100, completion_tokens: 50 },
      choices: [{ message: { content: JSON.stringify({ proposals: [proposal({ exampleIds: ['e1', 'e2', 'e3'] }), { bad: true }] }) } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const g = openRouterGenerator({ ...config.generator!, retries: 0 }, { env: { OPENROUTER_API_KEY: 'k' }, fetch: fetchImpl });
  const eps = ['e1', 'e2', 'e3'].map(id => ({ id, sessionId: 's', at: '2026-10-01', cwd: '/r/x', command: 'c', output: 'o', state: 's', failureKind: 'exit_nonzero', errorClass: null, repair: [] }));
  const record = await g.propose({ episodes: eps, existing: [], maxProposals: 3, rivalShare: 0.1 });
  assert.deepEqual(calls[0].provider, { zdr: true, allow_fallbacks: false });
  assert.equal(calls[0].response_format.type, 'json_schema');
  assert.equal(calls[0].response_format.json_schema.strict, true);
  assert.equal(calls[0].model, 'anthropic/claude-sonnet-5.5');
  assert.equal(record.proposals.length, 1);
  assert.equal(record.rejected, 1);
  assert.throws(() => openRouterGenerator(config.generator!, { env: {} }), /OPENROUTER_API_KEY/);
});

const longEpisodes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `toolu_long_${i}`, sessionId: 's', at: '2026-10-01', cwd: '/r/x',
  command: 'c', output: 'o', state: 's', failureKind: 'exit_nonzero', errorClass: null, repair: [] }));
const reply = (proposals: unknown[], usage = { prompt_tokens: 100, completion_tokens: 50 }) =>
  new Response(JSON.stringify({ model: 'm', usage, choices: [{ message: { content: JSON.stringify({ proposals }) } }] }), { status: 200 });

test('the generator sees short episode keys, may cite only those, and they map back to episode ids', async () => {
  const calls: any[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    return reply([proposal({ exampleIds: ['e1', 'e2', 'e3', 'e99'], rival: true }), proposal({ situation: 'Invented', exampleIds: ['e1', 'e98', 'toolu_long_1'], rival: true })]);
  }) as unknown as typeof fetch;
  const g = openRouterGenerator({ ...config.generator!, retries: 0 }, { env: { OPENROUTER_API_KEY: 'k' }, fetch: fetchImpl });
  const record = await g.propose({ episodes: longEpisodes(4), existing: [], maxProposals: 3, rivalShare: 0.1 });
  const user = calls[0].messages[1].content as string;
  assert.match(user, /"id":"e4"/);
  assert.doesNotMatch(user, /toolu_long/);
  assert.deepEqual(calls[0].response_format.json_schema.schema.properties.proposals.items.properties.exampleIds.items.enum, ['e1', 'e2', 'e3', 'e4']);
  assert.deepEqual(record.proposals.map(p => p.exampleIds), [['toolu_long_0', 'toolu_long_1', 'toolu_long_2']]);
  assert.deepEqual(record.rejections, ['exampleIds: 1 of 3 cited episodes were shown']);
});

const keyed = { exampleIds: ['e1', 'e2', 'e3'] };

test('rejections and a rival shortfall get one corrective retry whose replacements are kept', async () => {
  const calls: any[] = [];
  const replies = [
    reply([proposal(keyed), { bad: true }]),
    reply([proposal(keyed), proposal({ ...keyed, situation: 'A rival cause.', rival: true }), proposal({ ...keyed, situation: 'Over the room.', rival: true })], { prompt_tokens: 200, completion_tokens: 20 }),
  ];
  const fetchImpl = (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return replies.shift()!; }) as unknown as typeof fetch;
  const g = openRouterGenerator(config.generator!, { env: { OPENROUTER_API_KEY: 'k' }, fetch: fetchImpl });
  const eps = longEpisodes(3);
  const record = await g.propose({ episodes: eps, existing: [], maxProposals: 2, rivalShare: 0.1 });
  assert.equal(calls.length, 2);
  const feedback = calls[1].messages.at(-1).content as string;
  assert.equal(calls[1].messages.at(-2).role, 'assistant');
  assert.match(feedback, /1 proposal\(s\) were discarded: situation: invalid_type/);
  assert.match(feedback, /at most 1 replacement proposal\(s\), at least 1 marked rival: true/);
  assert.deepEqual(record.proposals.map(p => [p.situation, p.rival]), [[proposal(keyed).situation, false], ['A rival cause.', true]]);
  assert.equal(record.retried, true);
  assert.equal(record.rivalShortfall, 0);
  assert.deepEqual(record.usage, { inputTokens: 300, outputTokens: 70 });
});

test('no retry when retries is 0, the reply was truncated, or nothing needs correcting', async () => {
  for (const [cfg, first] of [
    [{ ...config.generator!, retries: 0 }, reply([{ bad: true }])],
    [config.generator!, new Response(JSON.stringify({ model: 'm', choices: [{ finish_reason: 'length', message: { content: '{"proposals": [' } }] }))],
    [config.generator!, reply([proposal({ ...keyed, rival: true })])],
  ] as const) {
    let n = 0;
    const g = openRouterGenerator(cfg, { env: { OPENROUTER_API_KEY: 'k' }, fetch: (async () => { n++; return first; }) as unknown as typeof fetch });
    const eps = longEpisodes(3);
    const record = await g.propose({ episodes: eps, existing: [], maxProposals: 3, rivalShare: 0.1 });
    assert.equal(n, 1);
    assert.equal(record.retried, false);
  }
});
