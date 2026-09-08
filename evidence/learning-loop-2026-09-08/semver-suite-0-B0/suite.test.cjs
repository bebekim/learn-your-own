Here is a complete CommonJS test suite for the `compareSemver` function, which you can save as `semver.test.js`. This suite covers all specified invariants, examples, and additional cases, including the core numbers 2, 12, and prerelease identifiers `beta.2` and `beta.12`.

```javascript
// semver.test.js
const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should return -1 for lower precedence', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
    });

    it('should return 1 for higher precedence', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
    });

    // Edge cases
    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.alpha'), -1);
        strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.2'), 1);
    });

    it('should handle prerelease identifiers of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Custom cases
    it('should handle core numbers 2 and 12 with prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.12'), -1);
        strictEqual(compareSemver('1.0.0-beta.12', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('2.0.0', '2.0.0-beta.2'), 1);
        strictEqual(compareSemver('2.0.0-beta.2', '2.0.0-beta.12'), -1);
    });
});
```

### How to Run the Tests
1. Ensure you have Node.js installed.
2. Save the above code in a file named `semver.test.js`.
3. Make sure your `compareSemver` function is correctly implemented and exported in `semver.cjs`.
4. Run the tests using the Node.js testing framework by executing the following command in your terminal:

```bash
node -e "require('node:test').run();"
```

This will execute the test suite and report the results, ensuring that your `compareSemver` function behaves as expected according to the provided specifications.