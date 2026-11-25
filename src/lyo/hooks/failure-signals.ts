/**
 * Privacy-preserving labels for a failed tool call, derived from its raw error text
 * before that text is replaced by a digest. Both labels come from closed vocabularies,
 * so no free text from the error is retained.
 *
 * `failure_kind` says whether the call executed at all. A denial or a harness rejection
 * is not evidence about the command: it never ran. `error_class` names the most specific
 * recognisable cause of an executed failure. Both are proxies read from host-formatted
 * text; an unrecognised format yields 'unknown', never a guess.
 */
export const FAILURE_KINDS = [
  'user_denied', // the user declined the call
  'policy_denied', // a permission rule or classifier declined it
  'harness_blocked', // the host refused the call shape (e.g. a blocked sleep)
  'harness_rejected', // the host rejected the call before execution (validation, preconditions)
  'tool_unavailable', // the tool or MCP server was not reachable
  'interrupted', // the call was interrupted
  'exit_nonzero', // the command ran and exited non-zero
  'unknown',
] as const;
export type FailureKind = typeof FAILURE_KINDS[number];

/** Kinds where the call never executed because something declined it. */
export const DENIAL_KINDS: ReadonlySet<FailureKind> = new Set(['user_denied', 'policy_denied', 'harness_blocked']);
/** Kinds where the call never executed for another reason; the command outcome is unknown. */
export const NOT_EXECUTED_KINDS: ReadonlySet<FailureKind> = new Set(['harness_rejected', 'tool_unavailable']);

const ERROR_CLASSES = [
  // Python
  'JSONDecodeError', 'KeyError', 'TypeError', 'AttributeError', 'ValueError', 'IndexError', 'NameError',
  'SyntaxError', 'IndentationError', 'ModuleNotFoundError', 'ImportError', 'FileNotFoundError',
  'PermissionError', 'AssertionError', 'RuntimeError', 'ZeroDivisionError', 'UnicodeDecodeError',
  'UnicodeEncodeError', 'TimeoutError', 'ConnectionError', 'OSError', 'RecursionError', 'StopIteration',
  'NotImplementedError', 'LookupError', 'subprocess.CalledProcessError',
  // JavaScript
  'ReferenceError', 'RangeError',
] as const;
export type ErrorClass = typeof ERROR_CLASSES[number]
  | 'command_not_found' | 'no_such_file' | 'os_permission' | 'cli_usage' | 'auth' | 'not_found' | 'timeout' | 'network';

const KNOWN_EXCEPTIONS: ReadonlySet<string> = new Set(ERROR_CLASSES);

export interface FailureSignals {
  failure_kind: FailureKind;
  error_class?: ErrorClass;
}

/** Leading-text rules: hosts put these messages first, so command output cannot spoof them. */
const KIND_RULES: Array<[RegExp, FailureKind]> = [
  [/^The user doesn't want to (proceed|take this action)/, 'user_denied'],
  // Kimi Code reports an approval rejection as a failed call (observed 2026-11-25 in its wire logs).
  [/^Tool "[^"]+" was not run because the user rejected/, 'user_denied'],
  [/^Permission for this action was denied/, 'policy_denied'],
  [/^Permission to use \S+ (with command .* )?has been denied/, 'policy_denied'],
  [/^The server-side auto mode classifier gave no verdict/, 'policy_denied'],
  [/^<tool_use_error>Blocked:/, 'harness_blocked'],
  [/^<tool_use_error>/, 'harness_rejected'],
  [/^(MCP server "[^"]*" (is not connected|session expired)|<tool_use_error>Error: No such tool available)/, 'tool_unavailable'],
  [/^\[Request interrupted by user/, 'interrupted'],
  [/^Exit code -?\d+(\r?\n|$)/, 'exit_nonzero'],
];

/** Checked in order; the first match wins, so specific causes precede generic ones. */
const CAUSE_RULES: Array<[RegExp, ErrorClass]> = [
  [/\bcommand not found\b|: not found$/m, 'command_not_found'],
  [/\b(unknown (flag|command|shorthand flag)|accepts \d+ arg|requires (at least|exactly) \d+ arg|invalid argument|unrecognized arguments?|^Usage:)/im, 'cli_usage'],
  [/\b(401|403)\b|Unauthorized|Forbidden|PERMISSION_DENIED|not authenticated|invalid (access )?token|credentials? (are )?(invalid|expired)/i, 'auth'],
  [/\b404\b|RESOURCE_DOES_NOT_EXIST|NOT_FOUND\b|does not exist\b/, 'not_found'],
  [/\btimed out\b|\bTimeout\b|deadline exceeded/i, 'timeout'],
  [/Could not resolve host|Connection (refused|reset)|Network is unreachable/i, 'network'],
  [/No such file or directory/, 'no_such_file'],
  [/Permission denied/, 'os_permission'],
];

export function failureSignals(text: string): FailureSignals {
  const trimmed = text.replace(/^\s+/, '');
  const kind = KIND_RULES.find(([pattern]) => pattern.test(trimmed))?.[1] ?? 'unknown';
  if (DENIAL_KINDS.has(kind) || NOT_EXECUTED_KINDS.has(kind) || kind === 'interrupted') return { failure_kind: kind };
  const errorClass = lastException(trimmed) ?? CAUSE_RULES.find(([pattern]) => pattern.test(trimmed))?.[1];
  return errorClass ? { failure_kind: kind, error_class: errorClass } : { failure_kind: kind };
}

/** Labels for output of a command known to have exited non-zero (e.g. a Codex response). */
export function executedFailureSignals(text: string): FailureSignals {
  const errorClass = lastException(text) ?? CAUSE_RULES.find(([pattern]) => pattern.test(text))?.[1];
  return errorClass ? { failure_kind: 'exit_nonzero', error_class: errorClass } : { failure_kind: 'exit_nonzero' };
}

/** The final raised exception wins: a traceback's last line names what escaped. */
function lastException(text: string): ErrorClass | undefined {
  let found: ErrorClass | undefined;
  for (const match of text.matchAll(/^(?:[\w.]+\.)?([A-Z]\w*(?:Error|Exception|Iteration))(?::|$)/gm)) {
    const name = match[0].replace(/:$/, '').trim();
    if (KNOWN_EXCEPTIONS.has(name)) found = name as ErrorClass;
    else if (KNOWN_EXCEPTIONS.has(match[1])) found = match[1] as ErrorClass;
  }
  return found;
}

/** Reads labels back from an already-redacted error, rejecting anything outside the vocabularies. */
export function redactedFailureKind(error: unknown): FailureKind | null {
  if (!error || typeof error !== 'object') return null;
  const kind = (error as Record<string, unknown>).failure_kind;
  return typeof kind === 'string' && (FAILURE_KINDS as readonly string[]).includes(kind) ? kind as FailureKind : null;
}
