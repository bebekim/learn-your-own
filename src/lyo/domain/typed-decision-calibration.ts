/**
 * How a Noul threshold band performs against human labels. Ambiguous labels are
 * excluded from the rates and counted. With few positives, recall is reported with
 * its count and the band is marked insufficient rather than tuned to noise.
 */

export type CalibrationLabel = boolean | 'ambiguous';
export interface LabelledNoul { noul: number; label: CalibrationLabel }

export interface BandMetrics {
  yes: number;
  no: number;
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
  const known = cases.filter(item => item.label !== 'ambiguous');
  const positives = known.filter(item => item.label === true), negatives = known.filter(item => item.label === false);
  const yes = (item: LabelledNoul) => item.noul >= band.yes, unknown = (item: LabelledNoul) => item.noul > band.no && item.noul < band.yes;
  const truePositives = positives.filter(yes).length, falsePositives = negatives.filter(yes).length;
  const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : null;
  return { ...band, truePositives, falsePositives,
    unknownPositives: positives.filter(unknown).length, unknownNegatives: negatives.filter(unknown).length,
    falsePositiveRate: ratio(falsePositives, negatives.length), recall: ratio(truePositives, positives.length),
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
