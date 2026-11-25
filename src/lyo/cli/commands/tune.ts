import type { CommandArgs, CommandHandler } from './context.ts';
import { tune } from '../../config/diagnostics.ts';
import { loadTuning, lyoConfigPath } from '../../config/tuning.ts';

export const TUNE_COMMANDS: Record<string, CommandHandler> = {
  /** Measure this machine and suggest settings; `--apply` writes LYO's own config files (backed up). */
  tune: async (args: CommandArgs) => {
    if (args.hasFlag('--show')) return { ok: true, config: lyoConfigPath(args.env), tuning: loadTuning(args.env) };
    if (!args.hasFlag('--from-install')) return tune({ env: args.env, cwd: args.cwd, quick: args.hasFlag('--quick'), apply: args.hasFlag('--apply') });
    // Install hook: quick, never writes settings, never fails the install, only for global installs.
    if (args.env.npm_config_global !== 'true' || args.env.CI || args.env.LYO_SKIP_TUNE === '1') return { ok: true, skipped: true };
    try { const r = await tune({ env: args.env, cwd: args.cwd, quick: true, fromInstall: true }); return { ok: true, suggestions: r.suggestions.length }; }
    catch (error) { return { ok: true, skipped: true, reason: error instanceof Error ? error.message : String(error) }; }
  },
};
