import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

export interface FileBlock {
  path: string;
  content: string;
}

const GENERIC_BLOCK_PATTERN = /```([^\n]*)\n([\s\S]*?)```/g;
const INFO_PATH_PATTERN = /\bpath=([^\s`]+)/;
const DECLARATION_PATTERN = /^path=([^\s`]+)$/;
// A bare relative path with an extension, e.g. generated/src/csv-line.js —
// the fallback format some models use instead of a path= info tag.
const FIRST_LINE_PATH_PATTERN = /^[a-z0-9_][a-z0-9_./-]*\.[a-z0-9]+$/i;

/**
 * Extract fenced code blocks carrying a file path from model output. Models
 * emit three formats, all accepted:
 *  1. `path=<p>` tag in the block's info string, code in the same block
 *  2. a bare path as the first line inside the fence
 *  3. a block that only declares `path=<p>`, code in the NEXT block
 * The runner applies filterDeclaredWrites before anything touches disk.
 */
export function parseFileBlocks(text: string): FileBlock[] {
  const raw = Array.from(text.matchAll(GENERIC_BLOCK_PATTERN)).map((match) => ({
    info: match[1],
    content: match[2],
  }));
  const blocks: FileBlock[] = [];
  for (let index = 0; index < raw.length; index++) {
    const { info, content } = raw[index];
    const infoPath = info.match(INFO_PATH_PATTERN);
    if (infoPath) {
      blocks.push({ path: infoPath[1], content });
      continue;
    }
    const declaration = content.trim().match(DECLARATION_PATTERN);
    if (declaration && index + 1 < raw.length) {
      blocks.push({ path: declaration[1], content: raw[index + 1].content });
      index++;
      continue;
    }
    const lines = content.split('\n');
    const first = lines[0]?.trim() ?? '';
    const firstLinePathTag = first.match(DECLARATION_PATTERN);
    if (firstLinePathTag) {
      blocks.push({ path: firstLinePathTag[1], content: lines.slice(1).join('\n') });
      continue;
    }
    if (FIRST_LINE_PATH_PATTERN.test(first)) {
      blocks.push({ path: first, content: lines.slice(1).join('\n') });
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
