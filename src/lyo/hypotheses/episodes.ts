/**
 * Failure episodes from Claude Code transcripts (Spec 14): an executed Bash failure, the tail of
 * what it printed, and what the agent did next (its repair). Transcripts are the only retained
 * source of failure text; the corpus keeps digests. Read locally; nothing here sends data.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { failureSignals } from '../hooks/failure-signals.ts';
import { renderFailureState } from '../interface/finding-decision-triggers.ts';

export interface RepairStep { kind: 'say' | 'run' | 'result'; text: string; error?: boolean }

export interface FailureEpisode {
  id: string; // the tool_use_id
  sessionId: string;
  at: string;
  cwd: string;
  command: string;
  output: string; // tail, as in calibration
  state: string; // the command-output@1 rendering
  failureKind: string;
  errorClass: string | null;
  repair: RepairStep[];
}

export function transcriptRoot(env: NodeJS.ProcessEnv = process.env) {
  return env.LYO_CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');
}

function transcriptFiles(root: string, since?: Date) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap(project => {
    const dir = join(root, project);
    try { if (!statSync(dir).isDirectory()) return []; } catch { return []; }
    return readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => join(dir, f))
      .filter(path => !since || statSync(path).mtime >= since);
  });
}

const squash = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max);

/** Executed Bash failures in [from, until), oldest first, each with up to `repairSteps` following steps. */
export function readFailureEpisodes(options: { root?: string; from?: Date; until?: Date; repairSteps?: number; cwdPrefix?: string } = {}): FailureEpisode[] {
  const root = options.root ?? transcriptRoot(), maxSteps = options.repairSteps ?? 8;
  const episodes: FailureEpisode[] = [];
  for (const file of transcriptFiles(root, options.from)) {
    const events: Array<{ kind: 'use' | 'result' | 'say'; id?: string; name?: string; text: string; error?: boolean; at: string; cwd: string; sessionId: string }> = [];
    let lines: string[];
    try { lines = readFileSync(file, 'utf8').split('\n'); } catch { continue; }
    for (const line of lines) {
      if (!line.includes('"message"')) continue;
      let d: any;
      try { d = JSON.parse(line); } catch { continue; }
      if (d.isSidechain) continue;
      const content = typeof d.message?.content === 'string' ? [{ type: 'text', text: d.message.content }] : d.message?.content;
      if (!Array.isArray(content)) continue;
      const meta = { at: String(d.timestamp ?? ''), cwd: String(d.cwd ?? ''), sessionId: String(d.sessionId ?? '') };
      for (const c of content) {
        if (c?.type === 'tool_use') events.push({ kind: 'use', id: c.id, name: c.name,
          text: typeof c.input?.command === 'string' ? c.input.command : JSON.stringify(c.input ?? {}), ...meta });
        else if (c?.type === 'tool_result') events.push({ kind: 'result', id: c.tool_use_id, error: Boolean(c.is_error),
          text: typeof c.content === 'string' ? c.content : JSON.stringify(c.content ?? ''), ...meta });
        else if (c?.type === 'text' && d.message?.role === 'assistant') events.push({ kind: 'say', text: String(c.text ?? ''), ...meta });
      }
    }
    const uses = new Map(events.filter(e => e.kind === 'use').map(e => [e.id!, e]));
    events.forEach((e, i) => {
      if (e.kind !== 'result' || !e.error || !e.id) return;
      const use = uses.get(e.id);
      if (!use || use.name !== 'Bash') return;
      const at = e.at || use.at;
      if ((options.from && at < options.from.toISOString()) || (options.until && at >= options.until.toISOString())) return;
      if (options.cwdPrefix && !use.cwd.startsWith(options.cwdPrefix)) return;
      const signals = failureSignals(e.text);
      // Only executed failures: a declined or rejected call says nothing about the command.
      if (signals.failure_kind !== 'exit_nonzero') return;
      const repair: RepairStep[] = [];
      let runs = 0;
      for (const next of events.slice(i + 1)) {
        if (next.kind === 'use') { if (++runs > 3) break; repair.push({ kind: 'run', text: squash(next.text, 300) }); }
        else if (next.kind === 'result') repair.push({ kind: 'result', text: squash(next.text, 200).slice(-200), error: next.error });
        else repair.push({ kind: 'say', text: squash(next.text, 300) });
        if (repair.length >= maxSteps) break;
      }
      const output = e.text.slice(-700);
      episodes.push({ id: e.id, sessionId: use.sessionId, at, cwd: use.cwd, command: use.text, output,
        state: renderFailureState(use.text, e.text), failureKind: signals.failure_kind, errorClass: signals.error_class ?? null, repair });
    });
  }
  return episodes.sort((a, b) => a.at.localeCompare(b.at));
}
