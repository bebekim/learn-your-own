import { appendFileSync } from 'node:fs';
import { loadCalibrationFiles } from './calibration-files.ts';
import { hashValue } from '../contract/refs.ts';
import type { TypedDecisionProvider } from '../application/typed-decisions.ts';
import { calibrationReport, type CalibrationLabel, type LabelledNoul } from '../domain/typed-decision-calibration.ts';

export const DEFAULT_BANDS = [{ no: 0.3, yes: 0.7 }, { no: 0.2, yes: 0.8 }, { no: 0.1, yes: 0.9 }];

/** Ask every question about every case, reusing decisions already retained for the same case and questions. */
export async function calibrateTypedQuestions(provider: TypedDecisionProvider, input: {
  casesPath: string; questionsPath: string; outPath: string; concurrency?: number; minimumPerClass?: number;
}) {
  const {cases, questions, questionsHash, retained} = loadCalibrationFiles(input.casesPath, input.questionsPath, input.outPath);
  const pending = cases.filter(item => !retained.has(item.id));
  let next = 0, spentInputTokens = 0;
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, pending.length) }, async () => {
    while (next < pending.length) {
      const item = pending[next++];
      const record = await provider.decide({ state: item.text, questions });
      spentInputTokens += record.usage?.inputTokens ?? 0;
      retained.set(item.id, record);
      appendFileSync(input.outPath, `${JSON.stringify({ caseId: item.id, questionsHash, stateHash: hashValue(item.text), record })}\n`);
    }
  }));

  const strata = ['all', ...new Set(cases.map(item => item.stratum).filter((s): s is string => Boolean(s)))];
  const report = Object.fromEntries(Object.keys(questions).map(name => {
    const labelled = (stratum: string): LabelledNoul[] => cases
      .filter(item => stratum === 'all' || item.stratum === stratum)
      .filter(item => item.labels[name] !== undefined)
      .map(item => {
        const answer = retained.get(item.id)!.answers[name];
        if (answer.type !== 'noul') throw new Error(`${name} needs a noul answer`);
        return { noul: answer.noul, label: item.labels[name] as CalibrationLabel };
      });
    return [name, Object.fromEntries(strata.map(stratum => [stratum,
      calibrationReport(labelled(stratum), DEFAULT_BANDS, input.minimumPerClass)]))];
  }));
  const models = [...new Set([...retained.values()].map(record => record.answeredModel))];
  return { questionsHash, models, reusedDecisions: cases.length - pending.length, newDecisions: pending.length, spentInputTokens, report };
}
