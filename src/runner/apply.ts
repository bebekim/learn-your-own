import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { VerifierReport } from '../contract/index.ts';
import { collectFiles } from './files.ts';

export interface ApplyResult {
  copied: string[];
  outcome: VerifierReport['outcome'];
}

/**
 * Apply a verified code artifact to a working tree. Only a passing run
 * applies by default; --force overrides with eyes open. The verifier report
 * is the gate: nothing unverified lands in the repo.
 */
export function applyRun({
  runDir,
  targetDir,
  force = false,
}: {
  runDir: string;
  targetDir: string;
  force?: boolean;
}): ApplyResult {
  const report = JSON.parse(
    readFileSync(join(runDir, 'verifier-report.json'), 'utf8')
  ) as VerifierReport;
  if (report.outcome !== 'pass' && !force) {
    throw new Error(
      `applyRun: run outcome is '${report.outcome}', not 'pass' — refusing to apply (use force to override)`
    );
  }
  const artifactDir = join(runDir, 'artifacts', 'code', 'generated');
  const copied = collectFiles(artifactDir).map((entry) => join('generated', entry));
  cpSync(artifactDir, join(targetDir, 'generated'), { recursive: true });
  return { copied, outcome: report.outcome };
}
