import type { CommandClassification } from '../types/activation.ts';

const NPM_FAMILY_COMMANDS = new Set(['npm', 'npx', 'pnpm', 'yarn']);

const FAMILY_MAP: Record<string, string> = {
  kubectl: 'k8s',
};

const NPM_COMMAND_RULES: Array<{
  argvPatterns: string[];
  classification: CommandClassification;
}> = [
  { argvPatterns: ['test'], classification: 'test' },
  { argvPatterns: ['run lint', 'lint'], classification: 'lint' },
  { argvPatterns: ['run format', 'format'], classification: 'format' },
  { argvPatterns: ['run build', 'build'], classification: 'build' },
  { argvPatterns: ['install'], classification: 'package' },
];

const CLASSIFICATION_RULES: Array<{
  commandFamily: string[];
  argvPatterns: string[];
  classification: CommandClassification;
}> = [
  {
    commandFamily: ['npm', 'npx', 'pnpm', 'yarn'],
    argvPatterns: [],
    classification: 'unknown',
  },
  {
    commandFamily: ['git', 'gh'],
    argvPatterns: [],
    classification: 'git',
  },
  {
    commandFamily: ['docker'],
    argvPatterns: ['build'],
    classification: 'build',
  },
  {
    commandFamily: ['docker'],
    argvPatterns: ['push'],
    classification: 'deploy',
  },
  {
    commandFamily: ['kubectl', 'terraform', 'releasectl', 'gcloud'],
    argvPatterns: [],
    classification: 'deploy',
  },
  {
    commandFamily: ['pytest', 'vitest', 'jest'],
    argvPatterns: [],
    classification: 'test',
  },
  {
    commandFamily: ['tsc'],
    argvPatterns: [],
    classification: 'build',
  },
  {
    commandFamily: ['eslint'],
    argvPatterns: [],
    classification: 'lint',
  },
  {
    commandFamily: ['prettier'],
    argvPatterns: [],
    classification: 'format',
  },
  {
    commandFamily: ['sqlite3', 'psql'],
    argvPatterns: [],
    classification: 'database',
  },
  {
    commandFamily: ['aws'],
    argvPatterns: [],
    classification: 'cloud',
  },
  {
    commandFamily: ['ls', 'cat', 'grep', 'find'],
    argvPatterns: [],
    classification: 'inspect',
  },
  {
    commandFamily: ['node', 'vite'],
    argvPatterns: [],
    classification: 'local_dev',
  },
];

function matchesArgvPattern(pattern: string, argv: string): boolean {
  const regex = new RegExp(`(?<![-\\w])${pattern}\\b`, 'i');
  return regex.test(argv);
}

function extractPassthroughCommand(argv: string, prefix: string): string | null {
  const parts = argv.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() === prefix && parts[1]) {
    if (parts[1].toLowerCase() === 'exec' && parts[2]) {
      return parts[2].replace(/^["']|["']$/g, '');
    }
    return parts[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

export function classifyCommand(commandName: string, argv: string): CommandClassification {
  const normalizedCommand = commandName.toLowerCase();
  const normalizedArgv = argv.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.commandFamily.includes(normalizedCommand)) {
      if (rule.argvPatterns.length === 0) {
        // For npm-family commands, use special npm rules
        if (['npm', 'npx', 'pnpm', 'yarn'].includes(normalizedCommand)) {
          // For npx, extract the actual command and classify it
          if (normalizedCommand === 'npx') {
            const npxCommand = extractPassthroughCommand(argv, 'npx');
            if (npxCommand) {
              return classifyCommand(npxCommand, argv);
            }
          }
          // For pnpm exec <cmd>, extract and reclassify
          if (normalizedCommand === 'pnpm') {
            const pnpmCommand = extractPassthroughCommand(argv, 'pnpm');
            if (pnpmCommand && pnpmCommand !== 'run' && pnpmCommand !== 'exec') {
              return classifyCommand(pnpmCommand, argv);
            }
          }
          for (const npmRule of NPM_COMMAND_RULES) {
            for (const pattern of npmRule.argvPatterns) {
              if (matchesArgvPattern(pattern, normalizedArgv)) {
                return npmRule.classification;
              }
            }
          }
          return 'unknown';
        }
        return rule.classification;
      }
      for (const pattern of rule.argvPatterns) {
        if (matchesArgvPattern(pattern, normalizedArgv)) {
          return rule.classification;
        }
      }
    }
  }

  return 'unknown';
}

export function familyForCommand(commandName: string): string {
  const normalizedCommand = commandName.toLowerCase();

  if (NPM_FAMILY_COMMANDS.has(normalizedCommand)) {
    return 'npm';
  }

  return FAMILY_MAP[normalizedCommand] ?? normalizedCommand;
}
