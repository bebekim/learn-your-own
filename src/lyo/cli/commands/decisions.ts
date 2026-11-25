import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LessonStore } from '../../storage/lesson-store.ts';
import { findingTrials, registerFindingTrial } from '../../interface/finding-trials.ts';
import { decisionQueueDir, FAILURE_INPUT_FORMAT, type DecisionTrigger } from '../../interface/finding-decision-triggers.ts';
import { runDecisionWorker } from '../../interface/finding-decision-worker.ts';
import { configuredDecisionModel, createDecisionProvider, decisionConfigSchema, loadDecisionConfig, type DecisionConfig } from '../../decisions/providers.ts';
import { queueCounts, lockHolder } from '../../decisions/queue.ts';
import { addCases, caseSchema, caseSetDir, createCaseSet, newTestSet, readSplits, recalibrate, relabelCases, testScore,
  type ScoreQuestion } from '../../decisions/case-sets.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { cliLessonStorePath } from '../../storage/lyo-home.ts';

function storePathOf(args: CommandArgs) {
  return cliLessonStorePath(args.flagValue('--store'), args.cwd, args.env);
}

/** The configured provider, optionally overridden for one run with --provider / --model. */
function configOf(args: CommandArgs): DecisionConfig {
  const base = loadDecisionConfig(args.env) ?? decisionConfigSchema.parse({ provider: args.flagValue('--provider') ?? 'mlxcel' });
  const provider = (args.flagValue('--provider') ?? base.provider) as DecisionConfig['provider'];
  const config = decisionConfigSchema.parse({ ...base, provider });
  const model = args.flagValue('--model');
  if (model) {
    if (provider === 'mlxcel') config.mlxcel.decisionModel = model;
    else if (provider === 'openrouter') config.openrouter.model = model;
    else config.jev.model = model;
  }
  return config;
}

function readJsonl(path: string) {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

export const DECISION_COMMANDS: Record<string, CommandHandler> = {
  'decisions worker': async (args: CommandArgs) => {
    const storePath = storePathOf(args), config = configOf(args);
    return { ok: true, worker: await runDecisionWorker({ storePath, queueDir: args.flagValue('--queue') ?? decisionQueueDir(storePath),
      provider: createDecisionProvider(config, { env: args.env }), worker: config.worker }) };
  },
  'decisions status': (args: CommandArgs) => {
    const storePath = storePathOf(args), queue = decisionQueueDir(storePath), store = new LessonStore(storePath);
    try {
      const rows = store.db.prepare(`SELECT json_extract(payload_json, '$.trialHash') AS trial, json_extract(payload_json, '$.verdict') AS verdict,
        COUNT(*) AS n, AVG(json_extract(payload_json, '$.latencyMs')) AS latency FROM learning_trace
        WHERE kind = 'behavior' AND json_extract(payload_json, '$.source') = 'finding-trigger-decision@1' GROUP BY 1, 2`).all();
      const trials = findingTrials(store.db);
      const enrolled = store.db.prepare(`SELECT COUNT(*) AS n FROM learning_trace WHERE kind = 'behavior'
        AND json_extract(payload_json, '$.content.input.prospective.automatic.decisionRef') IS NOT NULL`).get() as { n: number };
      return { ok: true, queue: queueCounts(queue), worker: lockHolder(queue), enrolledFromDecisions: enrolled.n,
        decisions: rows.map(r => ({ trial: trials.find(t => t.hash === r.trial)?.id ?? r.trial, verdict: r.verdict, count: r.n,
          meanLatencyMs: r.latency === null ? null : Math.round(Number(r.latency)) })) };
    } finally { store.close(); }
  },
  'finding cases-import': (args: CommandArgs) => {
    const dir = args.flagValue('--cases-dir') ?? caseSetDir(args.requiredFlag('--finding'), args.env);
    const now = new Date().toISOString();
    const cases = readJsonl(resolve(args.cwd, args.requiredFlag('--input'))).map(c => caseSchema.parse({ addedAt: now, ...c }));
    const options = { testFraction: args.optionalNumber('--test-fraction') ?? undefined, seed: args.optionalNumber('--seed') ?? undefined };
    const splits = args.hasFlag('--new-test-set') ? (addCases(dir, cases), newTestSet(dir, options)) : createCaseSet(dir, cases, options);
    return { ok: true, dir, cases: cases.length, test: splits.test.length, calibration: splits.calibration.length, testHash: splits.testHash };
  },
  'finding cases-add': (args: CommandArgs) => {
    const dir = args.flagValue('--cases-dir') ?? caseSetDir(args.requiredFlag('--finding'), args.env);
    const now = new Date().toISOString();
    const result = addCases(dir, readJsonl(resolve(args.cwd, args.requiredFlag('--input'))).map(c => caseSchema.parse({ addedAt: now, ...c })));
    return { ok: true, ...result, testHash: readSplits(dir).testHash };
  },
  'finding cases-relabel': (args: CommandArgs) => {
    const dir = args.flagValue('--cases-dir') ?? caseSetDir(args.requiredFlag('--finding'), args.env);
    return { ok: true, ...relabelCases(dir, readJsonl(resolve(args.cwd, args.requiredFlag('--input'))), args.requiredFlag('--reason')) };
  },
  'finding recalibrate': async (args: CommandArgs) => {
    const findingId = args.requiredFlag('--finding'), dir = args.flagValue('--cases-dir') ?? caseSetDir(findingId, args.env);
    const config = configOf(args), { provider: providerName, model } = configuredDecisionModel(config);
    // A report from --question alone needs no lesson store; never open (and migrate) one without cause.
    const needsStore = Boolean(args.flagValue('--trial-id') || args.hasFlag('--register'));
    const store = needsStore ? new LessonStore(storePathOf(args)) : null;
    try {
      const current = store && args.flagValue('--trial-id') ? findingTrials(store.db).find(t => t.id === args.flagValue('--trial-id')) : undefined;
      if (args.flagValue('--trial-id') && !current) throw new Error('unknown finding trial');
      const currentDecision = current && 'decision' in current.trigger ? current.trigger as DecisionTrigger : null;
      const question: ScoreQuestion = args.flagValue('--question')
        ? JSON.parse(readFileSync(resolve(args.cwd, args.flagValue('--question')!), 'utf8'))
        : currentDecision?.decision.question ?? (() => { throw new Error('supply --question, or --trial-id of a decision-triggered trial'); })();
      const report = await recalibrate(dir, { provider: createDecisionProvider(config, { env: args.env }), providerName, model, question,
        maxFalseAlarmRate: args.optionalNumber('--max-false-alarm-rate') ?? undefined, maxMissRate: args.optionalNumber('--max-miss-rate') ?? undefined,
        timeoutMs: config.worker.timeoutMs });
      const previous = currentDecision?.decision.calibration;
      const comparable = Boolean(previous && previous.testHash === report.testHash);
      const worse = comparable && testScore(report.test) < testScore(previous!.heldOut);
      if (!args.hasFlag('--register')) return { ok: true, report, previous: previous ?? null, comparable, worse, registered: null };
      if (!current) throw new Error('--register needs --trial-id: the trial this calibration supersedes');
      if (!report.sufficient) throw new Error('refusing to register: fewer than 20 labelled positives or negatives in calibration or test');
      if (worse && !args.hasFlag('--accept-worse')) throw new Error('refusing to register: worse on the same test set than the current trial; pass --accept-worse to choose it anyway');
      const { hash: _hash, verifierFiles: _files, ...definition } = current as typeof current & { hash: string; verifierFiles: unknown };
      const trigger: DecisionTrigger = { toolName: current.trigger.toolName, result: 'failure', decision: { question, band: report.band,
        calibration: { provider: providerName, model, positives: report.calibration.positives, negatives: report.calibration.negatives,
          inputFormat: FAILURE_INPUT_FORMAT, testHash: report.testHash,
          heldOut: { caught: report.test.caught, positives: report.test.positives, falseAlarms: report.test.falseAlarms,
            negatives: report.test.negatives, undecided: report.test.undecided },
          evidence: `Recalibrated ${new Date().toISOString().slice(0, 10)}; test AUC ${report.test.auc.toFixed(3)} `
            + `[${report.test.aucInterval.map(x => x.toFixed(3)).join(', ')}]; labels ${JSON.stringify(report.labelSources)}.` } } };
      const registered = registerFindingTrial(store!, { ...definition, id: args.requiredFlag('--new-trial-id'), supersedes: current.id, trigger });
      return { ok: true, report, previous: previous ?? null, comparable, worse, registered: { id: args.requiredFlag('--new-trial-id'), hash: registered.hash } };
    } finally { store?.close(); }
  },
};
