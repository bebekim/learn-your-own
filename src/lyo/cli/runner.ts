import { CliArgs } from './args.ts';
import { runCommand } from './commands.ts';
import {
  printJson,
  usage,
} from './output.ts';

export async function runCli(
  argv = process.argv,
  env = process.env,
  cwd = process.cwd(),
  stdin: AsyncIterable<string | Buffer> = process.stdin
): Promise<void> {
  const args = new CliArgs(argv, env, cwd);

  try {
    if (!args.command || args.command === '--help' || args.command === '-h') {
      usage(0);
    }

    const result = await runCommand(args, stdin);
    if (args.command === 'eval' && args.subcommand === 'matrix' && typeof result === 'string') console.log(result);
    else printJson(result);
  } catch (error) {
    printJson({
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
    process.exit(1);
  }
}
