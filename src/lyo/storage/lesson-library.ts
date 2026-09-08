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

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashFile, hashValue } from '../../contract/refs.ts';
import type { LyoUpdate } from '../../contract/index.ts';
import { sampleGamma } from '../selection/selection-policies.ts';
import type { JudgeClassification } from '../judge/trace-consumer.ts';

export type LessonVehicle = 'prose' | 'skeleton-patch' | 'spec-constraint';

export interface Lesson {
  title: string;
  classification: JudgeClassification;
  path: string;
  sha256: string;
  content: string;
  evidenceRuns: number;
  helpful: number;
  harmful: number;
  vehicle: LessonVehicle;
  promptPatch?: string;
  falsifiableBy?: string;
  status?: string;
}

const ROLE_BY_CLASSIFICATION: Partial<Record<JudgeClassification, 'code-writer' | 'test-writer'>> = {
  'code-bug': 'code-writer',
  'test-hallucination': 'test-writer',
  // spec-gap: routed to no stage — the spec is the human-owned contract.
};

export const DEFAULT_LESSON_LIMIT = 3;

export function loadLessons(libraryDir: string, { includeQuarantined = false } = {}): Lesson[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(libraryDir);
  } catch {
    return [];
  }
  return loadLessonsFromFiles(
    entries
      .filter((entry) => entry.endsWith('.md'))
      .sort()
      .map((entry) => join(libraryDir, entry))
  ).filter(lesson => includeQuarantined || !isDemoted(lesson));
}

export function loadLessonsFromFiles(paths: string[]): Lesson[] {
  const lessons: Lesson[] = [];
  for (const path of paths) {
    const content = readFileSync(path, 'utf8');
    const title = content.match(/^# (.+)$/m)?.[1];
    const classification = content.match(/^- classification: (\S+)$/m)?.[1];
    if (!title || !classification) {
      continue;
    }
    const runList = content.match(/^- observed in runs: (.+)$/m)?.[1];
    const receiptsDir = `${path}.outcomes`;
    const receipts = existsSync(receiptsDir)
      ? readdirSync(receiptsDir).filter(name => name.endsWith('.json')).map(name =>
          JSON.parse(readFileSync(join(receiptsDir, name), 'utf8')) as { outcome: string })
      : [];
    lessons.push({
      title,
      classification: classification as JudgeClassification,
      path,
      sha256: hashFile(path).sha256,
      content,
      evidenceRuns: runList ? runList.split(',').filter((run) => run.trim() !== '').length : 0,
      helpful: parseCounter(content, 'helpful') + receipts.filter(r => r.outcome === 'helpful').length,
      harmful: parseCounter(content, 'harmful') + receipts.filter(r => r.outcome === 'harmful').length,
      status: content.match(/^- status: (.+)$/m)?.[1],
      vehicle: parseVehicle(content),
      promptPatch: parsePromptPatch(content),
      falsifiableBy: content.match(/^- falsifiable_by: (.+)$/m)?.[1],
    });
  }
  return lessons;
}

function parseCounter(content: string, field: 'helpful' | 'harmful'): number {
  const value = content.match(new RegExp(`^- ${field}: (\\d+)$`, 'm'))?.[1];
  return value === undefined ? 0 : Number(value);
}

export function lessonsForRole(
  lessons: Lesson[],
  role: 'code-writer' | 'test-writer' | 'verifier'
): Lesson[] {
  return lessons.filter((lesson) => ROLE_BY_CLASSIFICATION[lesson.classification] === role);
}

/**
 * Selection policy: Thompson sampling over per-lesson Beta posteriors
 * (helpful+1, harmful+1). Selection is the "try" layer — proven lessons win
 * most draws, unproven ones keep exploring. Outcome-blind evidence counts
 * (evidenceRuns) are gate metadata, never a selection score.
 *
 * Candidates are sampled in path order so seeded rng draws are reproducible
 * regardless of input order (mirrors the kernel's LessonStore convention).
 */
export function selectLessons(
  lessons: Lesson[],
  {
    role,
    limit = DEFAULT_LESSON_LIMIT,
    rng = Math.random,
  }: { role: 'code-writer' | 'test-writer' | 'verifier'; limit?: number; rng?: () => number }
): Lesson[] {
  const candidates = lessonsForRole(lessons, role)
    .filter((lesson) => !isDemoted(lesson))
    .sort((a, b) => a.path.localeCompare(b.path));
  const scored = candidates.map((lesson) => {
    const g1 = sampleGamma(lesson.helpful + 1, rng);
    const g2 = sampleGamma(lesson.harmful + 1, rng);
    return { lesson, score: g1 / (g1 + g2) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.lesson);
}

/** v1 demotion rule: failed at least twice, never once helped. */
export function isDemoted(lesson: Lesson): boolean {
  return lesson.status === 'quarantined' || (lesson.harmful >= 2 && lesson.helpful === 0);
}

/** Immutable per-run receipts; original counters remain legacy evidence. */
export function recordLessonOutcome({
  lessonPath,
  outcome,
  runId,
  evidenceRef,
}: {
  lessonPath: string;
  outcome: 'helpful' | 'harmful';
  runId: string;
  evidenceRef?: string;
}): Lesson {
  if (!runId || !['helpful', 'harmful'].includes(outcome)) throw new Error('lesson credit requires runId and a valid outcome');
  const receiptsDir = `${lessonPath}.outcomes`;
  mkdirSync(receiptsDir, { recursive: true });
  const receipt = join(receiptsDir, `${hashValue(runId)}.json`);
  try {
    writeFileSync(receipt, JSON.stringify({ runId, outcome, evidenceRef: evidenceRef ?? null }), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const previous = JSON.parse(readFileSync(receipt, 'utf8')) as { runId: string; outcome: string };
    if (previous.runId !== runId || previous.outcome !== outcome) throw new Error('conflicting lesson outcome for the same run');
  }
  const [lesson] = loadLessonsFromFiles([lessonPath]);
  if (isDemoted(lesson) && lesson.status !== 'quarantined') {
    const content = lesson.content;
    writeFileSync(lessonPath, /^- status: .+$/m.test(content)
      ? content.replace(/^- status: .+$/m, '- status: quarantined')
      : content + '\n- status: quarantined\n');
    lesson.status = 'quarantined';
  }
  return lesson;
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
    if (hashFile(source).sha256 !== promotion.artifactRef.sha256) throw new Error('lesson artifact hash mismatch');
    // Never reset historical counters or overwrite an installed intervention.
    if (!existsSync(target)) cpSync(source, target);
    installed.push(target);
  }
  return installed;
}
