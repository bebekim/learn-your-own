Here's an executable CommonJS test suite for the `compareSemver` function, which you'll import from `./semver.cjs`. This suite covers all specified invariants, examples, and additional cases using the core numbers 4 and 14, as well as prerelease identifiers `beta.4` and `beta.14`.

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const compareSemver = require('./semver.cjs').compareSemver;

test('compareSemver', () => {
    // Invariants
    assert.strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
    assert.strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
    assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    assert.strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    assert.strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    assert.strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);

    // Equal precedence inputs
    assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
    assert.strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
    assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
    
    // Additional cases
    assert.strictEqual(compareSemver('4.0.0', '4.0.0'), 0);
    assert.strictEqual(compareSemver('4.0.0-beta.4', '4.0.0-beta.14'), -1);
    assert.strictEqual(compareSemver('4.0.0-beta.14', '4.0.0-beta.4'), 1);
    assert.strictEqual(compareSemver('4.0.0', '4.0.1'), -1);
    assert.strictEqual(compareSemver('4.1.0', '4.0.1'), 1);
    assert.strictEqual(compareSemver('14.0.0', '14.0.0'), 0);
    assert.strictEqual(compareSemver('14.0.0-alpha', '14.0.0'), -1);
    assert.strictEqual(compareSemver('14.0.0-alpha.1', '14.0.0-alpha.2'), -1);
    assert.strictEqual(compareSemver('14.0.0-alpha.2', '14.0.0-alpha.1'), 1);
    assert.strictEqual(compareSemver('14.0.0-alpha.1', '14.0.0-beta.1'), -1);
    assert.strictEqual(compareSemver('14.0.0-beta.1', '14.0.0-beta.2'), -1);
    assert.strictEqual(compareSemver('14.0.0-beta.2', '14.0.0-beta.1'), 1);
    assert.strictEqual(compareSemver('14.0.0+build.1', '14.0.0'), 0);
    assert.strictEqual(compareSemver('14.0.0+build.1', '14.0.0+build.2'), 0);
    assert.strictEqual(compareSemver('14.0.0+build.2', '14.0.0+build.1'), 0);
});
```

### Explanation:
- The test suite uses Node.js's built-in `node:test` module for structuring the tests and `node:assert` for assertions.
- Each test checks the expected output of the `compareSemver` function against various semver strings, covering all specified invariants and additional cases.
- The cases include comparisons of versions with and without prerelease identifiers, as well as examples that utilize the core numbers 4 and 14.
- This suite should be run in a Node.js environment where the `compareSemver` function is properly implemented and exported from `./semver.cjs`.