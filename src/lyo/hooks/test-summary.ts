/**
 * Pass/fail counts from a test runner's final summary line, so a result can be judged
 * after its output is redacted. Only counts are kept, never output text.
 *
 * This exists because agents pipe test output (`pytest 2>&1 | tail -20`), and with
 * `pipefail` off the pipeline's exit status is `tail`'s. The summary line, which the
 * agent keeps on purpose, is then the only record of the result. Only whole-line
 * summary formats are recognised; when several appear, the last one wins.
 */
export interface TestSummary {
  runner: 'pytest' | 'node-test' | 'jest' | 'vitest';
  passed: number;
  failed: number;
}

const PYTEST_LINE = /^=*\s*((?:\d+ (?:failed|passed|skipped|deselected|xfailed|xpassed|errors?|warnings?|rerun)(?:, )?)+) in \d+(?:\.\d+)?s(?: \([^)]*\))?\s*=*\s*$/gm;
const NODE_LINE = /^(?:ℹ|#) (pass|fail) (\d+)\s*$/gm;
const JEST_LINE = /^Tests:\s+((?:\d+ (?:failed|passed|skipped|todo|pending)(?:, )?)+)(?:, )?\d+ total\s*$/gm;
const VITEST_LINE = /^\s*Tests\s+((?:\d+ (?:failed|passed|skipped|todo)(?: \| )?)+)\s*\(\d+\)\s*$/gm;

function last<T>(matches: IterableIterator<T>): T | undefined {
  let found: T | undefined;
  for (const match of matches) found = match;
  return found;
}

function count(text: string, label: RegExp): number {
  let total = 0;
  for (const match of text.matchAll(new RegExp(`(\\d+) ${label.source}`, 'g'))) total += Number(match[1]);
  return total;
}

export function extractTestSummary(text: string): TestSummary | null {
  const candidates: Array<{ index: number; summary: TestSummary }> = [];
  const pytest = last(text.matchAll(PYTEST_LINE));
  if (pytest) candidates.push({ index: pytest.index!, summary: { runner: 'pytest',
    passed: count(pytest[1], /passed/), failed: count(pytest[1], /(?:failed|errors?)\b/) } });
  const jest = last(text.matchAll(JEST_LINE));
  if (jest) candidates.push({ index: jest.index!, summary: { runner: 'jest',
    passed: count(jest[1], /passed/), failed: count(jest[1], /failed/) } });
  const vitest = last(text.matchAll(VITEST_LINE));
  if (vitest) candidates.push({ index: vitest.index!, summary: { runner: 'vitest',
    passed: count(vitest[1], /passed/), failed: count(vitest[1], /failed/) } });
  const node = nodeSummary(text);
  if (node) candidates.push(node);
  const chosen = candidates.sort((a, b) => a.index - b.index).at(-1)?.summary;
  return chosen && chosen.passed + chosen.failed > 0 ? chosen : null;
}

/** node --test prints `ℹ pass N` and `ℹ fail N` (TAP: `# pass N`); both are required. */
function nodeSummary(text: string): { index: number; summary: TestSummary } | null {
  let pass: RegExpMatchArray | undefined, fail: RegExpMatchArray | undefined;
  for (const match of text.matchAll(NODE_LINE)) { if (match[1] === 'pass') pass = match; else fail = match; }
  if (!pass || !fail) return null;
  return { index: Math.max(pass.index!, fail.index!),
    summary: { runner: 'node-test', passed: Number(pass[2]), failed: Number(fail[2]) } };
}

/** `{ test_summary }` for a redacted digest, or nothing when no summary line is found. */
export function testSummaryField(text: string): { test_summary?: TestSummary } {
  const summary = text ? extractTestSummary(text) : null;
  return summary ? { test_summary: summary } : {};
}

/** All string leaves of a hook value, joined, for summary extraction only. */
export function hookValueText(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value;
  if (depth > 4 || !value || typeof value !== 'object') return '';
  return Object.values(value as Record<string, unknown>).map(child => hookValueText(child, depth + 1)).filter(Boolean).join('\n');
}

/** Key names and value types of a hook value, never its contents. */
export function hookValueShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return depth > 2 ? 'array' : value.length ? [hookValueShape(value[0], depth + 1)] : [];
  if (value && typeof value === 'object') {
    if (depth > 2) return 'object';
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, hookValueShape(v, depth + 1)]));
  }
  return value === null ? 'null' : typeof value;
}
