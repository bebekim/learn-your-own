import { runWithoutModule } from './helpers/module-boundary.ts';
import test from 'node:test';

test('the OpenRouter judge classifies without loading trace orchestration', () => {
  const adapterUrl = new URL('../src/lyo/judge/openrouter.ts', import.meta.url).href;
  runWithoutModule(new URL('../src/lyo/judge/trace-consumer.ts', import.meta.url), `
    const { createDefaultJudge, DEFAULT_JUDGE_MODEL, OPENROUTER_URL } = await import(${JSON.stringify(adapterUrl)});
    process.env.OPENROUTER_API_KEY = 'test-key';
    const requests = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(url, OPENROUTER_URL);
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      requests.push(JSON.parse(options.body));
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        classification: 'spec-gap', rationale: 'r', evidence: 'e', lesson: 'l',
        spec_edit: 's', falsifiable_by: 'f'
      }) } }], usage: { total_tokens: 12, cost: 0.01 } });
    };
    const input = { runId: 'r', testName: 't', specText: '{}', codeFiles: [], testFiles: [], tapExcerpt: 'x' };
    process.env.OPENROUTER_LYO_JUDGE_MODEL = 'environment-model';
    const judgment = await createDefaultJudge('explicit-model')(input);
    await createDefaultJudge()(input);
    delete process.env.OPENROUTER_LYO_JUDGE_MODEL;
    await createDefaultJudge()(input);
    assert.deepEqual(requests.map(request => request.model), ['explicit-model', 'environment-model', DEFAULT_JUDGE_MODEL]);
    assert.equal(requests[0].temperature, 0);
    assert.match(requests[0].messages[1].content, /Failing test: t/);
    assert.deepEqual(judgment, { classification: 'spec-gap', rationale: 'r', evidence: 'e', lesson: 'l',
      specEdit: 's', vehicle: 'prose', promptPatch: undefined, falsifiableBy: 'f', usage: { totalTokens: 12, cost: 0.01 } });
  `);
});
