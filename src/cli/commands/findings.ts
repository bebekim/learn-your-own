import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LessonStore } from '../../lyo/storage/lesson-store.ts';
import { resolveSessionLessonStorePath } from '../../lyo/selection/session-hook.ts';
import { inspectFinding, recordFindingFeedback, reviseFinding } from '../../lyo/selection/session-findings.ts';
import { registerFindingOpportunity, measureFindingOpportunity, withdrawFindingEvidence } from '../../lyo/selection/session-finding-evidence.ts';
import { reviewFindingSemantics } from '../../lyo/selection/session-finding-semantics.ts';
import { pendingFindingReviews } from '../../lyo/selection/session-finding-workflow.ts';
import { assignFindingOpportunity } from '../../lyo/selection/finding-opportunities.ts';
import { findingTrials, registerFindingTrial } from '../../lyo/selection/finding-trials.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const FINDING_COMMANDS: Record<string, CommandHandler> = {
  'finding inspect': findingCommand,
  'finding feedback': findingCommand,
  'finding revise': findingCommand,
  'finding register': findingCommand,
  'finding measure': findingCommand,
  'finding withdraw': findingCommand,
  'finding semantics': findingCommand,
  'finding pending': findingCommand,
  'finding assign': findingCommand,
  'finding trial-register': findingCommand,
  'finding trials': findingCommand,
};

function findingCommand(args: CommandArgs) {
  const storePath = args.flagValue('--store') ? resolve(args.cwd, args.flagValue('--store')!)
    : resolveSessionLessonStorePath(args.cwd);
  if (!storePath) throw new Error('no session finding store; supply --store');
  const store = new LessonStore(storePath);
  try {
    if (args.subcommand === 'trials') return { ok: true, trials: findingTrials(store.db) };
    if (args.subcommand === 'pending') return { ok: true, pending: pendingFindingReviews(store, args.hasFlag('--all') ? undefined : args.cwd) };
    if (args.subcommand === 'inspect') return { ok: true, finding: inspectFinding(store, args.requiredFlag('--finding-id')) };
    if (args.subcommand === 'measure') return { ok: true, evidence: measureFindingOpportunity(store, args.requiredFlag('--opportunity-id')) };
    if (args.subcommand === 'assign') return { ok: true, assignment: assignFindingOpportunity(store, args.requiredFlag('--opportunity-id')) };
    const input = JSON.parse(readFileSync(resolve(args.cwd, args.requiredFlag('--input')), 'utf8'));
    if (args.subcommand === 'trial-register') return { ok: true, trial: registerFindingTrial(store, input) };
    if (args.subcommand === 'semantics') return { ok: true, review: reviewFindingSemantics(store, input) };
    if (args.subcommand === 'register') return { ok: true, opportunity: registerFindingOpportunity(store, input) };
    if (args.subcommand === 'withdraw') return { ok: true, withdrawal: withdrawFindingEvidence(store, input) };
    return args.subcommand === 'feedback'
      ? { ok: true, feedback: recordFindingFeedback(store, input) }
      : { ok: true, revision: reviseFinding(store, input) };
  } finally { store.close(); }
}
