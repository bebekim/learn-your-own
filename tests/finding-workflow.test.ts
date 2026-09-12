import assert from 'node:assert/strict';
import test from 'node:test';
import { completeFindingBoundary } from '../src/lyo/application/finding-workflow.ts';

test('capture finishes before evaluation, and a failed new measurement still consumes the boundary allowance', () => {
  const events: string[] = [];
  completeFindingBoundary({
    captureAll() { events.push('capture:first', 'capture:second', 'capture:retained'); return ['first', 'second', 'retained', 'unfinished']; },
    status(id) { return { hasAfter: id !== 'unfinished', hasMeasurement: id === 'retained' }; },
    measure(id) {
      events.push(`measure:${id}`);
      if (id === 'first') throw new Error('check failed');
      return { id: `evidence:${id}` };
    },
    assess(ref) { events.push(`assess:${ref}`); },
    report(error) { events.push(`error:${(error as Error).message}`); },
  });
  assert.deepEqual(events, ['capture:first', 'capture:second', 'capture:retained',
    'measure:first', 'error:check failed', 'measure:retained', 'assess:evidence:retained']);
});
