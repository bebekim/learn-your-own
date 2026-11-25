import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {hashValue} from '../src/lyo/contract/refs.ts';

test('offline matrix traces each decision and keeps stale, missing, and ambiguous evidence outside the four cells', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-matrix-'));
  try {
    const q = {signal: {type:'noul', instructions:'Does this check apply?'}};
    const examples = [
      ['hit', true, .7], ['alarm', false, .99], ['miss', true, .3], ['clear', false, .1],
      ['unsure+', true, .5], ['unsure-', false, .5], ['disputed', 'ambiguous', .9],
      ['unlabelled', undefined, .1], ['missing', true, undefined], ['stale', true, .9],
    ] as const;
    const cases = examples.map(([id,label]) => ({id, text:id, stratum:'sample', labels:{signal:label}}));
    const decisions = examples.filter(x => x[2] !== undefined).map(([id,,score]) => {
      const state = id === 'stale' ? 'previous text' : id;
      return {caseId:id, questionsHash:hashValue(q), record:{
        source:'typed-decision@1', provider:'typesafe-jev', requestedModel:'m', answeredModel:'m',
        requestHash:hashValue({model:'m',state,questions:q}), answers:{signal:{type:'noul',noul:score}},
        usage:null, decidedAt:'2026-01-01T00:00:00Z',
      }};
    });
    writeFileSync(join(dir,'cases'), cases.map(row=>JSON.stringify(row)).join('\n'));
    writeFileSync(join(dir,'questions'),JSON.stringify(q));
    writeFileSync(join(dir,'decisions'),decisions.map(row=>JSON.stringify(row)).join('\n'));
    const cli = resolve('src/cli.ts');
    const run = (...args: string[]) => execFileSync(process.execPath,[cli,'eval','matrix','--cases','cases','--questions','questions',
      '--decisions','decisions',...args],{cwd:dir, encoding:'utf8'});
    assert.match(run(), /LYO decision\s+Label positive\s+Label negative/);
    const report = JSON.parse(run('--json','--rates','--stratum','sample','--cell','FP','--case','alarm'));
    assert.deepEqual(report.counts,{TP:1, FP:1, FN:1, TN:1, abstainedPositive:1, abstainedNegative:1, unlabelled:2, unmeasured:2});
    assert.deepEqual(report.caseIds,['alarm']);
    assert.equal(report.trace.decision.requestHash,decisions[1].record.requestHash);
    assert.equal(report.trace.label,false);
    assert.equal(report.trace.score,.99);
    assert.deepEqual(report.decidedRates,{sensitivity:.5,specificity:.5,falsePositiveRate:.5,falseNegativeRate:.5,accuracy:.5,youdenIndex:0});
    const retry = JSON.parse(run('--json','--cell','unmeasured'));
    assert.deepEqual(retry.caseIds,['missing','stale']);
  } finally { rmSync(dir,{force:true,recursive:true}); }
});
