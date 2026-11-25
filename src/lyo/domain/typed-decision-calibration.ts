import { classifySignal, matrixCounts, type CalibrationLabel } from './confusion-matrix.ts';

/**
 * How a Noul threshold band performs against human labels. Ambiguous labels are
 * excluded from the rates and counted. With few positives, recall is reported with
 * its count and the band is marked insufficient rather than tuned to noise.
 */

export type { CalibrationLabel } from './confusion-matrix.ts';
export interface LabelledNoul { noul: number; label: CalibrationLabel }

export interface BandMetrics {
  yes: number;
  no: number;
  matrix: ReturnType<typeof matrixCounts>;
  truePositives: number;
  falsePositives: number;
  unknownPositives: number;
  unknownNegatives: number;
  /** Labelled negatives answered yes, over all labelled negatives. */
  falsePositiveRate: number | null;
  /** Labelled positives answered yes, over all labelled positives. */
  recall: number | null;
  precision: number | null;
}

export function evaluateNoulBand(cases: readonly LabelledNoul[], band: { yes: number; no: number }): BandMetrics {
  const matrix = matrixCounts(cases.map(item => classifySignal(item.noul, item.label, band)));
  const {TP: truePositives, FP: falsePositives, abstainedPositive: unknownPositives, abstainedNegative: unknownNegatives} = matrix;
  const ratio = (n: number, total: number) => total ? n / total : null;
  return { ...band, matrix, truePositives, falsePositives, unknownPositives, unknownNegatives,
    falsePositiveRate: ratio(falsePositives, falsePositives + matrix.TN + unknownNegatives),
    recall: ratio(truePositives, truePositives + matrix.FN + unknownPositives),
    precision: ratio(truePositives, truePositives + falsePositives) };
}

export function calibrationReport(cases: readonly LabelledNoul[], bands: ReadonlyArray<{ yes: number; no: number }>,
  minimumPerClass = 20) {
  const positives = cases.filter(item => item.label === true).length, negatives = cases.filter(item => item.label === false).length;
  return { cases: cases.length, ambiguous: cases.length - positives - negatives, positives, negatives,
    // Too few labelled positives or negatives cannot support a threshold choice.
    sufficient: positives >= minimumPerClass && negatives >= minimumPerClass,
    bands: bands.map(band => evaluateNoulBand(cases, band)) };
}
