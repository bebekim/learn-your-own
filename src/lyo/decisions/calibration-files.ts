import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import type { TypedDecisionRecord } from '../application/typed-decisions.ts';
import type { TypedQuestion } from '../domain/typed-decision.ts';

const caseSchema = z.object({ id: z.string().min(1), text: z.string().min(1), stratum: z.string().optional(),
  labels: z.record(z.string(), z.union([z.boolean(), z.literal('ambiguous')])) }).loose();
const questionSchema = z.object({ type: z.literal('noul'), instructions: z.unknown(),
  criteria: z.object({ true: z.unknown().optional(), false: z.unknown().optional() }).optional() }).strict();

function readJsonl(path: string): unknown[] {
  return readFileSync(path, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

export function loadCalibrationFiles(casesPath: string, questionsPath: string, decisionsPath: string) {
  const cases = readJsonl(casesPath).map(value => caseSchema.parse(value));
  const states = new Map(cases.map(item => [item.id, item.text]));
  if (states.size !== cases.length) throw new Error('Duplicate calibration case ID');
  const questions = z.record(z.string(), questionSchema).parse(JSON.parse(readFileSync(questionsPath, 'utf8'))) as Record<string, TypedQuestion>;
  const questionsHash = hashValue(questions);
  const retained = new Map<string, TypedDecisionRecord>();
  if (existsSync(decisionsPath)) for (const row of readJsonl(decisionsPath) as Array<{
    caseId: string; questionsHash: string; stateHash?: string; record: TypedDecisionRecord
  }>) {
    const state = states.get(row.caseId);
    if (row.questionsHash !== questionsHash || state === undefined) continue;
    // Older Jev records retain the hash of the complete provider request.
    const matchesState = row.stateHash !== undefined ? row.stateHash === hashValue(state)
      : row.record.provider === 'typesafe-jev' && row.record.requestHash === hashValue({
        model: row.record.requestedModel, state, questions,
      });
    if (matchesState) retained.set(row.caseId, row.record);
  }
  return {cases, questions, questionsHash, retained};
}
