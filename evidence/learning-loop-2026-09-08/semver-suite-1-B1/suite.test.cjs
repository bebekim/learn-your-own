Here's an executable CommonJS Node.js test suite for the `compareSemver` function, which you can import from `./semver.cjs`. This suite covers all invariants, examples, and additional cases as specified.

```javascript
// semver.test.js
const { test, expect } = require('node:test');
const { compareSemver } = require('./semver.cjs');

test('compareSemver function', () => {
    // Examples from the specification
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('2.0.0', '10.0.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0+build.5', '1.0.0')).toBe(0);

    // Edge cases
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1')).toBe(0);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1')).toBe(1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1.0', '1.0.0-alpha.1')).toBe(1);

    // Mixed numeric and alphanumeric prerelease identifiers
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(1);

    // Multi-digit numeric identifiers in prerelease
    expect(compareSemver('1.0.0-beta.3', '1.0.0-beta.13')).toBe(-1);
    expect(compareSemver('1.0.0-beta.13', '1.0.0-beta.3')).toBe(1);

    // Equal precedence inputs
    expect(compareSemver('3.0.0', '3.0.0')).toBe(0);
    expect(compareSemver('3.0.0', '3.0.0+build.1')).toBe(0);
    expect(compareSemver('3.0.0+build.1', '3.0.0')).toBe(0);

    // Different orders
    expect(compareSemver('3.0.0', '3.0.1')).toBe(-1);
    expect(compareSemver('3.1.0', '3.0.0')).toBe(1);
    expect(compareSemver('3.0.0', '2.9.9')).toBe(1);
    expect(compareSemver('2.9.9', '3.0.0')).toBe(-1);
});
```

### Explanation:
1. **Basic Examples**: The test suite includes the basic examples provided in the specification, ensuring that the function behaves as expected.
2. **Edge Cases**: Various edge cases related to equality, mixed identifiers, and length of prerelease identifiers are tested.
3. **Multi-Digit Identifiers**: Tests for multi-digit numeric identifiers in prerelease versions are included.
4. **Equal Precedence**: Cases where versions are equal or differ only by build metadata are also covered.
5. **Different Orders**: The suite tests the precedence between different versions to ensure the function adheres to the specified rules.

You can run this test suite using Node.js by executing the command:
```bash
node --test semver.test.js
```

Make sure that you have the `compareSemver` function correctly implemented in `semver.cjs` for the tests to pass.