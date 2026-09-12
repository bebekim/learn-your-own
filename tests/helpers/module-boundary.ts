import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

export function runWithoutModule(forbidden: URL, code: string): void {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      assert.notEqual(resolved.url, ${JSON.stringify(forbidden.href)}, 'outer module must not load');
      return resolved;
    } });
    ${code}
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
