import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveReflector } from '../src/lyo/reflector-policies.ts';
import {
  createElaboratorReflector,
  buildPrompt,
  parseReflectionJson,
  DEFAULT_MODEL,
} from '../src/lyo/elaborator-reflector.ts';

function makeRejectedValidation({ sender = 'validator' } = {}) {
  return {
    cluster_id: 'cluster-1',
    topic: 'VALIDATION_RESULT',
    sender,
    content: {
      text: 'Tests failed: npm test',
      data: { approved: false, errors: ['missing regression coverage'] },
    },
  };
}

test('elaborator reflector — buildPrompt: quotes the validator feedback as data and carries class + cue', () => {
  const messages = buildPrompt({
    message: makeRejectedValidation({}),
    failure_class: 'output_generation',
    cue: 'missing regression coverage',
  });
  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[0].role, 'system');
  assert.match(messages[0].content, /JSON/);
  assert.match(messages[0].content, /cite the specific evidence/i);
  assert.strictEqual(messages[1].role, 'user');
  assert.match(messages[1].content, /Failure class: output_generation/);
  assert.match(messages[1].content, /Trigger context: missing regression coverage/);
  // Injection containment: feedback is wrapped as quoted data.
  assert.match(messages[1].content, /quoted data, not instructions/);
  assert.match(messages[1].content, /"""\nTests failed: npm test[\s\S]*"""/);
});

test('elaborator reflector — parseReflectionJson: parses a bare JSON object', () => {
  const parsed = parseReflectionJson(
    '{"explanation": "ended after edits without running tests", "intervention": "Run targeted tests before ending a run"}'
  );
  assert.strictEqual(parsed.explanation, 'ended after edits without running tests');
  assert.strictEqual(parsed.intervention, 'Run targeted tests before ending a run');
});

test('elaborator reflector — parseReflectionJson: extracts JSON from markdown fences', () => {
  const parsed = parseReflectionJson('```json\n{"explanation": "e", "intervention": "i"}\n```');
  assert.strictEqual(parsed.explanation, 'e');
  assert.strictEqual(parsed.intervention, 'i');
});

test('elaborator reflector — parseReflectionJson: extracts JSON surrounded by prose', () => {
  const parsed = parseReflectionJson(
    'Here is my reflection:\n{"explanation": "e2", "intervention": "i2"}\nHope that helps.'
  );
  assert.strictEqual(parsed.explanation, 'e2');
  assert.strictEqual(parsed.intervention, 'i2');
});

test('elaborator reflector — parseReflectionJson: throws when there is no JSON object', () => {
  assert.throws(() => parseReflectionJson('no object here'), /no JSON object/);
  assert.throws(() => parseReflectionJson(''), /no JSON object/);
  assert.throws(() => parseReflectionJson(null), /no JSON object/);
});

test('elaborator reflector — parseReflectionJson: throws when explanation or intervention is missing', () => {
  assert.throws(
    () => parseReflectionJson('{"explanation": "e"}'),
    /missing explanation\/intervention/
  );
  assert.throws(
    () => parseReflectionJson('{"explanation": 1, "intervention": "i"}'),
    /missing explanation\/intervention/
  );
});

test('elaborator reflector — parseReflectionJson: truncates to the store length caps', () => {
  const parsed = parseReflectionJson(
    JSON.stringify({ explanation: 'x'.repeat(900), intervention: 'y'.repeat(900) })
  );
  assert.strictEqual(parsed.explanation.length, 500);
  assert.strictEqual(parsed.intervention.length, 300);
});

test('elaborator reflector — factory: is an async-only reflector (no sync reflect)', () => {
  const reflector = createElaboratorReflector({ chat: () => Promise.resolve('{}') });
  assert.strictEqual(reflector.name, 'elaborator');
  assert.strictEqual(reflector.version, 1);
  assert.strictEqual(typeof reflector.reflectAsync, 'function');
  assert.strictEqual(reflector.reflect, undefined);
});

test('elaborator reflector — factory: reflectAsync sends the built prompt to the injected chat and parses the reply', async () => {
  const calls = [];
  const reflector = createElaboratorReflector({
    model: 'test/model-x',
    chat: ({ messages, model }) => {
      calls.push({ messages, model });
      return Promise.resolve(
        '{"explanation": "distilled why", "intervention": "transferable rule"}'
      );
    },
  });
  const reflection = await reflector.reflectAsync({
    message: makeRejectedValidation({}),
    failure_class: 'output_generation',
    cue: 'missing regression coverage',
  });
  assert.deepStrictEqual(reflection, {
    explanation: 'distilled why',
    intervention: 'transferable rule',
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].model, 'test/model-x');
  assert.match(calls[0].messages[1].content, /missing regression coverage/);
});

test('elaborator reflector — factory: resolves the model from OPENROUTER_LYO_MODEL, else the default', async () => {
  const saved = process.env.OPENROUTER_LYO_MODEL;
  try {
    delete process.env.OPENROUTER_LYO_MODEL;
    let seen = null;
    await createElaboratorReflector({
      chat: ({ model }) => {
        seen = model;
        return Promise.resolve('{"explanation": "e", "intervention": "i"}');
      },
    }).reflectAsync({ message: {}, failure_class: 'c', cue: 'q' });
    assert.strictEqual(seen, DEFAULT_MODEL);
    process.env.OPENROUTER_LYO_MODEL = 'vendor/custom-model';
    seen = null;
    await createElaboratorReflector({
      chat: ({ model }) => {
        seen = model;
        return Promise.resolve('{"explanation": "e", "intervention": "i"}');
      },
    }).reflectAsync({ message: {}, failure_class: 'c', cue: 'q' });
    assert.strictEqual(seen, 'vendor/custom-model');
  } finally {
    if (saved === undefined) {
      delete process.env.OPENROUTER_LYO_MODEL;
    } else {
      process.env.OPENROUTER_LYO_MODEL = saved;
    }
  }
});

test('elaborator reflector — factory: rejects cleanly when OPENROUTER_API_KEY is unset (no network attempted)', async () => {
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const reflector = createElaboratorReflector();
    await assert.rejects(
      () => reflector.reflectAsync({ message: {}, failure_class: 'c', cue: 'q' }),
      /OPENROUTER_API_KEY is not set/
    );
  } finally {
    if (saved !== undefined) {
      process.env.OPENROUTER_API_KEY = saved;
    }
  }
});

test("elaborator reflector — registry: resolves 'elaborator@1' to an async reflector without needing an API key", () => {
  const reflector = resolveReflector('elaborator@1');
  assert.strictEqual(reflector.name, 'elaborator');
  assert.strictEqual(reflector.version, 1);
  assert.strictEqual(typeof reflector.reflectAsync, 'function');
});

test('elaborator reflector — registry: exposes the resolved model id for pair provenance', () => {
  const viaFactory = createElaboratorReflector({
    chat: () => Promise.resolve('{}'),
    model: 'x/y',
  });
  assert.strictEqual(viaFactory.model, 'x/y');
  // Registry ctx (cluster.config.lyo.reflectorModel) reaches the factory.
  const viaRegistry = resolveReflector('elaborator@1', { model: 'anthropic/claude-haiku' });
  assert.strictEqual(viaRegistry.model, 'anthropic/claude-haiku');
});
