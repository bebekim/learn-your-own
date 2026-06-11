import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function seedEditThenVerifierLedger({
  root,
  corpusDir,
  repoName,
  runId,
  sourcePath,
  verifierCommand = 'npm test -- tests/compiler-frontend.test.js',
}) {
  const dbPath = ledgerPath(corpusDir, repoName);
  const seed = `
    import {
      createKernel,
      initLedger,
      recordHookEvent
    } from './src/index.ts';

    const kernel = createKernel({ dbPath: process.argv[1] });
    initLedger(kernel);
    const common = {
      sessionId: process.argv[2],
      turnId: process.argv[2],
      cwd: process.cwd()
    };
    recordHookEvent(kernel, {
      ...common,
      eventId: process.argv[2] + '-01-edit',
      eventName: 'PostToolUse',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\\n*** Update File: ' + process.argv[3] + '\\n@@\\n-old\\n+new\\n*** End Patch'
        },
        tool_response: { exit_code: 0 }
      }
    });
    recordHookEvent(kernel, {
      ...common,
      eventId: process.argv[2] + '-02-test',
      eventName: 'PostToolUse',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: process.argv[4]
        },
        tool_response: { exit_code: 0, stdout: 'ok' }
      }
    });
  `;
  execFileSync(process.execPath, ['--eval', seed, dbPath, runId, sourcePath, verifierCommand], { cwd: root });
}

export function seedEditVerifierThenExternalLedger({
  root,
  corpusDir,
  repoName,
  runId,
  sourcePath,
}) {
  const dbPath = ledgerPath(corpusDir, repoName);
  const seed = `
    import {
      createKernel,
      initLedger,
      recordHookEvent
    } from './src/index.ts';

    const kernel = createKernel({ dbPath: process.argv[1] });
    initLedger(kernel);
    const common = {
      sessionId: process.argv[2],
      turnId: process.argv[2],
      cwd: process.cwd()
    };
    recordHookEvent(kernel, {
      ...common,
      eventId: process.argv[2] + '-01-edit',
      eventName: 'PostToolUse',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\\n*** Update File: ' + process.argv[3] + '\\n@@\\n-old\\n+new\\n*** End Patch'
        },
        tool_response: { exit_code: 0 }
      }
    });
    recordHookEvent(kernel, {
      ...common,
      eventId: process.argv[2] + '-02-test',
      eventName: 'PostToolUse',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'npm test -- tests/compiler-frontend.test.js'
        },
        tool_response: { exit_code: 0, stdout: 'ok' }
      }
    });
    recordHookEvent(kernel, {
      ...common,
      eventId: process.argv[2] + '-03-external',
      eventName: 'PostToolUse',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'railway up'
        },
        tool_response: { exit_code: 0, stdout: 'deployed' }
      }
    });
  `;
  execFileSync(process.execPath, ['--eval', seed, dbPath, runId, sourcePath], { cwd: root });
}

function ledgerPath(corpusDir, repoName) {
  const dbDir = join(corpusDir, repoName, '.agent-learning');
  mkdirSync(dbDir, { recursive: true });
  return join(dbDir, 'learning.sqlite');
}
