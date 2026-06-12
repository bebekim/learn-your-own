import type { CommandClassification, CommandStatus } from '../../types/activation.ts';
import type { OperationKind, ResourceRef } from '../syntax.ts';

export interface PreOperationCommandResourceInput {
  commandClassification: CommandClassification;
  commandStatus: CommandStatus;
  argv: string;
  argvSummary: string;
  readResources: ResourceRef[];
  writtenResources: ResourceRef[];
  isPackageRegistryInspect: boolean;
  isPackagePublish: boolean;
  isDockerComposeMutation: boolean;
}

export interface PreOperationCommandResourceInference {
  read: ResourceRef[];
  written: ResourceRef[];
  parsedPaths: string[];
}

export interface FinalCommandResourceInput {
  read: ResourceRef[];
  written: ResourceRef[];
  operation: OperationKind;
  parsedPaths: string[];
}

export function inferPreOperationCommandResources(
  input: PreOperationCommandResourceInput
): PreOperationCommandResourceInference {
  const normalizedArgv = input.argv.toLowerCase();
  const read = [...input.readResources];
  const written = [...input.writtenResources];
  const parsedPaths = extractPathsFromCommand(input.argv);

  if (
    input.commandClassification === 'git' ||
    /^(git status|git diff|git log|git show|git)\b/.test(normalizedArgv)
  ) {
    read.push({ type: 'local_repo', ref: '.' });
  }

  if (
    input.commandClassification === 'deploy' ||
    input.commandClassification === 'cloud' ||
    /^(databricks|railway|aws|gcloud|kubectl)\b/.test(normalizedArgv)
  ) {
    if (input.commandStatus === 'succeeded' || input.commandStatus === 'attempted') {
      let ref = 'deployment';
      const match = input.argvSummary.toLowerCase().match(/\b(databricks|railway|aws|gcloud|kubectl)\b/);
      if (match) {
        ref = match[1];
      }
      written.push({ type: 'external_resource', ref });
    }
  }

  if (input.isPackageRegistryInspect) {
    read.push({ type: 'external_resource', ref: 'package_registry' });
  }
  if (input.isPackagePublish) {
    written.push({ type: 'external_resource', ref: 'package_registry' });
  }
  if (input.isDockerComposeMutation) {
    written.push({ type: 'local_cache', ref: 'docker' });
  }

  return { read, written, parsedPaths };
}

export function finalizeCommandResources(input: FinalCommandResourceInput): {
  read: ResourceRef[];
  written: ResourceRef[];
} {
  const read = [...input.read];
  const written = [...input.written];

  if (input.operation === 'verify' || input.operation === 'build') {
    if (!read.some(r => r.type === 'local_repo' && r.ref === '.')) {
      read.push({ type: 'local_repo', ref: '.' });
    }
  }

  for (const path of input.parsedPaths) {
    const res: ResourceRef = { type: 'local_file', ref: path };
    if (input.operation === 'mutate_local') {
      if (!written.some(w => w.ref === path)) written.push(res);
    } else if (input.operation === 'observe') {
      if (!read.some(r => r.ref === path)) read.push(res);
    }
  }

  if (input.operation === 'mutate_local' && written.length === 0) {
    written.push({ type: 'local_repo', ref: '.' });
  }

  return { read, written };
}

function extractPathsFromCommand(command: string): string[] {
  const paths: string[] = [];
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i].replace(/^["']|["']$/g, '').trim();
    if (token.startsWith('-')) continue;
    if (
      token.includes('/') ||
      /\.[a-zA-Z0-9]+$/.test(token) ||
      ['src', 'tests', 'lib', 'dist'].includes(token)
    ) {
      paths.push(token.replace(/^\.\//, '').replace(/\/$/, ''));
    }
  }
  return paths;
}
