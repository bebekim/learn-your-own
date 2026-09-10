// Diagnostic of the proposed D-3 -> D-2 -> D-1 contract, not a regression suite.
// Exit 1 means open contract gaps reproduced. Uses temporary stores only.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LessonStore } from '../../src/lyo/storage/lesson-store.ts';
import { emitSessionLessons, renderSessionLessons } from '../../src/lyo/selection/session-hook.ts';
import { inspectFinding, recordFindingFeedback, reviseFinding } from '../../src/lyo/selection/session-findings.ts';

function probe(id, required, inspect) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lyo-link-audit-')));
  const previous = process.env.ZEROSHOT_LYO_STORE_PATH;
  process.env.ZEROSHOT_LYO_STORE_PATH = join(root, 'lessons.db');
  const store = new LessonStore(process.env.ZEROSHOT_LYO_STORE_PATH);
  const findingId = 'finding:audit';
  store.recordTrace({ trace_id: findingId, kind: 'behavior', summary: 'Synthetic audit fixture', payload: {
    source: 'session-finding@1', gitCommonDir: join(root, 'origin.git'), activity: 'transfer-review',
    observation: 'A synthetic observation; no real learning evidence.', evidenceRef: 'fixture:source',
    intervention: 'Check target semantics before transferring a repair.',
  } });
  const deliver = (name, task = '') => {
    const sessionId = `${root}:${name}`;
    emitSessionLessons({ cwd: root, session_id: sessionId, prompt: `[lyo:transfer-review] ${task}` }, () => {});
    return `session-delivery:${sessionId}`;
  };
  const review = (id, deliveryId, changes = {}) => recordFindingFeedback(store, {
    id, findingId, deliveryId, applicability: 'applicable', adherence: 'followed', outcome: 'supported',
    verifier: 'synthetic reviewer', evidenceRef: 'fixture:one-result', rationale: 'Synthetic audit judgment.', ...changes,
  });
  try {
    return { id, required, ...inspect({ store, findingId, root, deliver, review }) };
  } finally {
    store.close();
    if (previous === undefined) delete process.env.ZEROSHOT_LYO_STORE_PATH;
    else process.env.ZEROSHOT_LYO_STORE_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  }
}

const probes = [
  probe('P1', 'Unresolved evidence cannot establish checked support.', f => {
    f.review('missing', f.deliver('first'), { evidenceRef: 'does-not-exist:anywhere' });
    const validity = inspectFinding(f.store, f.findingId).validity;
    return { gapReproduced: validity === 'supported', observed: { validity, evidenceResolved: false } };
  }),
  probe('P2', 'Task-local inapplicability cannot exclude another task merely sharing repository/activity.', f => {
    f.review('misplaced', f.deliver('formatting', 'Only formatting is being reviewed.'), {
      applicability: 'inapplicable', adherence: 'unknown', outcome: 'unknown',
    });
    const output = renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review] Transfer a repair into a different parser.' });
    return { gapReproduced: output === null, observed: { differentTaskSuppressed: output === null } };
  }),
  probe('P3', 'Two delivery reviews citing one result must not imply two independent supporting observations.', f => {
    f.review('first-review', f.deliver('first'));
    f.review('second-review', f.deliver('second'));
    const supporting = inspectFinding(f.store, f.findingId).supporting;
    return { gapReproduced: supporting === 2, observed: { supporting, distinctEvidenceRefs: 1 } };
  }),
  probe('P4', 'Correcting a revision premise must flag dependent wording for reassessment.', f => {
    const delivery = f.deliver('first');
    f.review('premise', delivery, { outcome: 'contradicted' });
    reviseFinding(f.store, { id: 'replacement', findingId: f.findingId,
      previousVersion: inspectFinding(f.store, f.findingId).version, intervention: 'Replacement based on the disputed premise.',
      feedbackIds: ['premise'], author: 'synthetic reviewer', rationale: 'Synthetic revision from one premise.',
    });
    f.review('corrected', delivery, { supersedes: 'premise', applicability: 'unknown', adherence: 'unknown', outcome: 'unknown' });
    const state = inspectFinding(f.store, f.findingId);
    const output = renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review]' });
    const stillDelivered = output?.includes('Replacement based on the disputed premise.') ?? false;
    return { gapReproduced: stillDelivered && state.validity === 'unvalidated', observed: {
      stillDelivered, validity: state.validity, citedReview: state.revisions[0].feedbackIds[0],
      currentReview: state.currentFeedback[0].id,
    } };
  }),
];
console.log(JSON.stringify({ auditedImplementation: '70a5e9e', probes }, null, 2));
process.exitCode = probes.some(probe => probe.gapReproduced) ? 1 : 0;
