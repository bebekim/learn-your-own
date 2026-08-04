import { cpSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

export interface FileBlock {
  path: string;
  content: string;
}

const GENERIC_BLOCK_PATTERN = /```([^\n]*)\n([\s\S]*?)```/g;
const INFO_PATH_PATTERN = /\bpath=([^\s`]+)/;
const DECLARATION_PATTERN = /^path=([^\s`]+)$/;
// A bare relative path with an extension, e.g. generated/src/csv-line.js.
const FIRST_LINE_PATH_PATTERN = /^[a-z0-9_][a-z0-9_./-]*\.[a-z0-9]+$/i;

export type BlockFormatKind =
  | 'info-tag'
  | 'declaration-pair'
  | 'first-line-path-tag'
  | 'first-line-bare-path';

export interface BlockFormatRule {
  id: string;
  kind: BlockFormatKind;
  summary: string;
  evidence: string;
}

export interface BlockFormatsArtifact {
  version: string;
  rules: BlockFormatRule[];
}

/**
 * The four formats models have actually emitted, as an ordered, versioned,
 * evidence-carrying ruleset. New formats become new rules in the artifact
 * (src/runner/block-formats.json), not new code — T-improvement by data.
 */
export const DEFAULT_BLOCK_FORMAT_RULES: BlockFormatRule[] = [
  { id: 'info-path-tag', kind: 'info-tag', summary: '', evidence: '' },
  { id: 'declaration-pair', kind: 'declaration-pair', summary: '', evidence: '' },
  { id: 'first-line-path-tag', kind: 'first-line-path-tag', summary: '', evidence: '' },
  { id: 'first-line-bare-path', kind: 'first-line-bare-path', summary: '', evidence: '' },
];

export function loadBlockFormats(path: string): BlockFormatsArtifact {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as BlockFormatsArtifact;
  if (typeof parsed.version !== 'string' || !Array.isArray(parsed.rules)) {
    throw new Error(`invalid block-formats artifact: ${path}`);
  }
  return parsed;
}

export function parseFileBlocks(
  text: string,
  rules: BlockFormatRule[] = DEFAULT_BLOCK_FORMAT_RULES
): FileBlock[] {
  const raw = Array.from(text.matchAll(GENERIC_BLOCK_PATTERN)).map((match) => ({
    info: match[1],
    content: match[2],
  }));
  const blocks: FileBlock[] = [];
  for (let index = 0; index < raw.length; index++) {
    const { info, content } = raw[index];
    const lines = content.split('\n');
    const first = lines[0]?.trim() ?? '';
    for (const rule of rules) {
      if (rule.kind === 'info-tag') {
        const match = info.match(INFO_PATH_PATTERN);
        if (match) {
          blocks.push({ path: match[1], content });
          break;
        }
      } else if (rule.kind === 'declaration-pair') {
        const match = content.trim().match(DECLARATION_PATTERN);
        if (match && index + 1 < raw.length) {
          blocks.push({ path: match[1], content: raw[index + 1].content });
          index++;
          break;
        }
      } else if (rule.kind === 'first-line-path-tag') {
        const match = first.match(DECLARATION_PATTERN);
        if (match) {
          blocks.push({ path: match[1], content: lines.slice(1).join('\n') });
          break;
        }
      } else if (rule.kind === 'first-line-bare-path') {
        if (FIRST_LINE_PATH_PATTERN.test(first)) {
          blocks.push({ path: first, content: lines.slice(1).join('\n') });
          break;
        }
      }
    }
  }
  return blocks;
}

/**
 * Keep only file blocks whose path sits under a declared write prefix.
 * Absolute paths and `..` traversal are always rejected.
 */
export function filterDeclaredWrites(
  files: FileBlock[],
  writePaths: string[]
): { accepted: FileBlock[]; rejected: FileBlock[] } {
  const accepted: FileBlock[] = [];
  const rejected: FileBlock[] = [];
  for (const file of files) {
    const normalized = normalize(file.path);
    const safe =
      !file.path.startsWith('/') &&
      !normalized.startsWith('..') &&
      writePaths.some((writePath) => {
        const prefix = normalize(writePath);
        return normalized === prefix || normalized.startsWith(prefix + sep);
      });
    (safe ? accepted : rejected).push(file);
  }
  return { accepted, rejected };
}

/**
 * Copy declared read paths (files or directories) from sourceRoot into
 * sandboxDir, preserving relative paths. Returns the copied file list.
 * The sandbox contains ONLY these paths — that is the blindness boundary.
 */
export function materializeSandbox({
  sourceRoot,
  sandboxDir,
  readPaths,
}: {
  sourceRoot: string;
  sandboxDir: string;
  readPaths: string[];
}): string[] {
  const copied: string[] = [];
  for (const readPath of readPaths) {
    const source = join(sourceRoot, readPath);
    const target = join(sandboxDir, readPath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
    if (statSync(target).isDirectory()) {
      copied.push(...collectFiles(target).map((entry) => join(readPath, entry)));
    } else {
      copied.push(readPath);
    }
  }
  return copied.sort();
}

/** Walk a directory tree into sorted relative file paths (posix separators). */
export function collectFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(current, entry.name), relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };
  walk(dir, '');
  return files.sort();
}
