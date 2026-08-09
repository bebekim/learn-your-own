import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyPromptKind } from '../src/classification/prompt-kind.ts';
import { createKernel, initLedger, recordPromptBoundary } from '../src/index.ts';

describe('classifyPromptKind', () => {
  describe('debugging_request', () => {
    it('detects error reports', () => {
      assert.equal(classifyPromptKind('I get an error when running tests'), 'debugging_request');
    });

    it('detects failure reports', () => {
      assert.equal(classifyPromptKind('the build is failing on CI'), 'debugging_request');
    });

    it('detects crash reports', () => {
      assert.equal(classifyPromptKind('the app crashes when I click submit'), 'debugging_request');
    });

    it('detects bug reports', () => {
      assert.equal(classifyPromptKind('there is a bug in the auth module'), 'debugging_request');
    });

    it('detects stack traces', () => {
      assert.equal(classifyPromptKind('here is the stack trace from the exception'), 'debugging_request');
    });

    it('detects "not working"', () => {
      assert.equal(classifyPromptKind('the login page is not working'), 'debugging_request');
    });
  });

  describe('question', () => {
    it('detects what questions', () => {
      assert.equal(classifyPromptKind('what does this function do?'), 'question');
    });

    it('detects why questions', () => {
      assert.equal(classifyPromptKind('why is the config structured this way?'), 'question');
    });

    it('detects how questions', () => {
      assert.equal(classifyPromptKind('how does the routing work?'), 'question');
    });

    it('detects explain requests', () => {
      assert.equal(classifyPromptKind('can you explain the auth flow?'), 'question');
    });

    it('detects where questions', () => {
      assert.equal(classifyPromptKind('where is the database config?'), 'question');
    });
  });

  describe('correction', () => {
    it('detects "no, I meant"', () => {
      assert.equal(classifyPromptKind("no, I meant the other endpoint"), 'correction');
    });

    it('detects "that\'s wrong"', () => {
      assert.equal(classifyPromptKind("that's wrong, the tests should pass"), 'correction');
    });

    it('detects "not what I asked"', () => {
      assert.equal(classifyPromptKind("that's not what I asked for"), 'correction');
    });

    it('detects "incorrect"', () => {
      assert.equal(classifyPromptKind("that's incorrect, try again"), 'correction');
    });
  });

  describe('refactoring_request', () => {
    it('detects refactor requests', () => {
      assert.equal(classifyPromptKind('refactor the auth module'), 'refactoring_request');
    });

    it('detects rename requests', () => {
      assert.equal(classifyPromptKind('rename this variable to something clearer'), 'refactoring_request');
    });

    it('detects extract requests', () => {
      assert.equal(classifyPromptKind('extract this into a helper function'), 'refactoring_request');
    });

    it('detects move requests', () => {
      assert.equal(classifyPromptKind('move this to a separate file'), 'refactoring_request');
    });

    it('detects reorganize requests', () => {
      assert.equal(classifyPromptKind('reorganize the project structure'), 'refactoring_request');
    });
  });

  describe('follow_up (default)', () => {
    it('classifies generic instructions as follow_up', () => {
      assert.equal(classifyPromptKind('add a new endpoint for users'), 'follow_up');
    });

    it('classifies status checks as follow_up', () => {
      assert.equal(classifyPromptKind('continue where we left off'), 'follow_up');
    });

    it('classifies simple requests as follow_up', () => {
      assert.equal(classifyPromptKind('update the readme'), 'follow_up');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      assert.equal(classifyPromptKind(''), 'follow_up');
    });

    it('handles very short prompts', () => {
      assert.equal(classifyPromptKind('ok'), 'follow_up');
    });

    it('is case insensitive', () => {
      assert.equal(classifyPromptKind('ERROR: the build FAILED'), 'debugging_request');
    });

    it('debugging takes priority over question when both match', () => {
      // "why does the test fail?" matches both debugging (fail) and question (why)
      // debugging is more actionable, so it wins
      assert.equal(classifyPromptKind('why does the test fail?'), 'debugging_request');
    });
  });
});

describe('recordPromptBoundary positional override', () => {
  function tempDb() {
    const dir = mkdtempSync(join(tmpdir(), 'lyo-test-'));
    return { dir, dbPath: join(dir, 'learning.sqlite'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it('marks first user prompt as direction_setting', () => {
    const t = tempDb();
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const result = recordPromptBoundary(kernel, {
      sessionId: 's1',
      role: 'user',
      kind: 'follow_up',
      promptText: 'build me a REST API',
    });

    assert.equal(result.promptKind, 'direction_setting');
    assert.equal(result.promptIndex, 0);
    t.cleanup();
  });

  it('does not override subsequent user prompts', () => {
    const t = tempDb();
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordPromptBoundary(kernel, {
      sessionId: 's1',
      role: 'user',
      kind: 'follow_up',
      promptText: 'first prompt',
    });

    const result = recordPromptBoundary(kernel, {
      sessionId: 's1',
      role: 'user',
      kind: 'debugging_request',
      promptText: 'the tests are failing',
    });

    assert.equal(result.promptKind, 'debugging_request');
    assert.equal(result.promptIndex, 1);
    t.cleanup();
  });

  it('does not override assistant prompts', () => {
    const t = tempDb();
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const result = recordPromptBoundary(kernel, {
      sessionId: 's1',
      role: 'assistant',
      kind: 'assistant_response',
      responseSummary: 'Done.',
    });

    assert.equal(result.promptKind, 'assistant_response');
    t.cleanup();
  });

  it('direction_setting only applies to first prompt in session', () => {
    const t = tempDb();
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    // Session A: first prompt
    const a = recordPromptBoundary(kernel, {
      sessionId: 'session-a',
      role: 'user',
      kind: 'follow_up',
      promptText: 'start',
    });
    assert.equal(a.promptKind, 'direction_setting');

    // Session B: first prompt (different session, also gets direction_setting)
    const b = recordPromptBoundary(kernel, {
      sessionId: 'session-b',
      role: 'user',
      kind: 'question',
      promptText: 'what is this?',
    });
    assert.equal(b.promptKind, 'direction_setting');
    assert.equal(b.promptIndex, 0);

    t.cleanup();
  });
});
