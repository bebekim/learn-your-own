import { noulVerdict } from './typed-decision.ts';
export type CalibrationLabel = boolean | 'ambiguous';

export type MatrixCell = 'TP' | 'FP' | 'FN' | 'TN' | 'abstainedPositive' | 'abstainedNegative' | 'unlabelled' | 'unmeasured';
export type Band = {yes: number; no: number};

export function classifySignal(score: number | undefined, label: CalibrationLabel | undefined, band: Band): MatrixCell {
  if (label !== true && label !== false) return 'unlabelled';
  if (score === undefined) return 'unmeasured';
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Invalid retained Noul score');
  const verdict = noulVerdict({type: 'noul', noul: score}, band);
  if (verdict === 'unknown') return label ? 'abstainedPositive' : 'abstainedNegative';
  if (verdict === 'yes') return label ? 'TP' : 'FP';
  return label ? 'FN' : 'TN';
}

export function matrixCounts(cells: Iterable<MatrixCell>) {
  const counts = {TP: 0, FP: 0, FN: 0, TN: 0, abstainedPositive: 0, abstainedNegative: 0, unlabelled: 0, unmeasured: 0};
  for (const cell of cells) counts[cell]++;
  return counts;
}

export function decidedRates({TP, FP, FN, TN}: ReturnType<typeof matrixCounts>) {
  const ratio = (n: number, total: number) => total ? n / total : null;
  const sensitivity = ratio(TP, TP + FN);
  const specificity = ratio(TN, TN + FP);
  return {
    sensitivity, specificity, falsePositiveRate: ratio(FP, TN + FP), falseNegativeRate: ratio(FN, TP + FN),
    accuracy: ratio(TP + TN, TP + FP + FN + TN),
    youdenIndex: sensitivity === null || specificity === null ? null : sensitivity + specificity - 1,
  };
}
