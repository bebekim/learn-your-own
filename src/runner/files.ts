import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

export interface FileBlock {
  path: string;
  content: string;
}

const FILE_BLOCK_PATTERN = /```[^\n]*\bpath=([^\s`]+)[^\n]*\n([\s\S]*?)```/g;

/**
 * Extract fenced code blocks tagged with `path=<relative-path>` from model
 * output. Single-shot API stages (no tools) return files this way; the runner
 * then applies filterDeclaredWrites before anything touches disk.
 */
export function parseFileBlocks(text: string): FileBlock[] {
  const blocks: FileBlock[] = [];
  for (const match of text.matchAll(FILE_BLOCK_PATTERN)) {
    blocks.push({ path: match[1], content: match[2] });
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
