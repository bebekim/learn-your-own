import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mustValidate, validateVerifierReport, validatePlan, hashValue, type VerifierReport } from '../contract/index.ts';

export interface RunComparison {
  verdict: 'improved' | 'regressed' | 'unchanged' | 'incomparable';
  confidence: 'low_confidence';
  limitations: string[];
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
 * baseline run? Independently generated suites are incomparable. Even with
 * identical instruments, a single pair is descriptive and low confidence.
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

  const limitations = ['single-pair comparison does not establish a learning effect'];
  if (baseline.specRef.sha256 !== treatment.specRef.sha256 ||
      baseline.testRef.sha256 !== treatment.testRef.sha256 ||
      baseline.counts.total !== treatment.counts.total)
    limitations.push('specification or verifier differs');
  try {
    const plans = [baselineDir, treatmentDir].map(dir =>
      mustValidate(validatePlan(JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'))), 'plan'));
    if (hashValue(plans[0]) !== hashValue(plans[1])) limitations.push('plan or executors differ');
  } catch {
    limitations.push('matching plan/executor evidence unavailable');
  }
  let verdict: RunComparison['verdict'];
  if (limitations.length > 1) {
    verdict = 'incomparable';
  } else if (outcomeDelta > 0 || (outcomeDelta === 0 && failedDelta < 0)) {
    verdict = 'improved';
  } else if (outcomeDelta < 0 || (outcomeDelta === 0 && failedDelta > 0)) {
    verdict = 'regressed';
  } else {
    verdict = 'unchanged';
  }

  return {
    verdict,
    confidence: 'low_confidence',
    limitations,
    failedDelta,
    baseline: { outcome: baseline.outcome, counts: baseline.counts },
    treatment: { outcome: treatment.outcome, counts: treatment.counts },
  };
}

function readReport(runDir: string): VerifierReport {
  return mustValidate(validateVerifierReport(JSON.parse(readFileSync(join(runDir, 'verifier-report.json'), 'utf8'))), 'verifier report');
}
