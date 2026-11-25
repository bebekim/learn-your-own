import { accessSync } from 'node:fs';
import { loadCalibrationFiles } from './calibration-files.ts';
import { classifySignal, decidedRates, matrixCounts, type Band } from '../domain/confusion-matrix.ts';

interface MatrixOptions {
  casesPath: string;
  questionsPath: string;
  decisionsPath: string;
  question?: string;
  stratum?: string;
  cell?: string;
  caseId?: string;
  rates: boolean;
  band: Band;
}

export function evaluateRetainedMatrix(options: MatrixOptions) {
  accessSync(options.decisionsPath);
  const {cases, questions, questionsHash, retained} = loadCalibrationFiles(options.casesPath, options.questionsPath, options.decisionsPath);
  const names = Object.keys(questions);
  const question = options.question ?? (names.length === 1 ? names[0] : undefined);
  if (!question || !Object.hasOwn(questions, question)) throw new Error('Choose --question from: ' + names.join(', '));
  const {band} = options;
  if (!(0 <= band.no && band.no < band.yes && band.yes <= 1)) throw new Error('Expected thresholds 0 <= no < yes <= 1');
  const scoped = cases.filter(item => options.stratum === undefined || options.stratum === item.stratum);
  if (options.stratum !== undefined && !scoped.length) throw new Error('Unknown stratum: ' + options.stratum);
  const rows = scoped.map(item => {
    const record = retained.get(item.id);
    const answer = record?.answers[question];
    if (answer && answer.type !== 'noul') throw new Error('Expected a Noul answer for ' + question);
    const label = Object.hasOwn(item.labels, question) ? item.labels[question] : undefined;
    const cell = classifySignal(answer?.noul, label, band);
    return {id: item.id, cell, case: item, score: answer?.noul ?? null, label: label ?? null, decision: record ?? null};
  });
  const counts = matrixCounts(rows.map(row => row.cell));
  if (options.cell && !Object.hasOwn(counts, options.cell)) throw new Error('Choose --cell from: ' + Object.keys(counts).join(', '));
  const matching = options.cell ? rows.filter(row => row.cell === options.cell) : rows;
  const trace = options.caseId ? matching.find(row => row.id === options.caseId) : undefined;
  if (options.caseId && !trace) throw new Error('Case not found within this selection: ' + options.caseId);
  return {
    question, band, stratum: options.stratum ?? null, cases: rows.length, counts,
    decidedRates: options.rates ? decidedRates(counts) : undefined,
    caseIds: options.cell ? matching.map(row => row.id) : undefined,
    trace: trace ? {...trace, questionDefinition: questions[question], questionsHash} : undefined,
  };
}

export function formatMatrix(report: ReturnType<typeof evaluateRetainedMatrix>) {
  const {counts: c} = report;
  const lines = [
    `${report.question} · ${report.cases} cases · no ≤ ${report.band.no}, yes ≥ ${report.band.yes}`,
    'LYO decision     Label positive     Label negative',
    `Yes              TP ${String(c.TP).padEnd(14)} FP ${c.FP}`,
    `No               FN ${String(c.FN).padEnd(14)} TN ${c.TN}`,
    `Abstained           ${String(c.abstainedPositive).padEnd(14)}    ${c.abstainedNegative}`,
    `Missing or ambiguous label: ${c.unlabelled}. Labelled with no matching decision: ${c.unmeasured}.`,
  ];
  if (report.decidedRates) {
    lines.push('Rates for labelled yes/no decisions');
    for (const [name, value] of Object.entries(report.decidedRates)) lines.push(`  ${name}  ${value?.toFixed(3) ?? 'undefined'}`);
  }
  if (report.caseIds) lines.push('Case IDs: ' + (report.caseIds.join(', ') || '(none)'));
  if (report.trace) lines.push(JSON.stringify(report.trace, null, 2));
  else lines.push('Add --cell FP to list cases, --case ID for its evidence, or --rates for metrics.');
  return lines.join('\n');
}
