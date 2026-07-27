/**
 * lesson-library — the delivery side of the learning loop. Promoted lessons
 * (scope future-runs) are installed into a library directory; the runner
 * loads them and injects them into the prompts of future runs.
 *
 * Blindness-aware routing is mandatory: lesson files may quote test code in
 * their evidence sections, so a lesson derived from test artifacts must never
 * reach the code writer. Prompts receive lesson TITLES only — the distilled
 * rule, never the evidence.
 */

import { cpSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashFile } from '../contract/refs.ts';
import type { LyoUpdate } from '../contract/index.ts';
import type { JudgeClassification } from './trace-consumer.ts';

export type LessonVehicle = 'prose' | 'skeleton-patch' | 'spec-constraint';

export interface Lesson {
  title: string;
  classification: JudgeClassification;
  path: string;
  sha256: string;
  content: string;
  evidenceRuns: number;
  vehicle: LessonVehicle;
  promptPatch?: string;
}

const ROLE_BY_CLASSIFICATION: Partial<Record<JudgeClassification, 'code-writer' | 'test-writer'>> = {
  'code-bug': 'code-writer',
  'test-hallucination': 'test-writer',
  // spec-gap: routed to no stage — the spec is the human-owned contract.
};

export const DEFAULT_LESSON_LIMIT = 3;

export function loadLessons(libraryDir: string): Lesson[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(libraryDir);
  } catch {
    return [];
  }
  const lessons: Lesson[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) {
      continue;
    }
    const path = join(libraryDir, entry);
    const content = readFileSync(path, 'utf8');
    const title = content.match(/^# (.+)$/m)?.[1];
    const classification = content.match(/^- classification: (\S+)$/m)?.[1];
    if (!title || !classification) {
      continue;
    }
    const runList = content.match(/^- observed in runs: (.+)$/m)?.[1];
    lessons.push({
      title,
      classification: classification as JudgeClassification,
      path,
      sha256: hashFile(path).sha256,
      content,
      evidenceRuns: runList ? runList.split(',').filter((run) => run.trim() !== '').length : 0,
      vehicle: parseVehicle(content),
      promptPatch: parsePromptPatch(content),
    });
  }
  return lessons;
}

export function lessonsForRole(
  lessons: Lesson[],
  role: 'code-writer' | 'test-writer' | 'verifier'
): Lesson[] {
  return lessons.filter((lesson) => ROLE_BY_CLASSIFICATION[lesson.classification] === role);
}

/**
 * Bounded delivery: at most `limit` lessons per role, strongest evidence
 * first (distinct runs observed), title order as the deterministic
 * tie-break. Keeps prompt context bounded as the library grows; the
 * scoring function is the future Thompson-Beta slot.
 */
export function selectLessons(
  lessons: Lesson[],
  { role, limit = DEFAULT_LESSON_LIMIT }: { role: 'code-writer' | 'test-writer' | 'verifier'; limit?: number }
): Lesson[] {
  return lessonsForRole(lessons, role)
    .sort((a, b) => b.evidenceRuns - a.evidenceRuns || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Titles only. Evidence stays in the library, out of the prompts. */
export function renderLessonsBlock(lessons: Lesson[]): string {
  if (lessons.length === 0) {
    return '';
  }
  return (
    '\n\nPromoted lessons from earlier runs (apply them to your work):\n' +
    lessons.map((lesson) => `- ${lesson.title}`).join('\n') +
    '\n'
  );
}

/**
 * Imitable code, not advice: the model's pattern-completion engine copies
 * concrete examples far more reliably than it obeys prose rules. Each patch
 * is the lesson expressed as helper code to imitate.
 */
export function renderPatchBlock(lessons: Lesson[]): string {
  const patches = lessons
    .map((lesson) => lesson.promptPatch)
    .filter((patch): patch is string => patch !== undefined && patch.trim() !== '');
  if (patches.length === 0) {
    return '';
  }
  return (
    '\n\nPromoted lesson patterns (imitate these in the code you generate):\n' +
    patches.map((patch) => `\`\`\`js\n${patch.trim()}\n\`\`\``).join('\n\n') +
    '\n'
  );
}

function parseVehicle(content: string): LessonVehicle {
  const vehicle = content.match(/^- vehicle: (\S+)$/m)?.[1];
  if (vehicle === 'skeleton-patch' || vehicle === 'spec-constraint') {
    return vehicle;
  }
  return 'prose';
}

function parsePromptPatch(content: string): string | undefined {
  const marker = '## Prompt patch';
  const start = content.indexOf(marker);
  if (start === -1) {
    return undefined;
  }
  let section = content.slice(start + marker.length);
  const next = section.indexOf('\n## ');
  if (next !== -1) {
    section = section.slice(0, next);
  }
  const patch = section
    .split('\n')
    .filter((line) => !line.trim().startsWith('```'))
    .join('\n')
    .trim();
  return patch === '' ? undefined : patch;
}

/** Install future-runs-scoped lessons from an lyo-update into the library. */
export function installPromotedLessons({
  update,
  sourceDir,
  libraryDir,
}: {
  update: LyoUpdate;
  sourceDir: string;
  libraryDir: string;
}): string[] {
  const installed: string[] = [];
  mkdirSync(libraryDir, { recursive: true });
  for (const promotion of update.promotions) {
    if (promotion.scope !== 'future-runs') {
      continue;
    }
    const source = join(sourceDir, promotion.artifactRef.path);
    const target = join(libraryDir, promotion.artifactRef.path.split('/').pop()!);
    cpSync(source, target);
    installed.push(target);
  }
  return installed;
}
