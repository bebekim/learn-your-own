import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LessonStore } from '../../storage/lesson-store.ts';
import { resolveSessionLessonStorePath } from '../../selection/session-hook.ts';
import { createDecisionProvider, loadDecisionConfig } from '../../decisions/providers.ts';
import { openRouterGenerator } from '../../hypotheses/generator.ts';
import { acceptHypothesis, hypothesisMatches, listHypotheses, setHypothesisStatus } from '../../hypotheses/store.ts';
import { evaluateHypothesis, harvestHypothesis, proposeHypotheses, replayHypothesis } from '../../hypotheses/pipeline.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

function withStore<T>(args: CommandArgs, fn: (store: LessonStore) => T): T {
  const storePath = args.flagValue('--store') ? resolve(args.cwd, args.flagValue('--store')!) : resolveSessionLessonStorePath(args.cwd);
  if (!storePath) throw new Error('no lesson store; supply --store');
  const store = new LessonStore(storePath);
  try {
    const result = fn(store);
    if (result instanceof Promise) return result.finally(() => store.close()) as T;
    store.close();
    return result;
  } catch (error) { store.close(); throw error; }
}

function config(args: CommandArgs) {
  const loaded = loadDecisionConfig(args.env);
  if (!loaded) throw new Error('no decision config; create ~/.lyo/decisions.json (or set LYO_DECISIONS_FILE)');
  return loaded;
}

const date = (value: string | undefined, fallback: Date) => value ? new Date(value) : fallback;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

function summary(h: ReturnType<typeof listHypotheses>[number], db: LessonStore['db']) {
  const matches = hypothesisMatches(db, h.id);
  return { id: h.id, status: h.status, since: h.statusAt, situation: h.proposal.situation, advice: h.proposal.advice,
    rival: h.proposal.rival, predicted: h.proposal.predicted, examples: h.proposal.exampleIds.length,
    shadow: { live: matches.filter(m => m.mode === 'live').length, replay: matches.filter(m => m.mode === 'replay').length,
      matched: matches.filter(m => m.verdict === 'match').length } };
}

export const HYPOTHESIS_COMMANDS: Record<string, CommandHandler> = {
  'hypotheses propose': (args: CommandArgs) => {
    const cfg = config(args);
    if (!cfg.generator) throw new Error('no generator configured: add a "generator" section to the decision config');
    return withStore(args, async store => ({ ok: true, ...await proposeHypotheses(store, openRouterGenerator(cfg.generator!, { env: args.env }), {
      from: date(args.flagValue('--from'), daysAgo(30)), until: date(args.flagValue('--until'), new Date()),
      maxEpisodes: args.optionalNumber('--max-episodes') ?? cfg.generator!.maxEpisodes,
      maxProposals: args.optionalNumber('--max-proposals') ?? undefined }) }));
  },
  'hypotheses list': (args: CommandArgs) => withStore(args, store => ({ ok: true,
    hypotheses: listHypotheses(store.db).filter(h => !args.flagValue('--status') || h.status === args.flagValue('--status')).map(h => summary(h, store.db)) })),
  'hypotheses show': (args: CommandArgs) => withStore(args, store => {
    const h = listHypotheses(store.db).find(x => x.id === args.requiredFlag('--id'));
    if (!h) throw new Error('unknown hypothesis');
    return { ok: true, hypothesis: h };
  }),
  'hypotheses accept': (args: CommandArgs) => withStore(args, store => {
    acceptHypothesis(store, args.requiredFlag('--id'), config(args).generator?.maxShadowing ?? 5);
    return { ok: true, id: args.requiredFlag('--id'), status: 'shadowing' };
  }),
  'hypotheses retire': (args: CommandArgs) => withStore(args, store => {
    const status = args.hasFlag('--defeated') ? 'defeated' : 'retired';
    setHypothesisStatus(store, args.requiredFlag('--id'), status, args.flagValue('--reason') ?? 'retired by reviewer');
    return { ok: true, id: args.requiredFlag('--id'), status };
  }),
  'hypotheses replay': (args: CommandArgs) => {
    const cfg = config(args);
    return withStore(args, async store => ({ ok: true, ...await replayHypothesis(store, createDecisionProvider(cfg, { env: args.env }),
      args.requiredFlag('--id'), { from: date(args.flagValue('--from'), daysAgo(60)), until: date(args.flagValue('--until'), new Date()),
        timeoutMs: cfg.worker.timeoutMs, minDecided: args.optionalNumber('--min-decided') ?? undefined }) }));
  },
  'hypotheses evaluate': (args: CommandArgs) => withStore(args, store => ({ ok: true,
    evaluation: evaluateHypothesis(store, args.requiredFlag('--id'), { windowDays: args.optionalNumber('--window-days') ?? undefined,
      minDecided: args.optionalNumber('--min-decided') ?? undefined }) })),
  'hypotheses harvest': (args: CommandArgs) => withStore(args, store => {
    const id = args.requiredFlag('--id');
    const out = args.flagValue('--out') ?? join(homedir(), '.lyo', 'decision-cases', id.replace(/[^A-Za-z0-9_.-]/g, '_'), 'harvest');
    return { ok: true, ...harvestHypothesis(store, id, out) };
  }),
};
