import { execFile } from 'node:child_process';

import type { VerifierPerTest, VerifierReportCounts } from '../contract/index.ts';

const DEFAULT_TIMEOUT_MS = 300000;
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

export interface RunTestsResult {
  stdout: string;
  stderr: string;
  code: number;
}

export type RunTestsFn = (args: { cwd: string; testPath: string }) => Promise<RunTestsResult>;

export interface VerifierRun {
  counts: VerifierReportCounts;
  outcome: 'pass' | 'fail' | 'error';
  perTest: VerifierPerTest[];
  rawOutput: string;
}

const SUMMARY_PATTERN = /^# (tests|pass|fail) (\d+)$/gm;

/** Parse `node --test` TAP output (the default when stdout is piped). */
export function parseTapOutput(output: string): {
  counts: VerifierReportCounts;
  perTest: VerifierPerTest[];
} {
  const perTest: VerifierPerTest[] = [];
  for (const match of output.matchAll(/^(not )?ok \d+ - (.+)$/gm)) {
    perTest.push({ name: match[2], status: match[1] ? 'fail' : 'pass' });
  }

  const summary: Record<string, number> = {};
  for (const match of output.matchAll(SUMMARY_PATTERN)) {
    summary[match[1]] = Number(match[2]);
  }

  return {
    counts: {
      total: summary.tests ?? perTest.length,
      passed: summary.pass ?? perTest.filter((entry) => entry.status === 'pass').length,
      failed: summary.fail ?? perTest.filter((entry) => entry.status === 'fail').length,
    },
    perTest,
  };
}

/**
 * Deterministic verifier: runs `node --test` over the merged code+test tree
 * and maps the result to a report outcome. No LLM involved.
 */
export async function runVerifier({
  dir,
  testPath,
  runTests,
}: {
  dir: string;
  testPath: string;
  runTests?: RunTestsFn;
}): Promise<VerifierRun> {
  const run = runTests || defaultRunTests;
  const result = await run({ cwd: dir, testPath });
  const rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const { counts, perTest } = parseTapOutput(result.stdout);

  let outcome: VerifierRun['outcome'];
  if (result.code > 1 || counts.total === 0) {
    outcome = 'error';
  } else if (counts.failed > 0 || result.code === 1) {
    outcome = 'fail';
  } else {
    outcome = 'pass';
  }

  return { counts, outcome, perTest, rawOutput };
}

function defaultRunTests({ cwd, testPath }: { cwd: string; testPath: string }): Promise<RunTestsResult> {
  // Node 24: pass a glob (a bare directory is loaded as a module entry) and
  // pin the TAP reporter (the default reporter is spec even when piped).
  const pattern = testPath.endsWith('.js') ? testPath : `${testPath}/**/*.test.js`;
  // Strip the parent test-runner context: an inherited NODE_TEST_CONTEXT makes
  // the child runner refuse with "run() is being called recursively".
  const env = { ...process.env, NODE_TEST_CONTEXT: undefined };
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      ['--test', '--test-reporter=tap', pattern],
      { cwd, env, timeout: DEFAULT_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolve({ stdout, stderr, code: typeof error?.code === 'number' ? error.code : 0 });
      }
    );
  });
}
