import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {LessonStore} from '../src/lyo/storage/lesson-store.ts';

test('store and prompt-hook switch by environment, after eligibility and before delivery', () => {
  const dir = mkdtempSync(join(tmpdir(),'selector-'));
  const path = join(dir,'lessons.db');
  const s = new LessonStore(path);
  try {
    for (const [cue,advice] of [['invoice','Review invoice'],['parser','Review parser'],['invoice draft','Unverified invoice advice']]) {
      const row = s.createLesson({failure_class:'test',trigger_cue:cue,intervention:advice});
      if (!cue.endsWith('draft')) s.db.prepare('update lesson set helpful_count=1 where lesson_id=?').run(row.lesson_id);
    }
    const config = {retriever:'bm25@1', policy:'retrieval-order@1', cue:'parser', failure_class:'test'};
    assert.deepEqual(s.selectLessons(config).map(x=>x.intervention), ['Review parser']);
    const decision = s.selectWithDecision(config);
    assert.equal(decision.candidates[0].propensity,1);
    assert.equal(decision.retriever,config.retriever);
    const receipt = s.recordDecision({...decision,run_id:'fixture',failure_class:'test'});
    assert.equal(JSON.parse(receipt.context).retriever, config.retriever);
    assert.equal(JSON.parse(receipt.context).propensityMethod, 'exact');
    const hook = prompt => {
      const result = spawnSync(process.execPath,['src/lyo/selection/session-hook.ts','--json'],{
        input:JSON.stringify({hook_event_name:'UserPromptSubmit',prompt,cwd:dir,session_id:'session'}),
        encoding:'utf8',env:{...process.env,LYO_STORE_PATH:path,LYO_SESSION_UNVALIDATED_LESSONS:'0',
          LYO_LESSON_RETRIEVER:config.retriever,LYO_LESSON_POLICY:config.policy}});
      assert.equal(result.status,0,result.stderr);
      return result.stdout;
    };
    assert.match(hook('parser privateNonce'), /Review parser/);
    assert.equal(s.db.prepare("select count(*) as count from learning_trace where instr(payload_json, 'privateNonce') > 0").get().count, 0);
    const invoice = hook('invoice');
    assert.match(invoice,/Review invoice/);
    assert.doesNotMatch(invoice,/Review parser|Unverified invoice/);
    assert.doesNotMatch(hook('airplane'),/Review invoice|Review parser|Unverified invoice/);
    assert.ok(s.db.prepare("select 1 from learning_trace where json_extract(payload_json,'$.reason')='no-match'").get());
  } finally { s.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('abstention and unsimulated probabilities are represented truthfully', () => {
  const s=new LessonStore();
  try {
    s.createLesson({failure_class:'test',trigger_cue:'one', intervention:'check'});
    const policy={name:'silent',version:1,sampleSelection:()=>[]};
    const input={failure_class:'test',policy,limit:1};
    const d=s.selectWithDecision(input);
    assert.equal(d.null_arm,1);
    assert.equal(d.reason,'abstained');
    assert.equal(d.candidates[0].propensity,0);
    assert.equal(s.selectWithDecision({...input,propensityReplicates:0}).candidates[0].propensity,null);
    assert.throws(()=>s.selectLessons({...input,retriever:{name:'bad',version:1,retrieve:()=>[{lesson_id:'foreign',reason:'wrong scope'}]}}),/ineligible/);
  } finally { s.close(); }
});
