Here's an executable CommonJS test suite for the `compareSemver` function, which you can save in a file named `semver.test.js`. This suite includes various test cases to cover all the invariants, examples, and additional cases as specified.

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
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
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
    it('should handle multi-digit numeric identifiers in prerelease', () => {
        strictEqual(compareSemver('1.0.0-beta.5', '1.0.0-beta.15'), -1);
        strictEqual(compareSemver('1.0.0-beta.15', '1.0.0-beta.5'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.alpha'), -1);
        strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.1'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
    });

    // Custom cases using core numbers
    it('should compare custom versions', () => {
        strictEqual(compareSemver('5.0.0', '15.0.0'), -1);
        strictEqual(compareSemver('15.0.0', '5.0.0'), 1);
        strictEqual(compareSemver('5.0.0-beta.5', '5.0.0-beta.15'), -1);
        strictEqual(compareSemver('5.0.0-beta.15', '5.0.0-beta.5'), 1);
    });

    // Symmetry and reflexivity
    it('should satisfy symmetry and reflexivity', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0', '2.0.0'), -1);
        strictEqual(compareSemver('2.0.0', '1.0.0'), 1);
    });
});
```

### Instructions to Run the Test Suite
1. Ensure you have Node.js installed on your machine.
2. Save the above code in a file named `semver.test.js`.
3. Make sure your `compareSemver` function is properly exported from `semver.cjs`.
4. Run the test suite using the command:
   ```bash
   node -r test runner.js semver.test.js
   ```
5. Check the output for any failed tests and correct the implementation as necessary.