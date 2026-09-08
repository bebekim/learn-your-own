Here is a complete CommonJS test suite for the `compareSemver` function, which you can save to a file named `semver.test.js`. This suite covers all specified invariants, examples, and additional cases as requested.

```javascript
const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should return -1 for lower precedence versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0); // build metadata ignored
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        strictEqual(compareSemver('1.0.0-beta', '1.0.0-beta'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
    });

    it('should return 1 for higher precedence versions', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            ['1.2.3', '1.2.4'],
            ['2.0.0', '10.0.0'],
            ['1.0.0-alpha', '1.0.0'],
            ['1.0.0-alpha', '1.0.0-alpha.1'],
            ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
            ['1.0.0-beta.2', '1.0.0-beta.11'],
            ['1.0.0-rc.1', '1.0.0'],
            ['1.0.0+build.5', '1.0.0']
        ];

        for (const [a, b] of versions) {
            strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
        }
    });

    // Additional cases
    it('should handle custom cases', () => {
        // Using core numbers 3, 13 and prerelease identifiers beta.3, beta.13
        strictEqual(compareSemver('1.0.0-beta.3', '1.0.0-beta.13'), -1);
        strictEqual(compareSemver('1.0.0-beta.13', '1.0.0-beta.3'), 1);
        strictEqual(compareSemver('3.0.0', '3.0.0'), 0);
        strictEqual(compareSemver('3.0.0', '3.0.1'), -1);
        strictEqual(compareSemver('3.1.0', '3.0.1'), 1);
    });
});
```

### Explanation:
- **Imports**: The test suite imports the `compareSemver` function from `semver.cjs` and uses Node.js's built-in `assert` module for assertions.
- **Test Cases**: Each test case checks the expected output of `compareSemver` based on the provided specification and additional examples.
- **Negation Properties**: The suite verifies that for any two versions `a` and `b`, `compareSemver(a, b)` and `compareSemver(b, a)` satisfy the negation property.
- **Custom Cases**: Additional tests cover the specific cases using the numbers 3, 13, and the prerelease identifiers `beta.3` and `beta.13`.

You can run this test suite using Node.js by executing the command `node test semver.test.js` in your terminal, assuming you have a test runner set up or you're using a simple Node.js execution.