import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LessonStore } from '../../storage/lesson-store.ts';
import { inspectFinding, recordFindingFeedback, reviseFinding } from '../../interface/session-findings.ts';
import { registerFindingOpportunity, measureFindingOpportunity, withdrawFindingEvidence } from '../../interface/session-finding-evidence.ts';
import { reviewFindingSemantics } from '../../interface/session-finding-semantics.ts';
import { pendingFindingReviews } from '../../interface/session-finding-workflow.ts';
import { assignFindingOpportunity } from '../../interface/finding-opportunities.ts';
import { findingTrials, registerFindingTrial } from '../../interface/finding-trials.ts';
import { declareFinding } from '../../storage/finding-state.ts';
import { reconcileFindingTrial } from '../../interface/finding-trial-policy.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { cliLessonStorePath } from '../../storage/lyo-home.ts';

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
  'finding declare': findingCommand,
  'finding trials': findingCommand,
  'finding trial-report': findingCommand,
};

function findingCommand(args: CommandArgs) {
  const storePath = cliLessonStorePath(args.flagValue('--store'), args.cwd, args.env);
  const store = new LessonStore(storePath);
  try {
    if (args.subcommand === 'trials') return { ok: true, trials: findingTrials(store.db) };
    if (args.subcommand === 'trial-report') {
      const trial = findingTrials(store.db).find(trial => trial.id === args.requiredFlag('--trial-id'));
      if (!trial) throw new Error('unknown finding trial');
      return { ok: true, policy: reconcileFindingTrial(store, trial) };
    }
    if (args.subcommand === 'pending') return { ok: true, pending: pendingFindingReviews(store, args.hasFlag('--all') ? undefined : args.cwd) };
    if (args.subcommand === 'inspect') return { ok: true, finding: inspectFinding(store, args.requiredFlag('--finding-id')) };
    if (args.subcommand === 'measure') return { ok: true, evidence: measureFindingOpportunity(store, args.requiredFlag('--opportunity-id')) };
    if (args.subcommand === 'assign') return { ok: true, assignment: assignFindingOpportunity(store, args.requiredFlag('--opportunity-id')) };
    const input = JSON.parse(readFileSync(resolve(args.cwd, args.requiredFlag('--input')), 'utf8'));
    if (args.subcommand === 'trial-register') return { ok: true, trial: registerFindingTrial(store, input) };
    if (args.subcommand === 'declare') { const { id, ...finding } = input; return { ok: true, finding: declareFinding(store, id, finding) }; }
    if (args.subcommand === 'semantics') return { ok: true, review: reviewFindingSemantics(store, input) };
    if (args.subcommand === 'register') return { ok: true, opportunity: registerFindingOpportunity(store, input) };
    if (args.subcommand === 'withdraw') return { ok: true, withdrawal: withdrawFindingEvidence(store, input) };
    return args.subcommand === 'feedback'
      ? { ok: true, feedback: recordFindingFeedback(store, input) }
      : { ok: true, revision: reviseFinding(store, input) };
  } finally { store.close(); }
}
