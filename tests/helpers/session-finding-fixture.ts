import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LessonStore } from '../../src/lyo/storage/lesson-store.ts';
import { emitSessionLessons } from '../../src/lyo/selection/session-hook.ts';
import { registerFindingOpportunity, measureFindingOpportunity } from '../../src/lyo/interface/session-finding-evidence.ts';
import { reviewFindingSemantics } from '../../src/lyo/interface/session-finding-semantics.ts';

export function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'finding-feedback-')));
  const storePath = join(root, 'lessons.db');
  const previous = process.env.LYO_STORE_PATH;
  process.env.LYO_STORE_PATH = storePath;
  const store = new LessonStore(storePath);
  const findingId = 'finding:transfer';
  const source = store.recordTrace({ trace_id: findingId, kind: 'behavior', summary: 'Transfer observation',
    payload: { source: 'session-finding@1', gitCommonDir: join(root, 'origin.git'), activity: 'transfer-review',
      observation: 'A different whitespace contract exposed a missed case.', evidenceRef: 'report:source',
      intervention: 'Check the target whitespace contract before reusing a repair.' } });
  const deliver = (cwd = root, session = `${root}:first`) => {
    let output = '';
    emitSessionLessons({ cwd, session_id: session, prompt: '[lyo:transfer-review]' }, text => { output += text; });
    return { output, deliveryId: `session-delivery:${session}` };
  };
  let sequence = 0;
  const review = (id: string, options: { verdict?: 'accepted' | 'disputed'; claimKind?: 'deterministic' | 'improvement'; supersedes?: string } = {}) => {
    const registered = JSON.parse(store.getTrace(`finding-opportunity:${id}`)!.payload_json!).content;
    const basis = { rationale: 'Fixture oracle reads the named boolean from the retained state; no real benefit is established.',
      verifierPaths: registered.input.verifierFiles };
    return reviewFindingSemantics(store, { id: `${id}-semantics-${options.supersedes ?? 'first'}`, opportunityId: id,
      reviewer: { id: 'fixture-reviewer', kind: 'agent' }, verdict: 'accepted', claimKind: 'deterministic',
      applicability: basis, adherence: basis, prediction: basis, limitations: 'Synthetic state transition only.', ...options });
  };
  const prepare = (deliveryId: string, values = { applicable: true as boolean | null, followed: true as boolean | null, predicted: true as boolean | null }, reviewed = true, claimKind: 'deterministic' | 'improvement' = 'deterministic') => {
    const id = `application-${++sequence}`, source = join(root, `${id}.json`), verifier = join(root, `${id}.mjs`);
    const cwd = JSON.parse(store.getTrace(deliveryId)!.payload_json!).cwd;
    writeFileSync(source, JSON.stringify({ ...values, followed: false, predicted: false }));
    writeFileSync(verifier, "import fs from 'node:fs'; console.log(JSON.stringify({satisfied: JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))[process.argv[3]]}));");
    const command = (key: string) => `'${process.execPath}' '${verifier}' '${source}' ${key}`;
    const input = { id, findingId, deliveryId, taskId: `task-${sequence}`, cwd,
      claim: { kind: claimKind, conditions: 'The declared target contract applies.',
        action: JSON.parse(store.getTrace(deliveryId)!.payload_json!).findings.find((row: { id: string }) => row.id === findingId).intervention,
        prediction: 'The check reports the expected result.', falsifiedBy: 'The check explicitly reports false.' },
      checks: { applicability: command('applicable'), adherence: command('followed'), prediction: command('predicted') },
      verifierFiles: [verifier], sourceFiles: [source], evaluator: { id: 'fixture-contract', version: '1' } };
    registerFindingOpportunity(store, input);
    if (reviewed) review(id);
    return { id, source, verifier, input, finish() {
      writeFileSync(source, JSON.stringify(values));
      return measureFindingOpportunity(store, id);
    } };
  };
  const evidenceFor = (deliveryId: string, values?: Parameters<typeof prepare>[1]) => prepare(deliveryId, values).finish();
  return { root, store, storePath, findingId, source, deliver, prepare, evidenceFor, review,
    feedback: { id: 'review-1', findingId, applicability: 'applicable', adherence: 'followed', outcome: 'supported',
      verifier: 'independent contract check', evidenceRef: 'check:target-whitespace',
      rationale: 'The target-specific check caught the mismatch before the repair was reused.' },
    close() { store.close(); if (previous === undefined) delete process.env.LYO_STORE_PATH;
      else process.env.LYO_STORE_PATH = previous; rmSync(root, { recursive: true, force: true }); } };
}
