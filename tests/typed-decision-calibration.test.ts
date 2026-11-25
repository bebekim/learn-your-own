import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { calibrationReport, evaluateNoulBand } from '../src/lyo/domain/typed-decision-calibration.ts';
import { calibrateTypedQuestions } from '../src/lyo/decisions/calibrate.ts';
import type { TypedDecisionProvider } from '../src/lyo/application/typed-decisions.ts';

test('band metrics separate answered, unknown and ambiguous cases', () => {
  const cases = [
    { noul: 0.95, label: true as const }, { noul: 0.5, label: true as const },
    { noul: 0.9, label: false as const }, { noul: 0.05, label: false as const }, { noul: 0.4, label: false as const },
    { noul: 0.99, label: 'ambiguous' as const },
  ];
  assert.deepEqual(evaluateNoulBand(cases, { no: 0.3, yes: 0.7 }), { no: 0.3, yes: 0.7, truePositives: 1, falsePositives: 1,
    matrix: {TP: 1, FP: 1, FN: 0, TN: 1, abstainedPositive: 1, abstainedNegative: 1, unlabelled: 1, unmeasured: 0},
    unknownPositives: 1, unknownNegatives: 1, falsePositiveRate: 1 / 3, recall: 1 / 2, precision: 1 / 2 });
  const report = calibrationReport(cases, [{ no: 0.3, yes: 0.7 }]);
  assert.deepEqual([report.positives, report.negatives, report.ambiguous, report.sufficient], [2, 3, 1, false]);
  assert.equal(evaluateNoulBand([{ noul: 0.9, label: false }], { no: 0.3, yes: 0.7 }).recall, null, 'no positives: recall unknown');
});

test('calibration retains every decision and reuses it instead of paying again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-calibrate-'));
  try {
    writeFileSync(join(dir, 'cases.jsonl'), [
      { id: 'a', text: 'port the fix to the CSV reader', stratum: 'random', labels: { transfer: true } },
      { id: 'b', text: 'commit what we have', stratum: 'random', labels: { transfer: false } },
    ].map(row => JSON.stringify(row)).join('\n'));
    writeFileSync(join(dir, 'questions.json'), JSON.stringify({ transfer: { type: 'noul', instructions: 'Reuses a repair elsewhere.' } }));
    let calls = 0;
    const provider: TypedDecisionProvider = { name: 'fake', async decide(request) {
      calls++;
      return { source: 'typed-decision@1', provider: 'fake', requestedModel: 'm', answeredModel: 'm-1', requestHash: 'h',
        answers: { transfer: { type: 'noul', noul: String(request.state).includes('port') ? 0.9 : 0.1 } },
        usage: { inputTokens: 10, outputTokens: 1 }, decidedAt: 'now' };
    } };
    const input = { casesPath: join(dir, 'cases.jsonl'), questionsPath: join(dir, 'questions.json'), outPath: join(dir, 'out.jsonl') };
    const first = await calibrateTypedQuestions(provider, input);
    assert.equal(first.newDecisions, 2);
    assert.equal(first.spentInputTokens, 20);
    assert.deepEqual(first.models, ['m-1']);
    const band = first.report.transfer.random.bands[0];
    assert.deepEqual([band.truePositives, band.falsePositives], [1, 0]);
    const second = await calibrateTypedQuestions(provider, input);
    assert.deepEqual([second.newDecisions, second.reusedDecisions, calls], [0, 2, 2]);
    assert.equal(readFileSync(input.outPath, 'utf8').trim().split('\n').length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
