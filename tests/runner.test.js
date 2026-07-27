import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  collectFiles,
  createKimiCliExecutor,
  createOpenRouterExecutor,
  createUpstageExecutor,
  filterDeclaredWrites,
  materializeSandbox,
  parseFileBlocks,
  parseTapOutput,
  runVerifier,
} from '../src/index.ts';

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-runner-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('parseFileBlocks extracts path-tagged fenced blocks', () => {
  const text = [
    'Here is the implementation:',
    '```ts path=generated/src/add.ts',
    'export function add(a: number, b: number): number {',
    '  return a + b;',
    '}',
    '```',
    '',
    'And the tests:',
    '```js path=generated/tests/add.test.js',
    "import test from 'node:test';",
    '```',
  ].join('\n');

  const blocks = parseFileBlocks(text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].path, 'generated/src/add.ts');
  assert.match(blocks[0].content, /return a \+ b/);
  assert.equal(blocks[1].path, 'generated/tests/add.test.js');
});

test('parseFileBlocks ignores fenced blocks without a path tag', () => {
  const text = '```ts\nconst x = 1;\n```\n\n```path=out/a.js\nconsole.log(1);\n```';
  const blocks = parseFileBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].path, 'out/a.js');
});

test('filterDeclaredWrites keeps files under declared write paths only', () => {
  const files = [
    { path: 'generated/src/add.ts', content: 'a' },
    { path: 'generated/tests/add.test.js', content: 'b' },
    { path: 'etc/passwd', content: 'x' },
    { path: 'generated/src/../secrets.txt', content: 'y' },
    { path: '/absolute/path.ts', content: 'z' },
  ];
  const { accepted, rejected } = filterDeclaredWrites(files, ['generated/src']);
  assert.deepEqual(accepted.map((file) => file.path), ['generated/src/add.ts']);
  assert.deepEqual(
    rejected.map((file) => file.path),
    ['generated/tests/add.test.js', 'etc/passwd', 'generated/src/../secrets.txt', '/absolute/path.ts']
  );
});

test('materializeSandbox copies only declared read paths', () => {
  withTmp((dir) => {
    const source = join(dir, 'source');
    mkdirSync(join(source, 'spec'), { recursive: true });
    mkdirSync(join(source, 'generated'), { recursive: true });
    writeFileSync(join(source, 'spec', 'spec.json'), '{"version":"lyo.spec.v1"}');
    writeFileSync(join(source, 'generated', 'secret-tests.js'), 'peek-a-boo');

    const sandbox = join(dir, 'sandbox');
    const copied = materializeSandbox({ sourceRoot: source, sandboxDir: sandbox, readPaths: ['spec/spec.json'] });

    assert.deepEqual(copied, ['spec/spec.json']);
    assert.equal(readFileSync(join(sandbox, 'spec', 'spec.json'), 'utf8'), '{"version":"lyo.spec.v1"}');
    assert.equal(existsSync(join(sandbox, 'generated', 'secret-tests.js')), false);
  });
});

test('materializeSandbox copies directories recursively', () => {
  withTmp((dir) => {
    const source = join(dir, 'source');
    mkdirSync(join(source, 'docs', 'nested'), { recursive: true });
    writeFileSync(join(source, 'docs', 'a.md'), 'a');
    writeFileSync(join(source, 'docs', 'nested', 'b.md'), 'b');

    const sandbox = join(dir, 'sandbox');
    const copied = materializeSandbox({ sourceRoot: source, sandboxDir: sandbox, readPaths: ['docs'] });

    assert.deepEqual(copied, ['docs/a.md', 'docs/nested/b.md']);
    assert.equal(readFileSync(join(sandbox, 'docs', 'nested', 'b.md'), 'utf8'), 'b');
  });
});

test('collectFiles walks a tree into sorted relative paths', () => {
  withTmp((dir) => {
    mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
    writeFileSync(join(dir, 'src', 'index.ts'), 'i');
    writeFileSync(join(dir, 'src', 'deep', 'util.ts'), 'u');
    writeFileSync(join(dir, 'top.md'), 't');

    assert.deepEqual(collectFiles(dir), ['src/deep/util.ts', 'src/index.ts', 'top.md']);
  });
});

test('openrouter executor sends the prompt and returns the transcript', async () => {
  const calls = [];
  const executor = createOpenRouterExecutor({
    model: 'upstage/solar-pro-3',
    temperature: 0.7,
    chat: async (args) => {
      calls.push(args);
      return '```ts path=generated/tests/add.test.js\n...\n```';
    },
  });

  const result = await executor({ prompt: 'COMPILED PROMPT', sandboxDir: '/tmp/sandbox' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'upstage/solar-pro-3');
  assert.equal(calls[0].temperature, 0.7);
  assert.deepEqual(calls[0].messages, [{ role: 'user', content: 'COMPILED PROMPT' }]);
  assert.match(result.transcript, /add\.test\.js/);
});

test('kimi-cli executor runs kimi -p inside the sandbox', async () => {
  const calls = [];
  const executor = createKimiCliExecutor({
    model: 'kimi-code/kimi-for-coding',
    spawnKimi: async (args) => {
      calls.push(args);
      return { stdout: 'wrote files', stderr: '', code: 0 };
    },
  });

  const result = await executor({ prompt: 'COMPILED PROMPT', sandboxDir: '/tmp/sandbox' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, '/tmp/sandbox');
  assert.equal(calls[0].prompt, 'COMPILED PROMPT');
  assert.equal(calls[0].model, 'kimi-code/kimi-for-coding');
  assert.match(result.transcript, /wrote files/);
});

test('kimi-cli executor throws on non-zero exit', async () => {
  const executor = createKimiCliExecutor({
    spawnKimi: async () => ({ stdout: '', stderr: 'boom', code: 1 }),
  });
  await assert.rejects(() => executor({ prompt: 'p', sandboxDir: '/tmp' }), /boom/);
});

const TAP_SAMPLE = [
  'TAP version 13',
  '# Subtest: adds positive integers',
  'ok 1 - adds positive integers',
  '# Subtest: is commutative',
  'ok 2 - is commutative',
  '# Subtest: handles negatives',
  'ok 3 - handles negatives',
  '# Subtest: handles overflow',
  'not ok 4 - handles overflow',
  '  ---',
  '  error: expected 5 got NaN',
  '  ...',
  '# tests 4',
  '# pass 3',
  '# fail 1',
].join('\n');

test('parseTapOutput extracts counts and per-test results', () => {
  const { counts, perTest } = parseTapOutput(TAP_SAMPLE);
  assert.deepEqual(counts, { total: 4, passed: 3, failed: 1 });
  assert.equal(perTest.length, 4);
  assert.deepEqual(perTest[3], { name: 'handles overflow', status: 'fail' });
});

test('runVerifier maps test outcomes to report outcomes', async () => {
  const failing = await runVerifier({
    dir: '/tmp/verify',
    testPath: 'generated/tests',
    runTests: async () => ({ stdout: TAP_SAMPLE, stderr: '', code: 1 }),
  });
  assert.equal(failing.outcome, 'fail');
  assert.deepEqual(failing.counts, { total: 4, passed: 3, failed: 1 });

  const passing = await runVerifier({
    dir: '/tmp/verify',
    testPath: 'generated/tests',
    runTests: async () => ({
      stdout: 'ok 1 - only test\n# tests 1\n# pass 1\n# fail 0',
      stderr: '',
      code: 0,
    }),
  });
  assert.equal(passing.outcome, 'pass');
});

test('runVerifier reports error when no tests ran or the runner crashed', async () => {
  const noTests = await runVerifier({
    dir: '/tmp/verify',
    testPath: 'generated/tests',
    runTests: async () => ({ stdout: '# tests 0\n# pass 0\n# fail 0', stderr: '', code: 0 }),
  });
  assert.equal(noTests.outcome, 'error');

  const crashed = await runVerifier({
    dir: '/tmp/verify',
    testPath: 'generated/tests',
    runTests: async () => ({ stdout: '', stderr: 'node: bad option', code: 2 }),
  });
  assert.equal(crashed.outcome, 'error');
});

test('parseFileBlocks strips stray backticks around path tags', () => {
  const text = '```js path=generated/tests/example.test.js```.\nconst x = 1;\n```';
  const blocks = parseFileBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].path, 'generated/tests/example.test.js');
  assert.equal(blocks[0].content.trim(), 'const x = 1;');
});

test('openrouter executor throws a distinct error on truncated completions', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
    }),
  });
  try {
    const executor = createOpenRouterExecutor({ model: 'fake-model' });
    await assert.rejects(
      () => executor({ prompt: 'p', sandboxDir: '/tmp/sandbox' }),
      /truncated/
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('openrouter executor requests reasoning exclusion and a token budget', async () => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
      }),
    };
  };
  try {
    const executor = createOpenRouterExecutor({ model: 'fake-model', temperature: 0.7 });
    await executor({ prompt: 'p', sandboxDir: '/tmp/sandbox' });
    assert.deepEqual(bodies[0].reasoning, { exclude: true });
    assert.equal(typeof bodies[0].max_tokens, 'number');
    assert.equal(bodies[0].temperature, 0.7);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
  }
});

test('upstage executor posts to the upstage endpoint with its own key and reasoning effort', async () => {
  process.env.UPSTAGE_API_KEY = 'up_test_key';
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
      }),
    };
  };
  try {
    const executor = createUpstageExecutor({ model: 'solar-pro3', temperature: 0.7 });
    const result = await executor({ prompt: 'COMPILED', sandboxDir: '/tmp/sandbox' });
    assert.equal(result.transcript, 'done');
    assert.equal(calls[0].url, 'https://api.upstage.ai/v1/chat/completions');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer up_test_key');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, 'solar-pro3');
    assert.equal(body.temperature, 0.7);
    assert.equal(body.reasoning_effort, 'low');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.UPSTAGE_API_KEY;
  }
});

test('upstage executor names UPSTAGE_API_KEY when the key is missing', async () => {
  delete process.env.UPSTAGE_API_KEY;
  const executor = createUpstageExecutor({ model: 'solar-pro3' });
  await assert.rejects(() => executor({ prompt: 'p', sandboxDir: '/tmp' }), /UPSTAGE_API_KEY/);
});

test('kimi-cli executor retries once on non-zero exit and records both attempts', async () => {
  const results = [
    { stdout: '', stderr: 'connection dropped', code: 1 },
    { stdout: 'recovered', stderr: '', code: 0 },
  ];
  const executor = createKimiCliExecutor({
    spawnKimi: async () => results.shift(),
    retryDelayMs: 0,
  });
  const result = await executor({ prompt: 'p', sandboxDir: '/tmp/sandbox' });
  assert.match(result.transcript, /connection dropped/);
  assert.match(result.transcript, /recovered/);
  assert.equal(results.length, 0);
});

test('kimi-cli executor throws after the retry also fails', async () => {
  const executor = createKimiCliExecutor({
    spawnKimi: async () => ({ stdout: '', stderr: 'still broken', code: 1 }),
    retryDelayMs: 0,
  });
  await assert.rejects(() => executor({ prompt: 'p', sandboxDir: '/tmp' }), /still broken/);
});

test('parseFileBlocks accepts a path as the first line inside the fence', () => {
  const text = [
    '```js',
    'generated/src/csv-line.js',
    'const parseCsvLine = (line) => line.split(",");',
    'module.exports = { parseCsvLine };',
    '```',
  ].join('\n');
  const blocks = parseFileBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].path, 'generated/src/csv-line.js');
  assert.match(blocks[0].content, /parseCsvLine/);
  assert.equal(blocks[0].content.includes('generated/src/csv-line.js'), false);
});

test('parseFileBlocks does not mistake ordinary code for a first-line path', () => {
  const text = '```js\nconst x = require("fs");\nx.read();\n```';
  assert.deepEqual(parseFileBlocks(text), []);
});

test('parseFileBlocks pairs a path-declaration fence with the following code fence', () => {
  const text = [
    '```js',
    'path=generated/src/semver.js',
    '```',
    '```javascript',
    "'use strict';",
    'function compareSemver(a, b) { return 0; }',
    '```',
  ].join('\n');
  const blocks = parseFileBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].path, 'generated/src/semver.js');
  assert.match(blocks[0].content, /compareSemver/);
});

test('parseFileBlocks accepts a path= line inside the fence followed by code', () => {
  const text = [
    '```js',
    'path=generated/src/semver.js',
    'const compareSemver = (a, b) => 0;',
    'module.exports = { compareSemver };',
    '```',
  ].join('\n');
  const blocks = parseFileBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].path, 'generated/src/semver.js');
  assert.match(blocks[0].content, /compareSemver/);
  assert.equal(blocks[0].content.includes('path='), false);
});
