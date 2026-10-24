import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandArgs, CommandHandler } from './context.ts';
import { typedDecisionProviderFromEnv } from '../../decisions/jev.ts';
import { calibrateTypedQuestions } from '../../decisions/calibrate.ts';

function provider(args: CommandArgs) {
  const envFile = args.flagValue('--env-file');
  // loadEnvFile sets only variables that are not already set.
  if (envFile) process.loadEnvFile(resolve(args.cwd, envFile));
  const configured = typedDecisionProviderFromEnv(envFile ? { ...process.env, ...args.env } : args.env);
  if (!configured) throw new Error('set TYPESAFE_API_KEY (or pass --env-file) to use typed decisions');
  return configured;
}

export const DECIDE_COMMANDS: Record<string, CommandHandler> = {
  'decide models': async (args: CommandArgs) => ({ ok: true, models: await provider(args).models() }),
  'decide calibrate': async (args: CommandArgs) => ({ ok: true, ...await calibrateTypedQuestions(provider(args), {
    casesPath: resolve(args.cwd, args.requiredFlag('--cases')), questionsPath: resolve(args.cwd, args.requiredFlag('--questions')),
    outPath: resolve(args.cwd, args.requiredFlag('--out')),
    concurrency: args.flagValue('--concurrency') ? Number(args.flagValue('--concurrency')) : undefined }) }),
  decide: async (args: CommandArgs) => {
    const request = JSON.parse(readFileSync(resolve(args.cwd, args.requiredFlag('--input')), 'utf8'));
    return { ok: true, decision: await provider(args).decide(request) };
  },
};
