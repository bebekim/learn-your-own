import { existsSync, mkdirSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashValue } from '../contract/refs.ts';
import { workspaceRoot } from '../repository.ts';

interface ContextEvent {
  cwd?: string | null;
  session_id?: string | null;
  sessionId?: string | null;
  turn_id?: string | null;
  hook_event_name?: string | null;
  tool_use_id?: string | null;
}
interface ContextOutput {
  systemMessage?: string;
  hookSpecificOutput?: { additionalContext?: string; [key: string]: unknown };
  [key: string]: unknown;
}

function retainContext(text: string, event: ContextEvent, source: string): string {
  const root = realpathSync(workspaceRoot(event.cwd || process.cwd()));
  const directory = join(root, '.agent-learning', 'context-additions');
  for (const parent of [join(root, '.agent-learning'), directory]) {
    if (existsSync(parent) && realpathSync(parent) !== parent) throw new Error('Context record path is redirected');
    mkdirSync(parent, { recursive: true });
  }
  const textHash = hashValue(text);
  const id = hashValue([root, source, event.hook_event_name, event.session_id ?? event.sessionId,
    event.turn_id, event.tool_use_id, textHash]);
  const file = join(directory, `${id}.json`);
  try { writeFileSync(file, JSON.stringify({ source: 'lyo-context-output@1', id, preparedAt: new Date().toISOString(),
    emitter: source, event: event.hook_event_name ?? null, sessionId: event.session_id ?? event.sessionId ?? null,
    turnId: event.turn_id ?? null, toolUseId: event.tool_use_id ?? null,
    observation: 'Prepared hook output; host receipt, display, adherence and benefit are not established.',
    textHash, text }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || realpathSync(file) !== file) throw error;
    const previous = JSON.parse(readFileSync(file, 'utf8'));
    if (previous.id !== id || previous.textHash !== textHash || previous.text !== text) throw new Error('Context record conflict');
  }
  return file;
}

/** Mirror model-bound context to the host's user-facing channel without changing the context itself. */
export function visibleHookContext<T extends ContextOutput>(output: T, event: ContextEvent, source: string): T & { systemMessage?: string } {
  const text = output.hookSpecificOutput?.additionalContext;
  if (typeof text !== 'string' || !text.trim()) return output;
  let location: string;
  try { location = `Exact emitted text: ${retainContext(text, event, source)}`; }
  catch { location = 'Exact-text record could not be saved; the emitted text follows below.'; }
  const notice = `LYO prompt addition — ${source} / ${event.hook_event_name ?? 'unknown event'}.\n` +
    'Delivery is not evidence of adherence or benefit.\n' + location + '\n\n' + text;
  return { ...output, systemMessage: [output.systemMessage, notice].filter(Boolean).join('\n\n') };
}
