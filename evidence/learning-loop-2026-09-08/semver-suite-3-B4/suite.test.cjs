Here is an executable CommonJS test suite for the `compareSemver` function, which you can save in a file named `semver.test.js`. This suite covers various invariants, examples, and additional cases as specified.

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

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            ['1.2.3', '1.2.4'],
            ['2.0.0', '10.0.0'],
            ['1.0.0-alpha', '1.0.0'],
            ['1.0.0-alpha.1', '1.0.0-alpha'],
            ['1.0.0-beta.2', '1.0.0-beta.11'],
            ['1.0.0+build.5', '1.0.0']
        ];

        versions.forEach(([a, b]) => {
            const result = compareSemver(a, b);
            strictEqual(result + compareSemver(b, a), 0);
        });
    });

    // Additional test cases
    it('should handle additional cases with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('5.0.0', '5.0.0-beta.5'), 1);
        strictEqual(compareSemver('5.0.0-beta.5', '5.0.0-beta.15'), -1);
        strictEqual(compareSemver('5.0.0-beta.15', '5.0.0-beta.5'), 1);
        strictEqual(compareSemver('15.0.0', '15.0.0-alpha'), 1);
        strictEqual(compareSemver('15.0.0-alpha', '15.0.0-alpha.1'), -1);
        strictEqual(compareSemver('15.0.0-alpha.1', '15.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('15.0.0-alpha.beta', '15.0.0-beta.1'), -1);
    });
});
```

### Explanation:
- The test suite uses the `assert` module from Node.js to verify the outputs of the `compareSemver` function.
- Each test case checks different aspects of semantic versioning, ensuring that the function adheres to the specified invariants and constraints.
- The additional test cases include comparisons involving the numbers 5 and 15, as well as prerelease identifiers like `beta.5` and `beta.15`.
- The negation-based properties are tested by ensuring that the sum of `compareSemver(a, b)` and `compareSemver(b, a)` equals zero for all valid inputs.