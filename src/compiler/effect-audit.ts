import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { compileTelemetryRunAst } from './parser.ts';
import {
  hasDebugging,
  hasStoppedAfterEditWithoutVerification,
  hasVerifiedCompletion,
  isEditAction,
  isTestAction,
} from './semantics.ts';
import type { LearningKernel } from '../ledger.ts';
import type { NormalizedAction } from './syntax.ts';

const MAX_SAMPLES = 50;

export interface EffectAuditReport {
  ok: true;
  auditVersion: 'lyo/effect-audit/v1';
  root: string;
  ledgers: number;
  scannedDatabases: string[];
  skippedDatabases: SkippedDatabase[];
  totalRuns: number;
  totalEvents: number;
  normalizedActions: number;
  normalizedActionRate: number | null;
  unknownActions: number;
  unknownActionRate: number | null;
  parkedUnknownActions: number;
  parkedUnknownActionRate: number | null;
  lowConfidenceActions: number;
  lowConfidenceActionRate: number | null;
  runsWithEdits: number;
  verifiedEditRuns: number;
  editVerificationRate: number | null;
  runsWithFailedVerification: number;
  debuggingAfterFailureRuns: number;
  debuggingAfterTestFailureRate: number | null;
  stoppedAfterEditWithoutVerificationRuns: number;
  unsafeWriteRuns: number;
  summaryText: string;
  summaryLines: string[];
  topUnknownCommands: CommandAggregate[];
  topParkedUnknownCommands: CommandAggregate[];
  topMisclassificationCandidates: CommandAggregate[];
  unknownSamples: AuditSample[];
  parkedUnknownSamples: AuditSample[];
  misclassificationCandidates: AuditSample[];
}

export interface SkippedDatabase {
  dbPath: string;
  reason: string;
}

export interface AuditSample {
  dbPath: string;
  runId: string;
  evidenceRef: string;
  command: string | null;
  operation: string;
  intent: string;
  confidence: string;
}

export interface CommandAggregate {
  command: string;
  count: number;
}

export function auditEffectLedgers(input: { root: string }): EffectAuditReport {
  const dbPaths = findAgentLearningDatabases(input.root);
  const skippedDatabases: SkippedDatabase[] = [];
  const scannedDatabases: string[] = [];
  const unknownSamples: AuditSample[] = [];
  const parkedUnknownSamples: AuditSample[] = [];
  const misclassificationCandidates: AuditSample[] = [];
  const unknownCommandCounts = new Map<string, number>();
  const parkedUnknownCommandCounts = new Map<string, number>();
  const misclassificationCommandCounts = new Map<string, number>();
  let totalRuns = 0;
  let totalEvents = 0;
  let normalizedActions = 0;
  let unknownActions = 0;
  let parkedUnknownActions = 0;
  let lowConfidenceActions = 0;
  let runsWithEdits = 0;
  let verifiedEditRuns = 0;
  let runsWithFailedVerification = 0;
  let debuggingAfterFailureRuns = 0;
  let stoppedAfterEditWithoutVerificationRuns = 0;
  let unsafeWriteRuns = 0;

  for (const dbPath of dbPaths) {
    const db = openReadOnlyDatabase(dbPath);
    const kernel: LearningKernel = { db, dbPath };
    try {
      if (!hasHookEventsTable(kernel)) {
        skippedDatabases.push({ dbPath, reason: 'missing_hook_events_table' });
        continue;
      }

      scannedDatabases.push(dbPath);
      totalEvents += countHookEvents(kernel);

      for (const runId of listTelemetryRunIds(kernel)) {
        totalRuns += 1;
        const ast = compileTelemetryRunAst(kernel, { runId });
        normalizedActions += ast.actions.length;

        const allUnknown = ast.actions.filter(isUnknownAction);
        const parkedUnknown = allUnknown.filter(isParkedUnknownAction);
        const unknown = allUnknown.filter((action) => !isParkedUnknownAction(action));
        const lowConfidence = ast.actions.filter((action) => action.confidence === 'low');
        unknownActions += unknown.length;
        parkedUnknownActions += parkedUnknown.length;
        lowConfidenceActions += lowConfidence.length;
        pushSamples(unknownSamples, dbPath, runId, unknown);
        pushSamples(parkedUnknownSamples, dbPath, runId, parkedUnknown);
        const misclassified = uniqueActions([
          ...unknown,
          ...lowConfidence,
        ]);
        pushSamples(misclassificationCandidates, dbPath, runId, misclassified);
        countCommands(unknownCommandCounts, unknown);
        countCommands(parkedUnknownCommandCounts, parkedUnknown);
        countCommands(misclassificationCommandCounts, misclassified);

        if (ast.actions.some(isEditAction)) {
          runsWithEdits += 1;
          if (hasVerifiedCompletion(ast.actions)) verifiedEditRuns += 1;
        }

        if (hasFailedVerifier(ast.actions)) {
          runsWithFailedVerification += 1;
          if (hasDebugging(ast.actions)) debuggingAfterFailureRuns += 1;
        }

        if (hasStoppedAfterEditWithoutVerification(ast.actions)) {
          stoppedAfterEditWithoutVerificationRuns += 1;
        }

        if (hasUnsafeWriteAction(ast.actions)) {
          unsafeWriteRuns += 1;
        }
      }
    } catch (error) {
      skippedDatabases.push({
        dbPath,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      db.close();
    }
  }

  const normalizedActionRate = ratio(normalizedActions, totalEvents);
  const unknownActionRate = ratio(unknownActions, normalizedActions);
  const parkedUnknownActionRate = ratio(parkedUnknownActions, normalizedActions);
  const lowConfidenceActionRate = ratio(lowConfidenceActions, normalizedActions);
  const editVerificationRate = ratio(verifiedEditRuns, runsWithEdits);
  const debuggingAfterTestFailureRate = ratio(debuggingAfterFailureRuns, runsWithFailedVerification);
  const topUnknownCommands = topCommands(unknownCommandCounts);
  const topParkedUnknownCommands = topCommands(parkedUnknownCommandCounts);
  const topMisclassificationCandidates = topCommands(misclassificationCommandCounts);
  const summaryLines = buildSummaryLines({
    ledgers: scannedDatabases.length,
    totalRuns,
    totalEvents,
    normalizedActionRate,
    editVerificationRate,
    stoppedAfterEditWithoutVerificationRuns,
    debuggingAfterTestFailureRate,
    unsafeWriteRuns,
    unknownActions,
    parkedUnknownActions,
    topUnknownCommands,
    topParkedUnknownCommands,
  });

  return {
    ok: true,
    auditVersion: 'lyo/effect-audit/v1',
    root: input.root,
    ledgers: scannedDatabases.length,
    scannedDatabases,
    skippedDatabases,
    totalRuns,
    totalEvents,
    normalizedActions,
    normalizedActionRate,
    unknownActions,
    unknownActionRate,
    parkedUnknownActions,
    parkedUnknownActionRate,
    lowConfidenceActions,
    lowConfidenceActionRate,
    runsWithEdits,
    verifiedEditRuns,
    editVerificationRate,
    runsWithFailedVerification,
    debuggingAfterFailureRuns,
    debuggingAfterTestFailureRate,
    stoppedAfterEditWithoutVerificationRuns,
    unsafeWriteRuns,
    summaryText: summaryLines.join('\n'),
    summaryLines,
    topUnknownCommands,
    topParkedUnknownCommands,
    topMisclassificationCandidates,
    unknownSamples,
    parkedUnknownSamples,
    misclassificationCandidates,
  };
}

function findAgentLearningDatabases(root: string): string[] {
  if (!existsSync(root)) return [];

  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const fullPath = join(dir, entry);
      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (
        stats.isFile()
        && fullPath.includes(`${join('.agent-learning')}`)
        && (entry === 'learning.sqlite' || entry.endsWith('.sqlite'))
      ) {
        found.push(fullPath);
      }
    }
  };

  visit(root);
  return found.sort();
}

function openReadOnlyDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec('PRAGMA query_only = ON');
  return db;
}

function hasHookEventsTable(kernel: LearningKernel): boolean {
  const row = kernel.db.prepare(`
    select name
    from sqlite_master
    where type = 'table' and name = 'hook_events'
  `).get() as { name?: string } | undefined;
  return row?.name === 'hook_events';
}

function countHookEvents(kernel: LearningKernel): number {
  const row = kernel.db.prepare('select count(*) as count from hook_events').get() as { count: number };
  return row.count;
}

function listTelemetryRunIds(kernel: LearningKernel): string[] {
  const rows = kernel.db.prepare(`
    select distinct coalesce(turn_id, session_id) as runId
    from hook_events
    where coalesce(turn_id, session_id) is not null
    order by runId asc
  `).all() as { runId: string }[];
  return rows.map((row) => row.runId);
}

function isUnknownAction(action: NormalizedAction): boolean {
  if (action.eventKind === 'boundary') return false;
  return action.operation === 'unknown' || action.intent === 'unknown';
}

function isParkedUnknownAction(action: NormalizedAction): boolean {
  const command = action.command?.argvSummary?.trim().toLowerCase();
  if (!command) return false;
  return command === 'bd' || command.startsWith('bd ');
}

function hasFailedVerifier(actions: NormalizedAction[]): boolean {
  return actions.some((action) => isTestAction(action) && (
    action.status === 'failed'
    || (typeof action.command?.exitCode === 'number' && action.command.exitCode !== 0)
  ));
}

function hasUnsafeWriteAction(actions: NormalizedAction[]): boolean {
  return actions.some((action) => (
    action.operation === 'mutate_local'
    || action.operation === 'mutate_external'
  ) && (
    action.risk === 'destructive'
    || action.risk === 'external_write'
  ));
}

function pushSamples(
  samples: AuditSample[],
  dbPath: string,
  runId: string,
  actions: NormalizedAction[]
): void {
  for (const action of actions) {
    if (samples.length >= MAX_SAMPLES) return;
    samples.push({
      dbPath,
      runId,
      evidenceRef: action.provenance.evidenceRef,
      command: action.command?.argvSummary ?? null,
      operation: action.operation,
      intent: action.intent,
      confidence: action.confidence,
    });
  }
}

function uniqueActions(actions: NormalizedAction[]): NormalizedAction[] {
  const byId = new Map<string, NormalizedAction>();
  for (const action of actions) {
    byId.set(action.actionId, action);
  }
  return Array.from(byId.values());
}

function countCommands(counts: Map<string, number>, actions: NormalizedAction[]): void {
  for (const action of actions) {
    const command = commandLabel(action);
    counts.set(command, (counts.get(command) ?? 0) + 1);
  }
}

function topCommands(counts: Map<string, number>): CommandAggregate[] {
  return Array.from(counts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((left, right) => right.count - left.count || left.command.localeCompare(right.command))
    .slice(0, 10);
}

function commandLabel(action: NormalizedAction): string {
  return action.command?.argvSummary
    ?? `${action.eventKind}:${action.operation}:${action.intent}`;
}

function buildSummaryLines(input: {
  ledgers: number;
  totalRuns: number;
  totalEvents: number;
  normalizedActionRate: number | null;
  editVerificationRate: number | null;
  stoppedAfterEditWithoutVerificationRuns: number;
  debuggingAfterTestFailureRate: number | null;
  unsafeWriteRuns: number;
  unknownActions: number;
  parkedUnknownActions: number;
  topUnknownCommands: CommandAggregate[];
  topParkedUnknownCommands: CommandAggregate[];
}): string[] {
  const lines = [
    `Found ${input.ledgers} ledgers, ${input.totalRuns} runs, ${input.totalEvents} events.`,
    `Normalized action rate: ${formatPercent(input.normalizedActionRate)}.`,
    `Verified edit rate: ${formatPercent(input.editVerificationRate)}.`,
    `Stopped after edit without verification: ${input.stoppedAfterEditWithoutVerificationRuns} runs.`,
    `Debugging after failed test: ${formatPercent(input.debuggingAfterTestFailureRate)}.`,
    `Unsafe write runs: ${input.unsafeWriteRuns}.`,
    `Unknown actions: ${input.unknownActions}.`,
    `Parked unknown actions: ${input.parkedUnknownActions}.`,
  ];

  if (input.topUnknownCommands.length > 0) {
    lines.push(`Top unknown commands: ${input.topUnknownCommands.map((item) => `${item.command} (${item.count})`).join(', ')}.`);
  } else {
    lines.push('Top unknown commands: none.');
  }

  if (input.topParkedUnknownCommands.length > 0) {
    lines.push(`Top parked unknown commands: ${input.topParkedUnknownCommands.map((item) => `${item.command} (${item.count})`).join(', ')}.`);
  } else {
    lines.push('Top parked unknown commands: none.');
  }

  return lines;
}

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(4));
}
