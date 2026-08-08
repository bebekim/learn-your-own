import { readFileSync } from 'node:fs';

import type { DisagreementInput, JudgeClassification, JudgeFn, Judgment } from './trace-consumer.ts';

/**
 * judge-calibration — test the test. Before any verdict from the LLM judge is
 * trusted, the judge itself is scored against cases with known verdicts
 * (Argona's hygiene rule: one clear pass and one plausible wrong through the
 * verifier before believing it). A judge error counts as wrong, never skipped.
 */

export interface CalibrationCase {
  name: string;
  input: DisagreementInput;
  expected: JudgeClassification;
}

export interface CalibrationCaseResult {
  name: string;
  expected: JudgeClassification;
  actual?: JudgeClassification;
  match: boolean;
  error?: string;
}

export interface CalibrationResult {
  total: number;
  correct: number;
  accuracy: number;
  perCase: CalibrationCaseResult[];
}

export async function runJudgeCalibration({
  cases,
  judge,
}: {
  cases: CalibrationCase[];
  judge: JudgeFn;
}): Promise<CalibrationResult> {
  const perCase: CalibrationCaseResult[] = [];
  for (const calibrationCase of cases) {
    let judgment: Judgment | undefined;
    let error: string | undefined;
    try {
      judgment = await judge({ ...calibrationCase.input, runId: 'calibration' });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const actual = judgment?.classification;
    perCase.push({
      name: calibrationCase.name,
      expected: calibrationCase.expected,
      actual,
      match: error === undefined && actual === calibrationCase.expected,
      ...(error ? { error } : {}),
    });
  }
  const correct = perCase.filter((entry) => entry.match).length;
  return {
    total: cases.length,
    correct,
    accuracy: cases.length === 0 ? 0 : correct / cases.length,
    perCase,
  };
}

export function loadCalibrationCases(path: string): CalibrationCase[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`calibration cases must be a JSON array: ${path}`);
  }
  return parsed as CalibrationCase[];
}
