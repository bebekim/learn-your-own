import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireWorkerLock, claimNextJob, enqueueDecisionJob, failJob, lockHolder, queueCounts, recoverClaimed } from '../src/lyo/decisions/queue.ts';

const job = (jobId: string, createdAt: string) => ({ jobId, sessionId: 's', runtime: 'claude', cwd: '/tmp', model: 'm', createdAt,
  trialHashes: ['t'], trigger: { eventName: 'PostToolUseFailure', toolUseId: jobId, inputHash: 'i', responseHash: 'r' },
  state: 'Command:\nx', inputFormat: 'command-output@1' });

function withQueue(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-queue-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a duplicate delivery is one job, a full queue drops, and job files are owner-only', () => withQueue(dir => {
  assert.equal(enqueueDecisionJob(dir, job('a', '2026-01-01T00:00:01Z'), 2), 'queued');
  assert.equal(enqueueDecisionJob(dir, job('a', '2026-01-01T00:00:01Z'), 2), 'duplicate');
  assert.equal(enqueueDecisionJob(dir, job('b', '2026-01-01T00:00:00Z'), 2), 'queued');
  assert.equal(enqueueDecisionJob(dir, job('c', '2026-01-01T00:00:02Z'), 2), 'dropped');
  assert.equal(statSync(join(dir, 'incoming', 'a.json')).mode & 0o777, 0o600);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.deepEqual(queueCounts(dir), { incoming: 2, claimed: 0, dead: 0 });
}));

test('claims are oldest first and two claimers never take the same job', () => withQueue(dir => {
  enqueueDecisionJob(dir, job('late', '2026-01-01T00:00:09Z'), 10);
  enqueueDecisionJob(dir, job('early', '2026-01-01T00:00:01Z'), 10);
  const first = claimNextJob(dir), second = claimNextJob(dir), third = claimNextJob(dir);
  assert.equal(first?.job.jobId, 'early');
  assert.equal(second?.job.jobId, 'late');
  assert.equal(third, null);
  assert.equal(enqueueDecisionJob(dir, job('early', '2026-01-01T00:00:01Z'), 10), 'duplicate', 'a claimed job is not re-enqueued');
}));

test('an interrupted job is retried, then parked in dead/ after three attempts', () => withQueue(dir => {
  enqueueDecisionJob(dir, job('x', '2026-01-01T00:00:01Z'), 10);
  for (const expected of ['requeued', 'requeued', 'dead']) {
    const claimed = claimNextJob(dir)!;
    assert.equal(failJob(dir, claimed.path), expected);
  }
  assert.deepEqual(queueCounts(dir), { incoming: 0, claimed: 0, dead: 1 });
  enqueueDecisionJob(dir, job('y', '2026-01-01T00:00:01Z'), 10);
  claimNextJob(dir); // a worker died holding it
  assert.deepEqual(recoverClaimed(dir), ['requeued']);
  assert.equal(claimNextJob(dir)?.job.attempts, 1);
}));

test('one worker holds the lock; a dead holder is replaced', () => withQueue(dir => {
  const release = acquireWorkerLock(dir)!;
  assert.ok(release);
  assert.equal(acquireWorkerLock(dir), null, 'a live holder blocks a second worker');
  assert.equal(lockHolder(dir)?.pid, process.pid);
  release();
  assert.equal(lockHolder(dir), null);
  writeFileSync(join(dir, 'worker.lock'), JSON.stringify({ pid: 2 ** 22 + 12345, startedAt: 'then' }));
  const again = acquireWorkerLock(dir);
  assert.ok(again, 'a lock whose process is gone is taken over');
  again!();
  assert.deepEqual(readdirSync(dir).sort(), ['claimed', 'dead', 'incoming']);
}));
