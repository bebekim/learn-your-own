import assert from 'node:assert/strict';
import test from 'node:test';
import { redactToolError } from '../src/lyo/hooks/adapters/claude.ts';

test('tool errors keep status signals and lose their text', () => {
  // Claude (observed 2026-11-16).
  const claude = redactToolError('Exit code 1\nE private row 4471\n==== 1 failed, 2 passed in 0.1s ====') as Record<string, unknown>;
  assert.doesNotMatch(JSON.stringify(claude), /private/);
  assert.equal(claude.exit_code, 1);
  assert.deepEqual(claude.test_summary, { runner: 'pytest', passed: 2, failed: 1 });
  // Kimi and Claude before August 2026: { code, message, retryable }.
  const kimi = redactToolError({ code: 'internal', message: 'fatal: private path /Users/x/secret', retryable: false }) as Record<string, unknown>;
  assert.doesNotMatch(JSON.stringify(kimi), /private|secret/);
  assert.equal(kimi.code, 'internal');
  assert.equal(kimi.retryable, false);
  assert.equal(kimi.recorded, false);
  // A free-text `code` is not kept.
  assert.equal((redactToolError({ code: 'see private log line', message: 'x' }) as Record<string, unknown>).code, undefined);
});

test('values without text, and existing digests, pass through', () => {
  assert.equal(redactToolError(true), true); // ECA reports a boolean
  assert.equal(redactToolError(undefined), undefined);
  assert.deepEqual(redactToolError({ retryable: true }), { retryable: true });
  const digest = { sha256: 'a'.repeat(64), output_size: 3, truncated: false, recorded: false, exit_code: 2 };
  assert.equal(redactToolError(digest), digest);
});
