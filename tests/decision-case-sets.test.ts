import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addCases, computeTestHash, createCaseSet, fitBand, newTestSet, readCases, readSplits, recalibrate, relabelCases, type DecisionCase }
  from '../src/lyo/decisions/case-sets.ts';
import type { TypedDecisionProvider } from '../src/lyo/application/typed-decisions.ts';

const question = { type: 'score' as const, instructions: 'q', criteria: ['1', '2', '3', '4', '5'] };

/** Positives score high, negatives low, with some overlap; the level is encoded in the state. */
function makeCases(n = 160): DecisionCase[] {
  return Array.from({ length: n }, (_, i) => {
    const label = i % 2 === 0, level = label ? 3.5 + (i % 7) * 0.2 : 1 + (i % 9) * 0.3;
    return { id: `c${i}`, state: `level=${level.toFixed(2)} case=${i}`, inputFormat: 'command-output@1', label,
      labelSource: 'agent-draft' as const, stratum: i % 3 === 0 ? 'work' : 'personal', addedAt: '2026-11-25T00:00:00Z' };
  });
}

/** Reports the level written in the state as a point mass, as a calibrated model would. */
function stateProvider() {
  const provider = { name: 'mlxcel', calls: 0, async decide(req: { state: unknown }) {
    provider.calls++;
    const level = Number(/level=([\d.]+)/.exec(String(req.state))![1]);
    const lo = Math.floor(level), w = level - lo, probabilities: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 };
    probabilities[String(lo - 1)] += 1 - w; if (w) probabilities[String(lo)] += w;
    return { source: 'typed-decision@1' as const, provider: 'mlxcel', requestedModel: 'm', answeredModel: 'm', requestHash: 'h',
      answers: { match: { type: 'score' as const, score: 0, confidence: 1, probabilities, legend: {} } }, usage: null, decidedAt: '' };
  } };
  return provider as TypedDecisionProvider & { calls: number };
}

function withDir(fn: (dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-cases-'));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

test('the test split is stratified, frozen by hash, and new cases only join calibration', () => withDir(dir => {
  const cases = makeCases();
  const splits = createCaseSet(dir, cases);
  for (const stratum of ['work', 'personal']) for (const label of [true, false]) {
    const group = cases.filter(c => c.stratum === stratum && c.label === label);
    const inTest = group.filter(c => splits.test.includes(c.id)).length;
    assert.equal(inTest, Math.round(group.length * 0.3), `${stratum}/${label}`);
  }
  assert.throws(() => createCaseSet(dir, cases), /already exists/);
  const before = readSplits(dir);
  addCases(dir, [{ ...cases[0], id: 'new-1' }, cases[1]]);
  const after = readSplits(dir);
  assert.deepEqual(after.test, before.test);
  assert.equal(after.testHash, before.testHash);
  assert.ok(after.calibration.includes('new-1'));
  assert.equal(readCases(dir).length, 161, 'an existing id is not added twice');
  assert.notEqual(newTestSet(dir, { seed: 99 }).testHash, before.testHash, 'a new test set is a different identity');
}));

test('the band is fitted without reading test labels', () => withDir(async dir => {
  createCaseSet(dir, makeCases());
  const a = await recalibrate(dir, { provider: stateProvider(), providerName: 'mlxcel', model: 'm', question });
  // Flip every test label and re-freeze: calibration is untouched, so the band must be identical.
  const splits = readSplits(dir), test = new Set(splits.test);
  const flipped = readCases(dir).map(c => test.has(c.id) ? { ...c, label: !c.label } : c);
  writeFileSync(join(dir, 'cases.jsonl'), flipped.map(c => JSON.stringify(c)).join('\n') + '\n');
  writeFileSync(join(dir, 'splits.json'), JSON.stringify({ ...splits, testHash: computeTestHash(flipped, splits.test) }));
  const b = await recalibrate(dir, { provider: stateProvider(), providerName: 'mlxcel', model: 'm', question });
  assert.deepEqual(b.band, a.band);
  assert.notDeepEqual(b.test, a.test);
}));

test('recalibration asks only uncached cases and refuses silently relabelled test cases', () => withDir(async dir => {
  createCaseSet(dir, makeCases());
  const first = stateProvider();
  const report = await recalibrate(dir, { provider: first, providerName: 'mlxcel', model: 'm', question });
  assert.equal(first.calls, 160);
  assert.equal(report.sufficient, true);
  assert.ok(report.test.auc > 0.9);
  assert.ok(report.test.falseAlarms / report.test.negatives <= 0.2);
  const rerun = stateProvider();
  assert.equal((await recalibrate(dir, { provider: rerun, providerName: 'mlxcel', model: 'm', question })).asked, 0);
  assert.equal(rerun.calls, 0);
  addCases(dir, [{ ...makeCases(1)[0], id: 'added', state: 'level=4.10 case=added' }]);
  assert.equal((await recalibrate(dir, { provider: rerun, providerName: 'mlxcel', model: 'm', question })).asked, 1);
  const other = stateProvider();
  assert.equal((await recalibrate(dir, { provider: other, providerName: 'openrouter', model: 'upstage/solar-decide', question })).asked, 161,
    'another provider or model is cached separately');

  const splits = readSplits(dir), cases = readCases(dir);
  const tampered = cases.map(c => c.id === splits.test[0] ? { ...c, label: !c.label } : c);
  writeFileSync(join(dir, 'cases.jsonl'), tampered.map(c => JSON.stringify(c)).join('\n') + '\n');
  await assert.rejects(recalibrate(dir, { provider: rerun, providerName: 'mlxcel', model: 'm', question }), /labels changed/);
  assert.match(readFileSync(join(dir, 'splits.json'), 'utf8'), new RegExp(splits.testHash));
}));

test('band fitting meets its false-alarm and miss targets on the data it sees', () => {
  const positives = [3, 3.5, 4, 4.2, 4.5, 4.8, 5, 5, 5, 5], negatives = [1, 1.2, 1.5, 2, 2, 2.5, 3, 3.6, 1, 1.1];
  const band = fitBand(positives, negatives, 0.1, 0.1);
  assert.ok(negatives.filter(n => n >= band.yes).length / negatives.length <= 0.1);
  assert.ok(positives.filter(p => p <= band.no).length / positives.length <= 0.1);
  assert.ok(band.no < band.yes);
  assert.throws(() => fitBand([], [1]), /positives and negatives/);
});

test('relabelling keeps the split; a changed test label gives the test set a new identity and keeps the old one', () => withDir(dir => {
  createCaseSet(dir, makeCases());
  const before = readSplits(dir), testId = before.test[0], calId = before.calibration[0];
  const sourceOnly = relabelCases(dir, [{ id: testId, label: readCases(dir).find(c => c.id === testId)!.label, labelSource: 'repair-witness', evidenceRef: 'transcript:x' }], 'review');
  assert.equal(sourceOnly.previous, null, 'confirming a label with stronger evidence does not change the test identity');
  const flip = relabelCases(dir, [{ id: testId, label: 'ambiguous', labelSource: 'repair-witness', note: 'repair unclear' },
    { id: calId, label: false, labelSource: 'user-reviewed' }], 'repair review');
  const after = readSplits(dir);
  assert.deepEqual(after.test, before.test);
  assert.equal(flip.previous, before.testHash);
  assert.notEqual(after.testHash, before.testHash);
  assert.deepEqual(after.previousTestHashes!.map(p => p.testHash), [before.testHash]);
  const c = readCases(dir).find(x => x.id === testId)!;
  assert.equal(c.label, 'ambiguous'); assert.equal(c.labelSource, 'repair-witness'); assert.equal(c.evidenceRef, 'transcript:x');
  assert.throws(() => relabelCases(dir, [{ id: 'nope', label: true, labelSource: 'user-reviewed' }], 'x'), /unknown case/);
}));
