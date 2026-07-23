import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TEMPLATE_REFLECTOR,
  reflectorId,
  resolveReflector,
  buildGuidanceText,
} from '../src/lyo/reflector-policies.ts';

test('lyo reflector policies: resolves null to the template default', () => {
  assert.strictEqual(resolveReflector(null), TEMPLATE_REFLECTOR);
  assert.strictEqual(reflectorId(resolveReflector(null)), 'template@1');
});

test('lyo reflector policies: passes object reflectors through unregistered', () => {
  const custom = { name: 'elaborator-stub', version: 1, reflect: () => ({}) };
  assert.strictEqual(resolveReflector(custom), custom);
});

test('lyo reflector policies: resolves registry id strings and rejects unknown ones', () => {
  assert.strictEqual(resolveReflector('template@1'), TEMPLATE_REFLECTOR);
  assert.throws(() => resolveReflector('nope@1'), /unknown reflector: nope@1/);
});

test('lyo reflector policies: template@1 reproduces the legacy guidance/explanation text', () => {
  const message = {
    content: {
      text: 'Tests failed: npm test',
      data: { errors: ['missing regression coverage'] },
    },
  };
  const reflection = TEMPLATE_REFLECTOR.reflect({ message });
  assert.match(reflection.intervention, /^Address the validator feedback before retrying\./);
  assert.match(reflection.intervention, /Tests failed: npm test/);
  assert.match(reflection.intervention, /missing regression coverage/);
  assert.match(reflection.explanation, /Tests failed: npm test/);
});

test('lyo reflector policies: keeps the buildGuidanceText export byte-identical for the guidance path', () => {
  const message = {
    content: {
      text: 'Tests failed: npm test',
      data: { errors: ['missing regression coverage'] },
    },
  };
  assert.strictEqual(
    buildGuidanceText(message),
    'Address the validator feedback before retrying.\n\nLatest validation:\nTests failed: npm test\n\nErrors:\n- missing regression coverage'
  );
});
