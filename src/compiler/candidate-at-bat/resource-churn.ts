import type { NormalizedAction } from '../syntax.ts';

export function writeCountsByResource(actions: NormalizedAction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const action of actions) {
    for (const resource of action.resources.written) {
      const key = resource.ref;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return sortRecord(counts);
}

export function resourceTouchCounts(actions: NormalizedAction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const action of actions) {
    for (const resource of [...action.resources.read, ...action.resources.written]) {
      const key = resource.ref;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return sortRecord(counts);
}

export function repeatedEditHotspots(actions: NormalizedAction[]): string[] {
  return Object.entries(writeCountsByResource(actions))
    .filter(([, count]) => count > 1)
    .map(([resource]) => resource);
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}
