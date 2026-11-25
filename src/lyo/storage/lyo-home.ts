/**
 * Where LYO keeps its own state. One home directory, one lesson store, no other tool's
 * folders: `LYO_HOME` (default `~/.lyo`) holds the store, decision config, case sets and the
 * decision queue; `LYO_STORE_PATH` overrides only the store file.
 */

import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function lyoHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.LYO_HOME ? resolve(env.LYO_HOME) : join(homedir(), '.lyo');
}

export function lessonStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.LYO_STORE_PATH ? resolve(env.LYO_STORE_PATH) : join(lyoHome(env), 'lessons.db');
}

/** An explicit `--store`, else the single store; an explicit command may create it (hooks never do). */
export function cliLessonStorePath(flag: string | undefined, cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const path = flag ? resolve(cwd, flag) : lessonStorePath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  return path;
}
