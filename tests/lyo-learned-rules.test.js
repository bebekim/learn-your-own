import assert from 'node:assert/strict';
import test from 'node:test';

import { LearnedRuleStore } from '../src/lyo/storage/learned-rules.ts';

test('learned verifier rules persist rows and append deltas', () => {
  withStore((store) => {
    const rule = store.createVerifierRule({
      scope_kind: 'repository',
      scope_value: '/repo',
      path_glob: 'src/billing/**',
      command: 'uv run pytest tests/test_billing.py',
      run_id: 'proposal-run',
    });

    assert.equal(rule.kind, 'verifier_for_path');
    assert.equal(rule.status, 'candidate');
    assert.equal(store.getRule(rule.rule_id)?.rule_id, rule.rule_id);
    assert.deepEqual(
      store.getRuleDeltas(rule.rule_id).map((delta) => delta.delta_type),
      ['CREATE']
    );
  });
});

test('active verifier rules emit gates for matching touched paths only', () => {
  withStore((store) => {
    const rule = store.createVerifierRule({
      scope_kind: 'repository',
      scope_value: '/repo',
      path_glob: 'src/billing/**',
      command: 'uv run pytest tests/test_billing.py',
      status: 'active',
    });

    const miss = store.applyVerifierRules({
      run_id: 'miss-run',
      scope_kind: 'repository',
      scope_value: '/repo',
      touched_paths: ['src/auth/login.py'],
    });
    assert.deepEqual(miss, []);

    const hit = store.applyVerifierRules({
      run_id: 'hit-run',
      scope_kind: 'repository',
      scope_value: '/repo',
      touched_paths: ['src/billing/discount.py', 'README.md'],
      trigger_ref: 'edit-1',
    });

    assert.equal(hit.length, 1);
    assert.equal(hit[0].ruleId, rule.rule_id);
    assert.equal(hit[0].command, 'uv run pytest tests/test_billing.py');
    assert.deepEqual(hit[0].matchedPaths, ['src/billing/discount.py']);

    const applications = store.getRuleApplications(rule.rule_id);
    assert.equal(applications.length, 1);
    assert.equal(applications[0].run_id, 'hit-run');
    assert.match(applications[0].emitted_fact_json, /test_billing/);
  });
});

test('learned verifier rule outcomes update counters only once per application', () => {
  withStore((store) => {
    const rule = store.createVerifierRule({
      scope_kind: 'repository',
      scope_value: '/repo',
      path_glob: 'src/lyo/**',
      command: 'npm test',
      status: 'active',
    });
    store.applyVerifierRules({
      run_id: 'run-1',
      scope_kind: 'repository',
      scope_value: '/repo',
      touched_paths: ['src/lyo/lesson-store.ts'],
    });

    const first = store.recordRuleOutcome({ run_id: 'run-1', outcome: 'helpful' });
    const second = store.recordRuleOutcome({ run_id: 'run-1', outcome: 'harmful' });

    assert.equal(first.updated, 1);
    assert.equal(second.updated, 0);
    assert.equal(store.getRule(rule.rule_id)?.helpful_count, 1);
    assert.equal(store.getRule(rule.rule_id)?.harmful_count, 0);
    assert.deepEqual(
      store.getRuleDeltas(rule.rule_id).map((delta) => delta.delta_type),
      ['CREATE', 'MARK_HELPFUL']
    );
  });
});

test('quarantined verifier rules do not inject gates', () => {
  withStore((store) => {
    const rule = store.createVerifierRule({
      scope_kind: 'repository',
      scope_value: '/repo',
      path_glob: 'src/lyo/**',
      command: 'npm test',
      status: 'active',
    });
    store.setRuleStatus(rule.rule_id, 'quarantined');

    const gates = store.applyVerifierRules({
      run_id: 'after-quarantine',
      scope_kind: 'repository',
      scope_value: '/repo',
      touched_paths: ['src/lyo/lesson-store.ts'],
    });

    assert.deepEqual(gates, []);
    assert.deepEqual(
      store.getRuleDeltas(rule.rule_id).map((delta) => delta.delta_type),
      ['CREATE', 'QUARANTINE']
    );
  });
});

function withStore(work) {
  const store = new LearnedRuleStore(':memory:');
  try {
    return work(store);
  } finally {
    store.close();
  }
}
