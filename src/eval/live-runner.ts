import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { LearnedRuleStore } from '../lyo/storage/learned-rules.ts';
import type { VerifierGate } from '../lyo/storage/learned-rules.ts';
import type { EvalTask } from './tasks.ts';

export type EvalBaselineId = 'B0' | 'B1' | 'B3' | 'B4';

export interface RunLocalEpisodeInput {
  task: EvalTask;
  baselineId: EvalBaselineId;
  model: string;
  harness: string;
  cwd: string;
  dbPath?: string;
  scopeKind?: string;
  scopeValue?: string;
  runId?: string;
  staticSkill?: string | null;
}

export interface EvalEpisodeResult {
  episode_id: string;
  task_id: string;
  baseline_id: EvalBaselineId;
  model: string;
  harness: string;
  budget: EvalTask['budget'];
  allowed_tools: string[];
  trace_ref: string | null;
  diff_ref: string | null;
  touched_paths: string[];
  verifier_evidence: VerifierEvidence;
  token_usage: null;
  wall_time_ms: number;
  injected_context: {
    static_skill: string | null;
    observe_only: boolean;
    rule_gates: VerifierGate[];
  };
  outcome: {
    verified_success: boolean;
  };
}

export interface VerifierEvidence {
  kind: 'command';
  command: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
}

export function runLocalEpisode(input: RunLocalEpisodeInput): EvalEpisodeResult {
  if (input.task.success_check.kind !== 'command') {
    throw new Error('runLocalEpisode only supports command success checks');
  }

  const started = performance.now();
  const episodeId = input.runId ?? randomId('episode');
  const ruleGates = input.baselineId === 'B4'
    ? applyRuleGates({
        dbPath: input.dbPath,
        runId: episodeId,
        scopeKind: input.scopeKind ?? 'repository',
        scopeValue: input.scopeValue ?? input.cwd,
        touchedPaths: input.task.expected_touched_paths,
      })
    : [];

  const verifier = spawnSync(input.task.success_check.command, {
    cwd: input.cwd,
    shell: true,
    encoding: 'utf8',
  });
  const wallTimeMs = Math.round(performance.now() - started);
  const exitCode = verifier.status;

  return {
    episode_id: episodeId,
    task_id: input.task.task_id,
    baseline_id: input.baselineId,
    model: input.model,
    harness: input.harness,
    budget: input.task.budget,
    allowed_tools: input.task.allowed_tools,
    trace_ref: null,
    diff_ref: null,
    touched_paths: input.task.expected_touched_paths,
    verifier_evidence: {
      kind: 'command',
      command: input.task.success_check.command,
      exit_code: exitCode,
      stdout: verifier.stdout ?? '',
      stderr: verifier.stderr ?? '',
    },
    token_usage: null,
    wall_time_ms: wallTimeMs,
    injected_context: {
      static_skill: input.baselineId === 'B1' ? input.staticSkill ?? '' : null,
      observe_only: input.baselineId === 'B3',
      rule_gates: ruleGates,
    },
    outcome: {
      verified_success: exitCode === 0,
    },
  };
}

export function parseBaselineId(value: string): EvalBaselineId {
  if (value === 'B0' || value === 'B1' || value === 'B3' || value === 'B4') return value;
  throw new Error('baseline must be B0, B1, B3, or B4');
}

function applyRuleGates({
  dbPath = ':memory:',
  runId,
  scopeKind,
  scopeValue,
  touchedPaths,
}: {
  dbPath?: string;
  runId: string;
  scopeKind: string;
  scopeValue: string;
  touchedPaths: string[];
}): VerifierGate[] {
  const store = new LearnedRuleStore(dbPath);
  try {
    return store.applyVerifierRules({
      run_id: runId,
      scope_kind: scopeKind,
      scope_value: scopeValue,
      touched_paths: touchedPaths,
    });
  } finally {
    store.close();
  }
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}
