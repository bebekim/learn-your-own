export class CliArgs {
  readonly argv: string[];
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;

  constructor(
    argv: string[],
    env: NodeJS.ProcessEnv,
    cwd: string
  ) {
    this.argv = argv;
    this.env = env;
    this.cwd = cwd;
  }

  get command(): string | undefined {
    return this.argv[2];
  }

  get subcommand(): string | undefined {
    return this.argv[3];
  }

  get dbPath(): string {
    return this.flagValue('--db') ?? this.env.LEARNLOOP_DB ?? '.agent-learning/learning.sqlite';
  }

  get channel(): string | undefined {
    return this.flagValue('--channel') ?? this.env.LEARNLOOP_CHANNEL;
  }

  get promptDir(): string | undefined {
    return this.flagValue('--prompt-dir') ?? this.env.LEARNLOOP_PROMPT_DIR;
  }

  flagValue(name: string): string | undefined {
    const index = this.argv.indexOf(name);
    if (index === -1) return undefined;
    return this.argv[index + 1];
  }

  flagValues(name: string): string[] {
    const values: string[] = [];
    for (let index = 0; index < this.argv.length; index += 1) {
      if (this.argv[index] === name && this.argv[index + 1]) {
        values.push(this.argv[index + 1]);
      }
    }
    return values;
  }

  hasFlag(name: string): boolean {
    return this.argv.includes(name);
  }

  requiredFlag(name: string): string {
    const value = this.flagValue(name);
    if (!value) throw new Error(`missing required flag: ${name}`);
    return value;
  }

  optionalNumber(name: string): number | null {
    const value = this.flagValue(name);
    return value === undefined ? null : Number(value);
  }
}

export async function readStdin(input: AsyncIterable<string | Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
