import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import type { TypedDecisionProvider, TypedDecisionRecord } from '../application/typed-decisions.ts';
import { calibrationReport, type CalibrationLabel, type LabelledNoul } from '../domain/typed-decision-calibration.ts';
import type { TypedQuestion } from '../domain/typed-decision.ts';

const caseSchema = z.object({ id: z.string().min(1), text: z.string().min(1), stratum: z.string().optional(),
  labels: z.record(z.string(), z.union([z.boolean(), z.literal('ambiguous')])) }).loose();
const questionSchema = z.object({ type: z.literal('noul'), instructions: z.unknown(),
  criteria: z.object({ true: z.unknown().optional(), false: z.unknown().optional() }).optional() }).strict();

export const DEFAULT_BANDS = [{ no: 0.3, yes: 0.7 }, { no: 0.2, yes: 0.8 }, { no: 0.1, yes: 0.9 }];

function readJsonl(path: string): unknown[] {
  return readFileSync(path, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

/** Ask every question about every case, reusing decisions already retained for the same case and questions. */
export async function calibrateTypedQuestions(provider: TypedDecisionProvider, input: {
  casesPath: string; questionsPath: string; outPath: string; concurrency?: number; minimumPerClass?: number;
}) {
  const cases = readJsonl(input.casesPath).map(value => caseSchema.parse(value));
  const questions = z.record(z.string(), questionSchema).parse(JSON.parse(readFileSync(input.questionsPath, 'utf8'))) as Record<string, TypedQuestion>;
  const questionsHash = hashValue(questions);
  const retained = new Map<string, TypedDecisionRecord>();
  if (existsSync(input.outPath)) for (const row of readJsonl(input.outPath) as Array<{ caseId: string; questionsHash: string; record: TypedDecisionRecord }>) {
    if (row.questionsHash === questionsHash) retained.set(row.caseId, row.record);
  }
  const pending = cases.filter(item => !retained.has(item.id));
  let next = 0, spentInputTokens = 0;
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, pending.length) }, async () => {
    while (next < pending.length) {
      const item = pending[next++];
      const record = await provider.decide({ state: item.text, questions });
      spentInputTokens += record.usage?.inputTokens ?? 0;
      retained.set(item.id, record);
      appendFileSync(input.outPath, `${JSON.stringify({ caseId: item.id, questionsHash, record })}\n`);
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
