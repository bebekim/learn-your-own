#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

const root = new URL('..', import.meta.url).pathname;
const outputDir = join(root, 'dist/npm/package/src');

mkdirSync(outputDir, { recursive: true });

for (const sourcePath of sourceFiles(join(root, 'src'))) {
  const relativePath = relative(join(root, 'src'), sourcePath);
  const source = readFileSync(sourcePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: relativePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2024,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      sourceMap: false,
    },
  });
  const output = result.outputText.replace(
    /from\s+(['"])(\.\.?\/[^'"]+)\.ts\1/g,
    'from $1$2.js$1'
  );
  const outputPath = join(outputDir, relativePath.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
  if (relativePath === 'cli.ts') chmodSync(outputPath, 0o755);
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files.sort();
}
