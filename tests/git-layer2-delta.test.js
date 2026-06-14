import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzePythonLayer2Delta } from '../src/corpus/git-layer2.ts';

test('python layer 2 separates lexical cues from localized structural body changes', () => {
  const before = [
    'def accepts(fp):',
    '    if enabled:  # type: ignore[reportPrivateUsage]',
    '        return fp.read()',
    '    return None',
    '',
  ].join('\n');
  const after = [
    'def accepts(fp):',
    '    # invert the local branch without changing the function inventory',
    '    if not enabled:',
    '        return fp.read()',
    '    return None',
    '',
  ].join('\n');
  const patch = [
    'diff --git a/src/requests/models.py b/src/requests/models.py',
    '--- a/src/requests/models.py',
    '+++ b/src/requests/models.py',
    '@@ -1,4 +1,5 @@',
    ' def accepts(fp):',
    '-    if enabled:  # type: ignore[reportPrivateUsage]',
    '+    # invert the local branch without changing the function inventory',
    '+    if not enabled:',
    '         return fp.read()',
    '     return None',
    '',
  ].join('\n');

  const report = analyzePythonLayer2Delta({
    path: 'src/requests/models.py',
    before,
    after,
    patch,
  });

  assert.equal(report.parse.beforeOk, true);
  assert.equal(report.parse.afterOk, true);
  assert.equal(report.sublayers.lexical.covered, true);
  assert.equal(report.sublayers.wholeStructure.covered, false);
  assert.equal(report.sublayers.localizedStructure.covered, true);
  assert.equal(report.coverage.anyLayer2, true);
  assert.equal(report.leakage.length, 1);
  assert.equal(report.leakage[0].kind, 'whole_structure_silent_localized_change');

  assert.ok(report.sublayers.lexical.observations.some((observation) => (
    observation.kind === 'line:comment_added'
  )));
  assert.ok(report.sublayers.lexical.observations.some((observation) => (
    observation.kind === 'line:identifier_removed' && observation.value === 'type'
  )));
  assert.ok(report.sublayers.lexical.observations.some((observation) => (
    observation.kind === 'line:conditional_added'
  )));
  assert.ok(report.sublayers.localizedStructure.observations.some((observation) => (
    observation.kind === 'structure:function_body_changed' && observation.value === 'accepts'
  )));

  assert.equal(
    report.sublayers.lexical.observations.some((observation) => observation.kind === 'semantic:error_path_added'),
    false
  );
});

test('python layer 2 lexical observations are scoped to the requested patch path', () => {
  const patch = [
    'diff --git a/src/requests/models.py b/src/requests/models.py',
    '--- a/src/requests/models.py',
    '+++ b/src/requests/models.py',
    '@@ -1,0 +1,2 @@',
    '+def has_read(obj):',
    '+    return hasattr(obj, "read")',
    'diff --git a/tests/test_requests.py b/tests/test_requests.py',
    '--- a/tests/test_requests.py',
    '+++ b/tests/test_requests.py',
    '@@ -1,0 +1,2 @@',
    '+def test_proxy():',
    '+    assert True',
    '',
  ].join('\n');

  const report = analyzePythonLayer2Delta({
    path: 'tests/test_requests.py',
    before: '',
    after: [
      'def test_proxy():',
      '    assert True',
      '',
    ].join('\n'),
    patch,
  });

  assert.equal(
    report.sublayers.lexical.observations.some((observation) => observation.value === 'has_read'),
    false
  );
  assert.equal(
    report.sublayers.lexical.observations.some((observation) => observation.value === 'test_proxy'),
    true
  );
});
