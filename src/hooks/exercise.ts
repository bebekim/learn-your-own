import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LearningKernel } from '../ledger.ts';
import {
  ensureExerciseAttempt,
  getExerciseAttempt,
  recordExerciseAssistantClaim,
  recordExerciseVerifierResult,
  recordExerciseWorkerAction,
} from '../reducers/exercises.ts';
import type {
  ExerciseFailureClass,
  ExerciseManifest,
} from '../types/exercise.ts';
import type {
  ExtractedHookCommand,
  ExtractedHookFacts,
  ExtractedHookPath,
  HookEventForNormalization,
} from './normalizer.ts';

export interface ApplyExerciseHookFactsResult {
  attemptId: string | null;
  recordedEvents: number;
}

export function applyExerciseHookFacts(
  kernel: LearningKernel,
  event: HookEventForNormalization,
  facts: ExtractedHookFacts
): ApplyExerciseHookFactsResult {
  const manifest = readExerciseManifest(event.cwd);
  if (!manifest) return { attemptId: null, recordedEvents: 0 };

  const runId = event.turnId ?? event.sessionId;
  const attempt = ensureExerciseAttempt(kernel, {
    exerciseId: manifest.exerciseId,
    runId,
    track: manifest.track,
    language: manifest.language,
    stage: manifest.stage,
    verifierCommands: manifest.verifierCommands,
    evidenceRef: `exercise-manifest:${event.cwd}`,
  });

  let recordedEvents = 0;
  if (isWriteEvent(facts.paths)) {
    const updated = recordExerciseWorkerAction(kernel, {
      attemptId: attempt.attemptId,
      summary: summarizeWriteEvent(facts.paths),
      evidenceRef: facts.evidenceRef,
      payload: {
        paths: facts.paths,
        toolName: facts.toolName,
      },
    });
    if (updated.score !== attempt.score) recordedEvents += 1;
  }

  for (const command of facts.commands) {
    if (!isCompletedCommand(command)) continue;
    if (!isVerifierCommand(command.argv, manifest.verifierCommands)) continue;
    const passed = command.status === 'succeeded';
    recordExerciseVerifierResult(kernel, {
      attemptId: attempt.attemptId,
      passed,
      failureClass: passed ? null : classifyFailure(command, facts.payload),
      summary: verifierResultSummary(command.argv, passed),
      evidenceRef: facts.evidenceRef,
      payload: {
        command: command.argvSummary,
        status: command.status,
        exitCode: extractExitCode(facts.payload),
      },
    });
    recordedEvents += 1;
  }

  if (isStopEvent(event.eventName)) {
    const current = getExerciseAttempt(kernel, attempt.attemptId);
    if (current.status !== 'passed') {
      const updated = recordExerciseAssistantClaim(kernel, {
        attemptId: attempt.attemptId,
        summary: 'Assistant turn ended before the exercise verifier passed.',
        evidenceRef: facts.evidenceRef,
      });
      if (updated.status === 'claimed_without_pass') recordedEvents += 1;
    }
  }

  return {
    attemptId: attempt.attemptId,
    recordedEvents,
  };
}

export function readExerciseManifest(cwd: string): ExerciseManifest | null {
  const path = join(cwd, '.agent-learning', 'exercise.json');
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const exerciseId = stringValue(raw.exerciseId) ?? stringValue(raw.id);
  if (!exerciseId) return null;
  return {
    exerciseId,
    track: stringValue(raw.track) ?? 'programming',
    language: stringValue(raw.language) ?? 'unknown',
    stage: stringValue(raw.stage) ?? 'practice',
    verifierCommands: verifierCommands(raw),
  };
}

function isWriteEvent(paths: ExtractedHookPath[]): boolean {
  return paths.some((path) => (
    path.activationKind === 'file_written'
    || path.activationKind === 'file_created'
    || path.activationKind === 'file_deleted'
  ));
}

function summarizeWriteEvent(paths: ExtractedHookPath[]): string {
  const written = paths
    .filter((path) => path.activationKind === 'file_written' || path.activationKind === 'file_created')
    .map((path) => path.path);
  if (written.length === 0) return 'Edited exercise files.';
  if (written.length === 1) return `Edited ${written[0]}.`;
  return `Edited ${written.length} exercise files.`;
}

function isCompletedCommand(command: ExtractedHookCommand): boolean {
  return command.status === 'succeeded' || command.status === 'failed';
}

function isVerifierCommand(command: string, verifierCommands: string[]): boolean {
  const normalized = normalizeCommand(command);
  if (verifierCommands.length > 0) {
    return verifierCommands.some((verifier) => {
      const normalizedVerifier = normalizeCommand(verifier);
      return normalized === normalizedVerifier || normalized.startsWith(`${normalizedVerifier} `);
    });
  }
  return looksLikeVerifierCommand(normalized);
}

function looksLikeVerifierCommand(command: string): boolean {
  return /(^|\s)(gcc|clang|cc|make|cmake|ctest|pytest|node --test|npm test|pnpm test|cargo test|go test|mvn test|gradle test)(\s|$)/.test(command);
}

function classifyFailure(command: ExtractedHookCommand, payload: Record<string, unknown>): ExerciseFailureClass {
  const exitCode = extractExitCode(payload);
  const text = payloadText(payload).toLowerCase();
  const argv = normalizeCommand(command.argv);
  if (exitCode === 127 || text.includes('command not found')) return 'command_not_found';
  if (exitCode === 124 || text.includes('timed out') || text.includes('timeout')) return 'timeout';
  if (exitCode === 139 || text.includes('segmentation fault') || text.includes('segfault')) return 'segfault';
  if (text.includes('assertion') || text.includes('assert failed')) return 'assertion_failure';
  if (text.includes('error:') || /^(gcc|clang|cc|make|cmake)\b/.test(argv)) return 'compile_error';
  if (argv.includes('test')) return 'test_failure';
  return 'unknown_failure';
}

function verifierResultSummary(command: string, passed: boolean): string {
  return `${command} ${passed ? 'passed' : 'failed'}.`;
}

function isStopEvent(eventName: string): boolean {
  return eventName === 'Stop' || eventName === 'turn.stop';
}

function verifierCommands(raw: Record<string, unknown>): string[] {
  const fromArray = raw.verifierCommands;
  if (Array.isArray(fromArray)) {
    return fromArray
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(normalizeCommand);
  }
  const single = stringValue(raw.verifierCommand) ?? stringValue(raw.verifier);
  return single ? [normalizeCommand(single)] : [];
}

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, ' ').trim();
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractExitCode(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const exitCode = extractExitCode(item);
      if (exitCode !== null) return exitCode;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
    if (['exitcode', 'returncode'].includes(normalizedKey) && typeof child === 'number') {
      return child;
    }
  }
  for (const child of Object.values(value)) {
    const exitCode = extractExitCode(child);
    if (exitCode !== null) return exitCode;
  }
  return null;
}

function payloadText(value: unknown, remaining = 4096): string {
  if (remaining <= 0) return '';
  if (typeof value === 'string') return value.slice(0, remaining);
  if (Array.isArray(value)) {
    let text = '';
    for (const item of value) {
      text += ` ${payloadText(item, remaining - text.length)}`;
      if (text.length >= remaining) break;
    }
    return text.slice(0, remaining);
  }
  if (!value || typeof value !== 'object') return '';
  let text = '';
  for (const child of Object.values(value)) {
    text += ` ${payloadText(child, remaining - text.length)}`;
    if (text.length >= remaining) break;
  }
  return text.slice(0, remaining);
}
