import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codexHookObservation } from '../src/adapters/codex.ts';
import { claudeHookObservation } from '../src/adapters/claude.ts';

describe('adapter prompt boundary construction', () => {
  describe('codex adapter', () => {
    it('creates a user prompt boundary on UserPromptSubmit', () => {
      const obs = codexHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'fix the broken tests',
        model: 'gpt-4',
      }, { includeRawPrompt: true });

      assert.ok(obs.promptBoundary);
      assert.equal(obs.promptBoundary.role, 'user');
      assert.equal(obs.promptBoundary.kind, 'user_prompt');
      assert.equal(obs.promptBoundary.sessionId, 's1');
      assert.equal(obs.promptBoundary.turnId, 't1');
      assert.equal(obs.promptBoundary.promptText, 'fix the broken tests');
      assert.equal(obs.promptBoundary.model, 'gpt-4');
    });

    it('creates an assistant prompt boundary on Stop', () => {
      const obs = codexHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'Stop',
        last_assistant_message: 'I fixed the tests.',
        model: 'gpt-4',
      }, { includeRawPrompt: true });

      assert.ok(obs.promptBoundary);
      assert.equal(obs.promptBoundary.role, 'assistant');
      assert.equal(obs.promptBoundary.kind, 'assistant_response');
      assert.equal(obs.promptBoundary.sessionId, 's1');
      assert.equal(obs.promptBoundary.turnId, 't1');
      assert.ok(obs.promptBoundary.responseSummary);
    });

    it('creates no prompt boundary on SessionStart', () => {
      const obs = codexHookObservation({
        session_id: 's1',
        cwd: '/tmp/test',
        hook_event_name: 'SessionStart',
      }, { includeRawPrompt: true });

      assert.equal(obs.promptBoundary, null);
      assert.ok(obs.session);
    });

    it('creates session with platform codex on UserPromptSubmit', () => {
      const obs = codexHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'hello',
      }, { includeRawPrompt: true });

      assert.ok(obs.session);
      assert.equal(obs.session.platform, 'codex');
    });

    it('hashes prompt when includeRawPrompt is false', () => {
      const obs = codexHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'secret prompt',
      }, { includeRawPrompt: false });

      assert.ok(obs.promptBoundary);
      assert.equal(obs.promptBoundary.promptText, undefined);
      assert.ok(obs.promptBoundary.promptHash);
      assert.ok(obs.promptBoundary.promptLength);
      assert.ok(obs.promptBoundary.summary);
    });
  });

  describe('claude adapter', () => {
    it('creates a user prompt boundary on UserPromptSubmit', () => {
      const obs = claudeHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'refactor the auth module',
        model: 'claude-sonnet-4-20250514',
      }, { includeRawPrompt: true });

      assert.ok(obs.promptBoundary);
      assert.equal(obs.promptBoundary.role, 'user');
      assert.equal(obs.promptBoundary.kind, 'user_prompt');
      assert.equal(obs.promptBoundary.sessionId, 's1');
      assert.equal(obs.promptBoundary.turnId, 't1');
      assert.equal(obs.promptBoundary.promptText, 'refactor the auth module');
    });

    it('creates an assistant prompt boundary on Stop', () => {
      const obs = claudeHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'Stop',
        last_assistant_message: 'Done refactoring.',
        model: 'claude-sonnet-4-20250514',
      }, { includeRawPrompt: true });

      assert.ok(obs.promptBoundary);
      assert.equal(obs.promptBoundary.role, 'assistant');
      assert.equal(obs.promptBoundary.kind, 'assistant_response');
      assert.ok(obs.promptBoundary.responseSummary);
    });

    it('creates no prompt boundary on SessionStart', () => {
      const obs = claudeHookObservation({
        session_id: 's1',
        cwd: '/tmp/test',
        hook_event_name: 'SessionStart',
      }, { includeRawPrompt: true });

      assert.equal(obs.promptBoundary, null);
      assert.ok(obs.session);
    });

    it('creates session with platform claude on UserPromptSubmit', () => {
      const obs = claudeHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'hello',
      }, { includeRawPrompt: true });

      assert.ok(obs.session);
      assert.equal(obs.session.platform, 'claude');
    });

    it('hashes prompt when includeRawPrompt is false', () => {
      const obs = claudeHookObservation({
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'secret prompt',
      }, { includeRawPrompt: false });

      assert.ok(obs.promptBoundary);
      assert.equal(obs.promptBoundary.promptText, undefined);
      assert.ok(obs.promptBoundary.promptHash);
    });
  });

  describe('cross-adapter consistency', () => {
    it('both adapters produce the same prompt boundary shape for user prompts', () => {
      const input = {
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'test prompt',
      };
      const codex = codexHookObservation(input, { includeRawPrompt: true });
      const claude = claudeHookObservation(input, { includeRawPrompt: true });

      assert.equal(codex.promptBoundary.role, claude.promptBoundary.role);
      assert.equal(codex.promptBoundary.kind, claude.promptBoundary.kind);
      assert.equal(codex.promptBoundary.promptText, claude.promptBoundary.promptText);
    });

    it('both adapters produce the same prompt boundary shape for assistant responses', () => {
      const input = {
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'Stop',
        last_assistant_message: 'Done.',
      };
      const codex = codexHookObservation(input, { includeRawPrompt: true });
      const claude = claudeHookObservation(input, { includeRawPrompt: true });

      assert.equal(codex.promptBoundary.role, claude.promptBoundary.role);
      assert.equal(codex.promptBoundary.kind, claude.promptBoundary.kind);
    });

    it('session objects differ only in platform', () => {
      const input = {
        session_id: 's1',
        turn_id: 't1',
        cwd: '/tmp/test',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'test',
      };
      const codex = codexHookObservation(input, { includeRawPrompt: true });
      const claude = claudeHookObservation(input, { includeRawPrompt: true });

      assert.equal(codex.session.platform, 'codex');
      assert.equal(claude.session.platform, 'claude');
      assert.equal(codex.session.sessionId, claude.session.sessionId);
      assert.equal(codex.session.workspaceScope, claude.session.workspaceScope);
    });
  });
});
