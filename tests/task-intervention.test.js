import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { closeKernel } from '../src/ledger.ts';
import { FeedbackController } from '../src/lyo/control/feedback-controller.ts';
import { deriveTaskIntervention } from '../src/lyo/control/task-intervention.ts';
import { taskFixture, startTask } from './helpers/task-feedback.js';
import { runLyoJson } from './helpers/cli.js';
import { loadLessonsFromFiles } from '../src/lyo/storage/lesson-library.ts';

test('a fenced model proposal is grounded by replaying the failure, repair, and removal of the claimed repair', async () => {
  const f = taskFixture();
  try {
    const r = f.task('source'), loop = startTask(f, r);
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
    loop.finish('source', f.trace('source'));
    const result = await deriveTaskIntervention(loop.inspect('source'), { repoPath: r.cwd, model: 'fixture-reflector' }, async request => {
      assert.match(request.messages[1].content, /module.exports = 42/);
      assert.match(request.messages[1].content, /AssertionError/);
      return { content: '```json\n' + JSON.stringify({
        cue: 'The public module contract is implemented by an incorrect constant.',
        explanation: 'The verifier expected 42 but the module exported 0; the repair changes that export.',
        intervention: 'Check exported values against their public contract before changing callers.',
        prediction: 'Later constant-contract repairs preserve callers while fixing the value at its source.',
        falsifiedBy: 'The changed export does not control the independently verified result.',
        repair: { path: 'answer.cjs', before: 'module.exports = 0;', after: 'module.exports = 42;' },
      }) + '\n```', usage: { totalTokens: 30 } };
    });
    assert.equal(result.mechanism.supported, true);
    assert.deepEqual(result.mechanism.checks.map(c => c.accepted), [false, true, false, true]);
    assert.ok(result.mechanism.checks.every(c => c.regressionPassed));
    assert.equal(result.status, 'candidate');
    assert.equal(result.cost.totalTokens, 150);
    assert.equal(result.source.attemptId, 'source');
    assert.equal(result.source.receiptHash.length, 64);
    assert.equal(loop.inspect('source').receipt.feedback.sequence, 1, 'analysis cannot award task credit');
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('a derived intervention is retained, preregistered, and delivered verbatim in a later trial', async () => {
  const f = taskFixture();
  try {
    const r = f.task('derived-source'), loop = startTask(f, r);
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
    loop.finish('derived-source', f.trace('derived-source'));
    await assert.rejects(loop.derive('derived-source', { repoPath: r.cwd, model: 'malformed' }, async () => ({
      content: 'not JSON', usage: { totalTokens: 17 },
    })));
    const candidate = await loop.derive('derived-source', { repoPath: r.cwd, model: 'reflector' }, async () => ({
      content: JSON.stringify({ cue: 'A module constant violates its public contract.', explanation: 'The export changed from 0 to 42.',
        intervention: 'Correct the exported value at its definition; preserve its callers.', prediction: 'The contract passes without caller edits.',
        falsifiedBy: 'Removing the export change leaves the verifier passing.',
        repair: { path: 'answer.cjs', before: 'module.exports = 0;', after: 'module.exports = 42;' } }), usage: { totalTokens: 30 },
    }));
    assert.equal((await loop.derive('derived-source', { repoPath: r.cwd, model: 'reflector' }, () => { throw Error('must reuse'); })).id, candidate.id);
    let release;
    const pending = loop.derive('derived-source', { repoPath: r.cwd, model: 'pending' }, () => new Promise(resolve => { release = resolve; }));
    assert.throws(() => loop.trial(candidate.id), /finish every source analysis/);
    release({ content: 'not JSON', usage: { totalTokens: 0 } });
    await assert.rejects(pending);
    const command = args => runLyoJson(['task', ...args, '--db', f.db]);
    assert.equal(command(['derive', '--attempt-id', 'derived-source', '--repo', r.cwd, '--model', 'reflector']).intervention.id, candidate.id);
    const lessonPath = join(f.dir, 'candidate.md');
    command(['intervention', '--intervention-id', candidate.id, '--output', lessonPath]);
    const lesson = loadLessonsFromFiles([lessonPath])[0];
    assert.equal(lesson.status, 'candidate'); assert.equal(lesson.helpful, 0); assert.equal(lesson.harmful, 0);
    assert.match(lesson.content, /Correct the exported value/);
    const budget = { ...r.task.budget, max_tokens: 500 }, budgetPath = join(f.dir, 'trial-budget.json');
    writeFileSync(budgetPath, JSON.stringify(budget));
    const policy = command(['trial', '--intervention-id', candidate.id, '--budget', budgetPath]).policy;
    assert.equal(policy.kind, 'candidate-trial');
    assert.deepEqual(policy.evaluationBudget, budget);
    assert.throws(() => loop.trial(candidate.id, null), /budget/);
    assert.throws(() => loop.trial(candidate.id, { ...budget, max_tokens: 0 }), /max_tokens must be a positive/);
    assert.equal(policy.training.totalTokens, 167, 'source work is counted once and failed reflection is included');
    assert.equal(policy.training.wallTimeMs, loop.inspect('derived-source').receipt.measurement.wallTimeMs
      + loop.analyses('derived-source').reduce((sum, a) => sum + a.cost.analysisWallTimeMs, 0));
    const attempts = ['baseline', 'learned'].map(condition => {
      const next = f.task(`trial-${condition}`, { condition, split: 'selection', policyId: policy.id, initialAnswer: 1 });
      next.task.budget = budget;
      next.pairId = 'new-case'; next.task.task_id = 'new-case'; loop.register(next); return next;
    });
    const event = r => ({ cwd: r.cwd, session_id: r.attemptId, prompt: r.task.prompt });
    assert.throws(() => loop.prompt('codex', event(attempts[1])), /register.*comparison/i);
    loop.registerComparison({ id: 'specific-trial', policyId: policy.id, maxTotalTokenRatio: 1,
      pairs: [{ baselineAttemptId: 'trial-baseline', learnedAttemptId: 'trial-learned' }] });
    assert.deepEqual(loop.prompt('codex', event(attempts[0])), {});
    assert.equal(loop.prompt('codex', event(attempts[1])).additionalContext, candidate.proposal.intervention);
    for (const next of attempts) {
      writeFileSync(join(next.cwd, 'answer.cjs'), 'module.exports = 42;');
      loop.finish(next.attemptId, f.trace(next.attemptId));
    }
    assert.equal(loop.inspect('trial-learned').decision.algorithm, 'fixed-action@1');
    assert.equal(loop.report(policy.id, 'specific-trial').decision, 'inconclusive');
    assert.equal(loop.intervention(candidate.id).status, 'candidate', 'a passing task is not proof that the lesson helped');
    assert.equal(loop.intervention(candidate.id).evaluations[0].decision, 'inconclusive');
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('failed reflection stays inspectable and cannot be silently retried or omitted from cost accounting', async () => {
  const f = taskFixture();
  try {
    const r = f.task('analysis-failed'), loop = startTask(f, r);
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
    loop.finish('analysis-failed', f.trace('analysis-failed'));
    const options = { repoPath: r.cwd, model: 'unavailable' };
    await assert.rejects(loop.derive('analysis-failed', options, async () => { throw Error('provider unavailable'); }), /unavailable/);
    const analyses = runLyoJson(['task', 'analyses', '--attempt-id', 'analysis-failed', '--db', f.db]).analyses;
    assert.equal(analyses[0].status, 'failed');
    assert.equal(analyses[0].cost.reflectionTokens, null);
    await assert.rejects(loop.derive('analysis-failed', options, () => { throw Error('must not retry'); }), /analysis failed/);
    await assert.rejects(loop.derive('analysis-failed', { ...options, model: 'malformed' }, async () => ({
      content: 'not JSON', usage: { totalTokens: 17 },
    })));
    const malformed = loop.analyses('analysis-failed')[1];
    assert.equal(malformed.generator.response, 'not JSON');
    assert.equal(malformed.cost.reflectionTokens, 17, 'a paid but unusable response must retain its measured cost');
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('an explicit candidate trial records a fixed action without inventing training evidence', () => {
  const f = taskFixture();
  try {
    const controller = new FeedbackController(f.kernel, { domain: 'test', objective: 'acceptance', evaluator: 'verifier',
      stateSchema: 'test', actions: ['no-guidance', 'specific-lesson'], baselineAction: 'no-guidance' });
    const request = { episodeId: 'trial', state: {}, observationRef: 'registered-trial', mode: 'evaluate', revision: 0,
      fixedAction: 'specific-lesson' };
    const decision = controller.decide(request);
    assert.equal(decision.action, 'specific-lesson');
    assert.equal(decision.algorithm, 'fixed-action@1');
    assert.ok(decision.estimates.every(e => e.count === 0 && e.mean === null));
    assert.deepEqual(controller.decide(request), decision);
    assert.throws(() => controller.decide({ ...request, episodeId: 'wrong-mode', mode: 'explore' }), /fixed action.*evaluat/i);
    assert.throws(() => controller.decide({ ...request, episodeId: 'unknown-action', fixedAction: 'unregistered' }), /fixed action/i);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('a failed analysis can recheck its retained response without another model call or duplicate token charge', async () => {
  const f = taskFixture();
  try {
    const r = f.task('recheck'), loop = startTask(f, r);
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
    loop.finish(r.attemptId, f.trace(r.attemptId));
    const verifier = r.verifierFiles[0], original = readFileSync(verifier, 'utf8');
    const options = { repoPath: r.cwd, model: 'saved-reflector' };
    await assert.rejects(loop.derive(r.attemptId, options, async () => {
      writeFileSync(verifier, original + '// changed during analysis\n');
      return { content: JSON.stringify({ cue: 'A public constant is wrong.', explanation: 'The export is 0 instead of 42.',
        intervention: 'Correct the value at its source.', prediction: 'Consumers receive the specified value.',
        falsifiedBy: 'Restoring the original constant does not reproduce the failure.',
        repair: { path: 'answer.cjs', before: 'module.exports = 0;', after: 'module.exports = 42;' } }), usage: { totalTokens: 30 } };
    }), /verifier changed/);
    writeFileSync(verifier, original);
    const failed = loop.analyses(r.attemptId)[0];
    const recheck = { ...options, reuseAnalysisId: failed.analysisId };
    const candidate = await loop.derive(r.attemptId, recheck, () => { throw Error('must not call the model'); });
    assert.equal(candidate.mechanism.supported, true);
    assert.equal(candidate.generator.response, failed.generator.response);
    assert.equal(candidate.generator.reusedFromAnalysisId, failed.analysisId);
    assert.equal(candidate.cost.reflectionTokens, 0);
    assert.equal(loop.trial(candidate.id).training.totalTokens, 150);
    assert.deepEqual(loop.analyses(r.attemptId)[0], failed, 'the failed record is preserved');
    const reused = runLyoJson(['task', 'derive', '--attempt-id', r.attemptId, '--repo', r.cwd, '--model', options.model,
      '--reuse-analysis', failed.analysisId, '--db', f.db]);
    assert.equal(reused.intervention.id, candidate.id);
    await assert.rejects(loop.derive(r.attemptId, { ...recheck, model: 'different' }), /same source and model/);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('causing a different failure cannot validate the proposed cause of the original failure', async () => {
  const f = taskFixture();
  try {
    const r = f.task('wrong-cause');
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 0; // unused example: module.exports = 99;');
    execFileSync('git', ['commit', '-am', 'retain an unused example'], { cwd: r.cwd, stdio: 'ignore' });
    r.task.repo_ref.ref = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: r.cwd, encoding: 'utf8' }).trim();
    const loop = startTask(f, r);
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
    loop.finish('wrong-cause', f.trace('wrong-cause'));
    const candidate = await loop.derive('wrong-cause', { repoPath: r.cwd, model: 'wrong-reflector' }, async () => ({
      content: JSON.stringify({ cue: 'Module value', explanation: 'The old value was 99.', intervention: 'Correct module values.',
        prediction: 'The original failure returns when this edit is removed.', falsifiedBy: 'A different failure appears.',
        repair: { path: 'answer.cjs', before: 'module.exports = 99;', after: 'module.exports = 42;' } }), usage: { totalTokens: 30 },
    }));
    assert.equal(candidate.mechanism.checks[2].accepted, false);
    assert.equal(candidate.mechanism.supported, false);
    assert.throws(() => loop.trial(candidate.id), /mechanism/);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});
