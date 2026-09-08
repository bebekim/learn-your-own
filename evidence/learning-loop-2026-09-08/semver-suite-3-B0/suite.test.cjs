Here's a CommonJS Node.js test suite for the `compareSemver` function, which you can save as `semver.test.js`. This suite covers various invariants, examples, and additional test cases as specified.

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
        strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1'), 0);
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

    // Additional test cases
    it('should handle core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('5.0.0', '5.0.0'), 0);
        strictEqual(compareSemver('5.0.0-beta.5', '5.0.0-beta.15'), -1);
        strictEqual(compareSemver('5.0.0-beta.15', '5.0.0-beta.5'), 1);
        strictEqual(compareSemver('15.0.0', '5.0.0'), 1);
        strictEqual(compareSemver('5.0.0-beta.5', '5.0.0'), -1);
        strictEqual(compareSemver('5.0.0+build.1', '5.0.0+build.2'), 0);
        strictEqual(compareSemver('5.0.0-alpha', '5.0.0-alpha.1'), -1);
        strictEqual(compareSemver('5.0.0-alpha.1', '5.0.0-alpha'), 1);
    });

    // Edge cases
    it('should handle edge cases correctly', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-1'), -1);
    });

    // Symmetry and reflexivity checks
    it('should satisfy symmetry and reflexivity', () => {
        strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
    });
});
```

### Explanation:
- Each `it` block contains tests for specific behaviors of the `compareSemver` function, ensuring that it adheres to the specified invariants and constraints.
- The tests cover both lower and higher precedence cases, equal cases, and additional test cases involving the core numbers and prerelease identifiers.
- Edge cases are also included to ensure robustness.
- The symmetry and reflexivity checks confirm that the function behaves correctly when comparing the same versions or their inverses. 

You can run this test suite using Node.js by executing the following command in your terminal:

```bash
node test semver.test.js
``` 

Make sure you have a testing framework like Mocha installed, as the above code assumes the use of Mocha's `describe` and `it` functions.