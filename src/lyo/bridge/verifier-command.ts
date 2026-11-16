import { classifyCommand } from '../domain/behavior/command-classifier.ts';
import { summarizeCommand } from '../domain/behavior/commands.ts';

export type VerifierClass = 'test' | 'build' | 'lint';

/**
 * The verifier inside a real agent shell line, or null when the line's exit status
 * cannot be attributed to that verifier.
 *
 * Agents rarely run a bare `npm test`; they run `cd repo && uv run pytest x 2>&1`.
 * The exit status of `a && b` fails if either fails, so leading `cd` segments can be
 * dropped. The status of `a | b`, `a; b`, `a || b` or a backgrounded `a &` belongs to
 * a different command (or none), so those lines are rejected rather than guessed:
 * `pytest | tail` exits 0 when the tests fail. Command substitution and multi-line
 * scripts are rejected for the same reason. Rejection only loses data.
 */
export function verifierCommand(commandText: string): { command: string; classification: VerifierClass } | null {
  const withoutRedirects = commandText.replace(/\s\d*>&\d+/g, ' ').replace(/\s&>>?\s*\S+/g, ' ');
  const segments = splitAndChain(withoutRedirects);
  if (!segments) return null;
  const verifiers = segments.filter(segment => !/^cd(\s|$)/.test(segment)).map(stripWrappers);
  if (verifiers.length === 0) return null;
  const classes = verifiers.map(segment => classifyCommand(segment.split(/\s+/)[0], segment));
  if (!classes.every((c): c is VerifierClass => c === 'test' || c === 'build' || c === 'lint')) return null;
  return { command: summarizeCommand(verifiers.join(' && ')), classification: classes.at(-1)! };
}

/** Split on unquoted `&&`; null if any other unquoted control operator appears. */
function splitAndChain(text: string): string[] | null {
  const segments: string[] = [];
  let current = '', quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (quote) { if (ch === quote) quote = null; current += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '\n' || ch === ';' || ch === '`' || (ch === '$' && next === '(')) return null;
    if (ch === '|') return null; // pipe or `||`
    if (ch === '&') {
      if (next !== '&') return null; // background
      segments.push(current.trim()); current = ''; i += 1; continue;
    }
    current += ch;
  }
  if (quote) return null;
  segments.push(current.trim());
  return segments.every(Boolean) ? segments : null;
}

function stripWrappers(segment: string): string {
  let s = segment.replace(/(?:\s+\d*>>?\s*\S+)+$/, '').trim();
  for (;;) {
    const next = s
      .replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, '')
      .replace(/^(?:uv|poetry|pipenv|pdm|hatch)\s+run\s+/, '')
      .replace(/^python3?\s+-m\s+/, '')
      .replace(/^timeout\s+\d+[smh]?\s+/, '');
    if (next === s) return s;
    s = next;
  }
}
