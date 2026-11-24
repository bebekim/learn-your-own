import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fixture } from './helpers/session-finding-fixture.ts';
import { actionChange, actionScopeConfigSchema, agentPlan, decideActionScope, renderActionState } from '../src/lyo/decisions/action-scope.ts';
import type { TypedDecisionProvider } from '../src/lyo/application/typed-decisions.ts';

const run = promisify(execFile);
const QUESTION = { type: 'noul' as const, instructions: "The agent's action reuses an existing repair from one place in another." };
const CALIBRATION = { positives: 30, negatives: 217, heldOut: 'caught 20/22, false alarms 2/80', evidence: 'test' };
const config = (extra: Record<string, unknown> = {}) => actionScopeConfigSchema.parse({ provider: 'typesafe-jev',
  activities: { 'transfer-review': { question: QUESTION, band: { no: 0.3, yes: 0.5 }, calibration: CALIBRATION } }, ...extra });

function transcript(dir: string, toolUseId: string): string {
  const path = join(dir, 'transcript.jsonl');
  writeFileSync(path, [
    { type: 'user', message: { content: 'Port the parser fix to the CSV reader.' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'I will mirror the parser trim fix in the CSV reader.' },
      { type: 'tool_use', id: toolUseId, name: 'Edit', input: {} }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'A later, unrelated plan.' }] } },
  ].map(row => JSON.stringify(row)).join('\n'));
  return path;
}

test('actions render exactly as the calibration cases did', () => {
  const change = actionChange('Edit', { file_path: '/repo/csv.ts', old_string: 'a'.repeat(400), new_string: 'value.trim()' });
  assert.equal(renderActionState({ agent_plan: 'Mirror the parser fix.', tool: 'Edit', change }),
    `Agent plan: Mirror the parser fix.\nTool: Edit\nFile: /repo/csv.ts\nReplace: ${'a'.repeat(350)}…\nWith: value.trim()`);
  assert.equal(renderActionState({ agent_plan: '', tool: 'Bash', change: actionChange('Bash', { command: 'npm test' }) }),
    'Agent plan: (none)\nTool: Bash\nCommand: npm test\nDescription: ');
});

test('the plan is the latest assistant text before this tool call', () => {
  const f = fixture();
  try {
    assert.equal(agentPlan(transcript(f.root, 'toolu_1'), 'toolu_1'), 'I will mirror the parser trim fix in the CSV reader.');
    assert.equal(agentPlan(join(f.root, 'missing.jsonl'), 'toolu_1'), '');
  } finally { f.close(); }
});

test('an activity is configurable only with a calibration of at least 20 positives and negatives', () => {
  assert.throws(() => config({ activities: { 'transfer-review': { question: QUESTION, band: { no: 0.3, yes: 0.5 },
    calibration: { ...CALIBRATION, positives: 8 } } } }));
  assert.throws(() => config({ activities: { 'transfer-review': { question: QUESTION, band: { no: 0.6, yes: 0.5 }, calibration: CALIBRATION } } }));
});

test('one decision per agent plan, a per-session cap, and no raw text retained', async () => {
  const f = fixture();
  try {
    let calls = 0, noul = 0.62;
    const provider: TypedDecisionProvider = { name: 'fake', async decide(request) {
      calls++;
      assert.match(String(request.state), /^Agent plan: I will mirror/);
      return { source: 'typed-decision@1', provider: 'fake', requestedModel: 'm', answeredModel: 'm-1', requestHash: `h${calls}`,
        answers: { 'transfer-review': { type: 'noul', noul } }, usage: { inputTokens: 600, outputTokens: 5 }, decidedAt: 'now' };
    } };
    const event = (id: string, session = 'scope-session') => ({ hook_event_name: 'PostToolUse', session_id: session, cwd: f.root,
      tool_name: 'Edit', tool_use_id: id, tool_input: { file_path: join(f.root, 'csv.ts'), old_string: 'x', new_string: 'y' },
      transcript_path: transcript(f.root, id) });
    const first = await decideActionScope(event('toolu_1'), {}, { provider, config: config() });
    assert.deepEqual(first?.activities, ['transfer-review']);
    noul = 0.1;
    const again = await decideActionScope(event('toolu_1'), {}, { provider, config: config() });
    assert.deepEqual([calls, again?.activities, again?.decisions[0].reused], [1, ['transfer-review'], true], 'same plan reuses its verdict');
    const capped = config({ maxCallsPerSession: 1 });
    const newPlan = join(f.root, 'new-plan.jsonl');
    writeFileSync(newPlan, JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'text', text: 'A new plan.' }, { type: 'tool_use', id: 'toolu_2', name: 'Edit', input: {} }] } }));
    assert.equal(await decideActionScope({ ...event('toolu_2'), transcript_path: newPlan }, {}, { provider, config: capped }), null);
    assert.equal(calls, 1, 'the cap stops new calls');
    assert.equal(await decideActionScope({ ...event('toolu_3'), tool_name: 'Read' }, {}, { provider, config: config() }), null);
    assert.equal(await decideActionScope(event('toolu_4'), {}, { provider, config: null }), null);
    const traces = f.store.db.prepare(`SELECT payload_json FROM learning_trace WHERE json_extract(payload_json, '$.source') = 'action-scope-decision@1'`).all();
    assert.equal(traces.length, 1);
    assert.doesNotMatch(String(traces[0].payload_json), /mirror|csv\.ts/, 'decisions keep hashes and scores, not the action');
  } finally { f.close(); }
});

test('claude-hook delivers the inferred finding once per session, including in its source repository', async () => {
  const f = fixture();
  await run('git', ['init', '-q'], { cwd: f.root });
  f.store.recordTrace({ trace_id: 'finding:same-repo', kind: 'behavior', summary: 'Same repository boundary',
    payload: { source: 'session-finding@1', gitCommonDir: join(f.root, '.git'), activity: 'transfer-review',
      observation: 'A transfer crossed a contract boundary.', evidenceRef: 'report:same-repo',
      intervention: 'Compare the same-repository transfer contract.' } });
  const server = createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const noul = JSON.parse(body).state.includes('mirror') ? 0.9 : 0.05;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'jev-1.14.0', answers: { 'transfer-review': { type: 'noul', noul } }, usage: { input_tokens: 600, output_tokens: 5 } }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const configPath = join(f.root, 'action-scope.json');
    writeFileSync(configPath, JSON.stringify({ provider: 'typesafe-jev', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      activities: { 'transfer-review': { question: QUESTION, band: { no: 0.3, yes: 0.5 }, calibration: CALIBRATION } } }));
    const hook = async (session: string, toolUseId: string, plan: string) => {
      const path = join(f.root, `${session}-${toolUseId}.jsonl`);
      writeFileSync(path, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: plan },
        { type: 'tool_use', id: toolUseId, name: 'Edit', input: {} }] } }));
      const child = run(process.execPath, [new URL('../src/cli.ts', import.meta.url).pathname, 'claude-hook'], {
        cwd: f.root, env: { ...process.env, ZEROSHOT_LYO_STORE_PATH: f.storePath, LYO_ACTION_SCOPE_FILE: configPath,
          TYPESAFE_API_KEY: 'test-key', LYO_CONFIG_FILE: join(f.root, 'no-config.json'), TMPDIR: f.root } });
      child.child.stdin!.end(JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session, cwd: f.root, tool_name: 'Edit',
        tool_use_id: toolUseId, tool_input: { file_path: join(f.root, 'csv.ts'), old_string: 'x', new_string: 'y' },
        tool_response: { success: true }, transcript_path: path }));
      return JSON.parse((await child).stdout).hookSpecificOutput?.additionalContext ?? '';
    };
    assert.equal(await hook('s1', 't0', 'Rename a variable.'), '', 'a no decision delivers nothing');
    const delivered = await hook('s1', 't1', 'I will mirror the parser trim fix here.');
    assert.match(delivered, /Check the target whitespace contract before reusing a repair/);
    assert.match(delivered, /Finding delivery: session-delivery:s1/);
    assert.match(delivered, /Compare the same-repository transfer contract/);
    assert.equal(await hook('s1', 't2', 'Now mirror the second parser fix too.'), '', 'once per finding version per session');
    const receipt = JSON.parse(String(f.store.db.prepare(`SELECT payload_json FROM learning_trace WHERE trace_id = 'session-delivery:s1'`).get()!.payload_json));
    assert.equal(receipt.scope.source, 'action-scope@1');
    assert.equal(receipt.findings[0].context.match, 'activity');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.close(); }
});
