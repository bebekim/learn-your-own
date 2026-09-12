import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

test('LYO runtime dependencies have no cycles', () => assertAcyclic(true));
test('LYO source dependencies have no cycles, including type imports', () => assertAcyclic(false));

function assertAcyclic(runtimeOnly: boolean) {
  const visited = new Set<string>();
  function visit(file: string, ancestors: string[]) {
    assert.equal(ancestors.includes(file), false,
      `dependency cycle: ${[...ancestors, file].map(file => relative(SRC, file)).join(' → ')}`);
    if (visited.has(file)) return;
    for (const ref of moduleReferences(file, runtimeOnly).filter(ref => ref.startsWith('.'))) {
      visit(resolve(dirname(file), ref), [...ancestors, file]);
    }
    visited.add(file);
  }
  for (const file of sourceFiles(join(SRC, 'lyo'))) visit(file, []);
}

test('finding domain dependencies stay inside the domain, including type imports', () => {
  const domain = join(SRC, 'lyo', 'domain');
  for (const file of sourceFiles(domain)) {
    for (const ref of moduleReferences(file)) {
      assert.ok(ref.startsWith('.') && resolve(dirname(file), ref).startsWith(`${domain}/`),
        `domain depends on an outer module: ${relative(SRC, file)} → ${ref}`);
    }
  }
});

test('application dependencies point inward, including type imports', () => {
  for (const file of sourceFiles(join(SRC, 'lyo', 'application'))) {
    for (const ref of moduleReferences(file)) {
      if (ref === 'zod') continue; // Pure validation library; no host or persistence adapter.
      const target = resolve(dirname(file), ref);
      assert.ok(ref.startsWith('.') && ['lyo/application/', 'lyo/domain/'].some(prefix => relative(SRC, target).startsWith(prefix)),
        `application depends on an outer module: ${relative(SRC, file)} → ${ref}`);
    }
  }
});

test('retained finding evidence reads do not depend on selection, hooks or evaluators', () => {
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const ref of moduleReferences(file)) {
      if (!ref.startsWith('.')) {
        assert.ok(['node:sqlite', 'node:crypto', 'node:fs', 'zod'].includes(ref), `unexpected evidence dependency: ${ref}`);
        continue;
      }
      const target = resolve(dirname(file), ref);
      assert.ok(['lyo/storage/', 'lyo/domain/', 'contract/'].some(prefix => relative(SRC, target).startsWith(prefix)),
        `evidence reader depends on an outer workflow: ${relative(SRC, file)} → ${ref}`);
      visit(target);
    }
  }
  visit(join(SRC, 'lyo', 'storage', 'finding-evidence.ts'));
});

function moduleReferences(file: string, runtimeOnly = false): string[] {
  const source = readFileSync(file, 'utf8');
  const code = runtimeOnly ? stripTypeScriptTypes(source) : source;
  return ts.preProcessFile(code, true, true).importedFiles.map(ref => ref.fileName);
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => join(entry.parentPath, entry.name));
}
