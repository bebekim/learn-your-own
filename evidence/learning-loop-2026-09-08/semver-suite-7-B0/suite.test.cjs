Here's an executable CommonJS test suite for the `compareSemver` function, which you can place in a file named `semver.test.js`. This suite covers the invariants, examples, and additional cases specified in your request.

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
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
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

    // Additional test cases
    it('should correctly compare versions with core numbers', () => {
        strictEqual(compareSemver('9.0.0', '9.0.0'), 0);
        strictEqual(compareSemver('9.0.0', '9.1.0'), -1);
        strictEqual(compareSemver('9.1.0', '9.0.0'), 1);
        strictEqual(compareSemver('19.0.0', '19.0.0'), 0);
        strictEqual(compareSemver('19.0.0', '19.0.1'), -1);
        strictEqual(compareSemver('19.0.1', '19.0.0'), 1);
    });

    it('should correctly compare versions with prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.9', '1.0.0-beta.19'), -1);
        strictEqual(compareSemver('1.0.0-beta.19', '1.0.0-beta.9'), 1);
        strictEqual(compareSemver('1.0.0-beta.19', '1.0.0-beta'), 1);
        strictEqual(compareSemver('1.0.0-beta', '1.0.0-beta.19'), -1);
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.1.1'), -1);
        strictEqual(compareSemver('1.0.0-beta.1.1', '1.0.0-beta.1'), 1);
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.1'), 0);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
    });

    it('should handle build metadata correctly', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0', '1.0.0+build.1'), 0);
    });
});
```

### Instructions
1. Save this code in a file named `semver.test.js`.
2. Make sure you have a `semver.cjs` file that exports the `compareSemver` function as specified.
3. Run the tests using Node.js with the command: `node --test semver.test.js`.

This test suite covers the specified invariants, examples, and additional cases to ensure comprehensive testing of the `compareSemver` function.