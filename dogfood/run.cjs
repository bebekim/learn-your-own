/**
 * LYO live-fire dogfood — drives the REAL lesson store + observer through the
 * real orchestrator wiring (testMode agents, no LLM calls) with a persistent
 * on-disk store, across two separate processes:
 *
 *   node run.js run1    rejection -> lesson CREATE -> injection -> approval -> helpful=1
 *   node run.js run2    (new process) same-cue rejection -> cross-run recall -> helpful=2
 *   node run.js inspect dump the store tables
 *
 * Store path comes from ZEROSHOT_LYO_STORE_PATH (observer resolution order),
 * pointing at a scratch project dir that mimics <project>/.zeroshot/.
 */
const fs = require('fs');
const path = require('path');

const ZEROSHOT = '/Users/marcus.kim/repositories/oss/zeroshot-lyo';
const SCRATCH = path.join(__dirname, 'scratch-project');
const RUNTIME = path.join(SCRATCH, 'runtime');
const STORE = path.join(SCRATCH, '.zeroshot', 'lyo-lessons.db');

process.env.ZEROSHOT_LYO_STORE_PATH = STORE;

const Database = require(path.join(ZEROSHOT, 'node_modules', 'better-sqlite3'));
const Orchestrator = require(path.join(ZEROSHOT, 'src', 'orchestrator'));

const mode = process.argv[2] || 'run1';

const REJECTION = {
  topic: 'VALIDATION_RESULT',
  sender: 'validator',
  content: {
    text: 'Tests failed: npm test',
    data: { approved: false, errors: ['Missing regression coverage'] },
  },
};

const APPROVAL = {
  topic: 'VALIDATION_RESULT',
  sender: 'validator',
  content: { text: 'All tests pass now', data: { approved: true, errors: [] } },
};

function dumpStore() {
  if (!fs.existsSync(STORE)) {
    console.log('\n[store] no store file yet at', STORE);
    return;
  }
  const db = new Database(STORE, { readonly: true });
  console.log('\n===== lesson =====');
  for (const r of db
    .prepare(
      'SELECT lesson_id, status, failure_class, trigger_cue, helpful_count, harmful_count, uses, provenance FROM lesson'
    )
    .all()) {
    console.log(r);
  }
  console.log('===== lesson_application =====');
  for (const r of db
    .prepare(
      'SELECT application_id, lesson_id, run_id, outcome, counted, sampled_score FROM lesson_application'
    )
    .all()) {
    console.log(r);
  }
  console.log('===== lesson_delta =====');
  for (const r of db
    .prepare('SELECT delta_id, lesson_id, run_id, actor, delta_type FROM lesson_delta ORDER BY delta_id')
    .all()) {
    console.log(r);
  }
  const hasDecisionTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lesson_decision'")
    .get();
  if (hasDecisionTable) {
    console.log('===== lesson_decision (v0.2) =====');
    for (const r of db
      .prepare('SELECT decision_id, run_id, cycle_index, failure_class, null_arm, policy, candidates, selected FROM lesson_decision')
      .all()) {
      console.log(r);
    }
    console.log('===== lyo_meta =====');
    for (const r of db.prepare('SELECT key, value FROM lyo_meta').all()) {
      console.log(r);
    }
    console.log('===== application decision_id join =====');
    for (const r of db
      .prepare('SELECT application_id, run_id, outcome, counted, decision_id FROM lesson_application')
      .all()) {
      console.log(r);
    }
  }
  console.log('===== v_lesson_library =====');
  for (const r of db
    .prepare('SELECT lesson_id, status FROM lesson')
    .all()) {
    const inView = db
      .prepare('SELECT lesson_id, posterior_mean FROM v_lesson_library WHERE lesson_id = ?')
      .get(r.lesson_id);
    console.log(`${r.lesson_id} [${r.status}]`, inView ? `in view, posterior_mean=${inView.posterior_mean}` : 'NOT in view');
  }
  db.close();
}

async function main() {
  if (mode === 'inspect') {
    dumpStore();
    return;
  }

  fs.mkdirSync(RUNTIME, { recursive: true });
  const orchestrator = new Orchestrator({ quiet: true, storageDir: RUNTIME, skipLoad: true });
  const config = {
    agents: [{ id: 'worker', role: 'implementation', modelLevel: 'level1', triggers: [] }],
  };

  const runLabel = mode === 'run1' ? 'RUN 1 (fresh library)' : 'RUN 2 (new process, same store)';
  console.log(`\n########## ${runLabel} ##########`);

  let clusterId = null;
  try {
    const result = await orchestrator.start(
      config,
      { text: 'Add a /health endpoint to the Express server' },
      { testMode: true, lyo: true }
    );
    clusterId = result.id;
    const cluster = orchestrator.getCluster(clusterId);
    const bus = cluster.messageBus;
    console.log('[run] cluster started:', clusterId);

    console.log('\n--- validator REJECTS (cycle 1) ---');
    bus.publish({ cluster_id: clusterId, ...REJECTION });

    const guidance = bus.queryGuidanceMailbox({ cluster_id: clusterId, target_agent_id: 'worker' });
    const last = guidance[guidance.length - 1];
    console.log('\n--- guidance delivered to worker ---');
    console.log(last ? last.content.text : '(none!)');
    console.log('\n--- guidance data.lessons ---');
    console.log(last?.content?.data?.lessons ?? null);

    const interventions = bus.query({ cluster_id: clusterId, topic: 'LYO_INTERVENTION' });
    console.log('\n--- LYO_INTERVENTION count:', interventions.length);

    console.log('\n--- validator ACCEPTS (cycle 2) ---');
    bus.publish({ cluster_id: clusterId, ...APPROVAL });

    const feedback = bus.query({ cluster_id: clusterId, topic: 'LYO_FEEDBACK' });
    console.log('--- LYO_FEEDBACK count:', feedback.length, '| last:', feedback[feedback.length - 1]?.content?.text);
  } finally {
    if (clusterId) {
      try {
        await orchestrator.stop(clusterId);
      } catch (e) {
        console.log('[run] stop warning:', e.message);
      }
    }
  }

  dumpStore();
  console.log('\n[store] persisted at:', STORE);
}

main().catch((e) => {
  console.error('DOGFOOD FAILED:', e);
  process.exit(1);
});
