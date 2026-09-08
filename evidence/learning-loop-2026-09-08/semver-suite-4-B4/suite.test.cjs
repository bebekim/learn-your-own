Here's an executable CommonJS Node.js test suite for the `compareSemver` function, which you would import from `./semver.cjs`. This suite covers various invariants, examples, and custom cases as specified. 

```javascript
// semver.test.js
const { strictEqual, deepStrictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

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
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.5'), 0);
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

    // Edge cases
    it('should handle prerelease identifiers correctly', () => {
        strictEqual(compareSemver('1.0.0-beta.6', '1.0.0-beta.16'), -1);
        strictEqual(compareSemver('1.0.0-beta.16', '1.0.0-beta.6'), 1);
        strictEqual(compareSemver('1.0.0-beta.10', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.alpha'), -1);
        strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.1'), 1);
    });

    it('should handle different lengths of prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0+build.5'), -1);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.1',
            '1.0.0-beta.10',
            '1.0.0-rc.1',
            '1.0.0+build.5'
        ];

        versions.forEach(a => {
            versions.forEach(b => {
                const result = compareSemver(a, b);
                strictEqual(result + compareSemver(b, a), 0);
            });
        });
    });
});
```

### Instructions to Run
1. Save the above code in a file named `semver.test.js`.
2. Ensure you have Node.js installed.
3. Run the test suite using the command:
   ```bash
   node -r assert/semver.test.js
   ```
This will execute the tests and confirm that the `compareSemver` function behaves as expected according to the provided specifications.