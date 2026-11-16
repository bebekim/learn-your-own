import { classifyCommand } from '../domain/behavior/command-classifier.ts';
import { summarizeCommand } from '../domain/behavior/commands.ts';

export type VerifierClass = 'test' | 'build' | 'lint';

export interface Verifier {
  command: string;
  classification: VerifierClass;
  /** The verifier's output passes through filters; its exit status is not the line's. */
  piped: boolean;
}

const FILTER_STAGE = /^(?:tail|head|grep|egrep|tee|cat)(?:\s|$)/;

/**
 * The verifier inside a real agent shell line, or null when the line cannot be
 * attributed to one.
 *
 * Agents rarely run a bare `npm test`; they run `cd repo && uv run pytest x 2>&1 | tail`.
 * The status of `a && b` fails if either fails, so leading `cd` segments are dropped.
 * A final pipeline is accepted only when every stage after the verifier is a
 * pass-through filter, and is marked `piped`: with `pipefail` off its exit status is
 * the filter's, so callers must judge it from the runner's summary line instead.
 * `a; b`, `a || b`, a backgrounded `a &`, command substitution and multi-line
 * scripts are rejected. Rejection only loses data.
 */
export function verifierCommand(commandText: string): Verifier | null {
  const withoutRedirects = commandText.replace(/\s\d*>&\d+/g, ' ').replace(/\s&>>?\s*\S+/g, ' ');
  const chain = parseChain(withoutRedirects);
  if (!chain || chain.slice(0, -1).some(stages => stages.length > 1)) return null;
  const [verifierStage, ...filters] = chain.at(-1)!;
  if (!filters.every(stage => FILTER_STAGE.test(stage))) return null;
  const segments = [...chain.slice(0, -1).map(stages => stages[0]), verifierStage];
  const verifiers = segments.filter(segment => !/^cd(\s|$)/.test(segment)).map(stripWrappers);
  if (verifiers.length === 0) return null;
  const classes = verifiers.map(segment => classifyCommand(segment.split(/\s+/)[0], segment));
  if (!classes.every((c): c is VerifierClass => c === 'test' || c === 'build' || c === 'lint')) return null;
  return { command: summarizeCommand(verifiers.join(' && ')), classification: classes.at(-1)!, piped: filters.length > 0 };
}

/**
 * Unquoted `&&` segments, each split into `|` stages. Null if any other unquoted
 * control operator appears.
 */
function parseChain(text: string): string[][] | null {
  const chain: string[][] = [];
  let stages: string[] = [], current = '', quote: string | null = null;
  const endStage = () => { stages.push(current.trim()); current = ''; };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (quote) { if (ch === quote) quote = null; current += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (isRejectedOperator(ch, next)) return null;
    if (ch === '|') { endStage(); continue; }
    if (ch === '&') { endStage(); chain.push(stages); stages = []; i += 1; continue; }
    current += ch;
  }
  if (quote) return null;
  endStage(); chain.push(stages);
  return chain.every(s => s.every(Boolean)) ? chain : null;
}

function isRejectedOperator(ch: string, next: string | undefined): boolean {
  if (ch === '\n' || ch === ';' || ch === '`') return true;
  if (ch === '$' && next === '(') return true;
  if (ch === '|' && next === '|') return true; // `||` masks the verifier's failure
  return ch === '&' && next !== '&'; // background
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
