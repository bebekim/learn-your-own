#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const root = new URL('..', import.meta.url).pathname;
const outputDir = join(root, 'dist/npm/package/src');

mkdirSync(outputDir, { recursive: true });

for (const file of ['index.ts', 'cli.ts']) {
  const source = readFileSync(join(root, 'src', file), 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2024,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      sourceMap: false,
    },
  });
  const output = result.outputText.replace(
    /from\s+(['"])(\.\/[^'"]+)\.ts\1/g,
    'from $1$2.js$1'
  );
  const outputPath = join(outputDir, file.replace(/\.ts$/, '.js'));
  writeFileSync(outputPath, output);
  if (file === 'cli.ts') chmodSync(outputPath, 0o755);
}
