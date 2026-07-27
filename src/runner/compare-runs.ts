import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { VerifierReport } from '../contract/index.ts';

export interface RunComparison {
  verdict: 'improved' | 'regressed' | 'unchanged';
  failedDelta: number;
  baseline: { outcome: VerifierReport['outcome']; counts: VerifierReport['counts'] };
  treatment: { outcome: VerifierReport['outcome']; counts: VerifierReport['counts'] };
}

const OUTCOME_SCORE: Record<VerifierReport['outcome'], number> = {
  pass: 2,
  fail: 1,
  error: 0,
};

/**
 * Deterministic before/after measurement: did the treatment run beat the
 * baseline run? Verdicts key on outcome first, then FAILURE-count delta —
 * each run generates a fresh frozen suite, so raw passed-counts (and suite
 * sizes) are not comparable across runs.
 */
export function compareRuns({
  baselineDir,
  treatmentDir,
}: {
  baselineDir: string;
  treatmentDir: string;
}): RunComparison {
  const baseline = readReport(baselineDir);
  const treatment = readReport(treatmentDir);
  const failedDelta = treatment.counts.failed - baseline.counts.failed;
  const outcomeDelta = OUTCOME_SCORE[treatment.outcome] - OUTCOME_SCORE[baseline.outcome];

  let verdict: RunComparison['verdict'];
  if (outcomeDelta > 0 || (outcomeDelta === 0 && failedDelta < 0)) {
    verdict = 'improved';
  } else if (outcomeDelta < 0 || (outcomeDelta === 0 && failedDelta > 0)) {
    verdict = 'regressed';
  } else {
    verdict = 'unchanged';
  }

  return {
    verdict,
    failedDelta,
    baseline: { outcome: baseline.outcome, counts: baseline.counts },
    treatment: { outcome: treatment.outcome, counts: treatment.counts },
  };
}

function readReport(runDir: string): VerifierReport {
  return JSON.parse(readFileSync(join(runDir, 'verifier-report.json'), 'utf8')) as VerifierReport;
}
