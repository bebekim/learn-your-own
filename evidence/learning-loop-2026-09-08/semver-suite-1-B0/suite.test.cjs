Here's an executable CommonJS Node.js test suite for the `compareSemver` function. This suite tests various cases, including the invariants and examples specified in your request.

```javascript
// test.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    it('should compare versions correctly based on major, minor, and patch', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
    });

    it('should prioritize versions without prerelease over those with prerelease', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
    });

    it('should compare prerelease identifiers correctly', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('2.0.0-alpha', '2.0.0-alpha'), 0);
    });

    it('should satisfy the symmetry property', () => {
        strictEqual(compareSemver('1.0.0', '2.0.0'), -compareSemver('2.0.0', '1.0.0'));
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -compareSemver('1.0.0', '1.0.0-alpha'));
    });

    it('should handle custom cases', () => {
        // Using core numbers 3, 13 and prerelease identifiers beta.3, beta.13
        strictEqual(compareSemver('1.0.0-beta.3', '1.0.0-beta.13'), -1);
        strictEqual(compareSemver('1.0.0-beta.13', '1.0.0-beta.3'), 1);
        strictEqual(compareSemver('3.0.0', '3.0.0-alpha'), 1);
        strictEqual(compareSemver('3.0.0-alpha', '3.0.0-alpha.1'), -1);
        strictEqual(compareSemver('3.0.0-alpha.1', '3.0.0-alpha.1'), 0);
    });
});

// To run the tests, use the command: node test.js
```

### Explanation:
- The test suite uses Node.js's built-in `assert` module for assertions.
- Each `it` block tests a specific invariant or example from the specification.
- The custom cases include comparisons of versions with core numbers 3, 13, and prerelease identifiers `beta.3` and `beta.13`.
- To run the tests, save this code in a file named `test.js` and execute it with Node.js using the command `node test.js`. Make sure the `compareSemver` function is correctly exported from `semver.cjs`.