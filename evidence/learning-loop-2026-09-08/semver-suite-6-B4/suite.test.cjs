Here is an executable CommonJS Node.js test suite for the `compareSemver` function, which you can save in a file named `semver.test.js`. This suite covers all specified invariants, examples, and additional cases using the core numbers 8, 18, and prerelease identifiers `beta.8` and `beta.18`.

```javascript
const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should return -1 for "1.2.3" < "1.2.4"', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
    });

    it('should return -1 for "2.0.0" < "10.0.0"', () => {
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should return -1 for "1.0.0-alpha" < "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
    });

    it('should return -1 for "1.0.0-alpha" < "1.0.0-alpha.1"', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    });

    it('should return -1 for "1.0.0-alpha.1" < "1.0.0-alpha.beta"', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should return -1 for "1.0.0-beta.2" < "1.0.0-beta.11"', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should return -1 for "1.0.0-rc.1" < "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for "1.0.0+build.5" == "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            ['1.0.0', '1.0.0'],
            ['1.0.0-alpha', '1.0.0'],
            ['1.0.0-alpha', '1.0.0-alpha.1'],
            ['1.0.0-beta.2', '1.0.0-beta.11'],
            ['2.0.0', '10.0.0']
        ];
        for (const [a, b] of versions) {
            strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
        }
    });

    it('should satisfy compareSemver(a, a) === 0', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-alpha.1',
            '1.0.0-beta.2',
            '2.0.0'
        ];
        for (const version of versions) {
            strictEqual(compareSemver(version, version), 0);
        }
    });

    // Additional cases
    it('should correctly compare "1.0.0-beta.8" < "1.0.0-beta.18"', () => {
        strictEqual(compareSemver('1.0.0-beta.8', '1.0.0-beta.18'), -1);
    });

    it('should correctly compare "1.0.0-beta.18" > "1.0.0-beta.8"', () => {
        strictEqual(compareSemver('1.0.0-beta.18', '1.0.0-beta.8'), 1);
    });

    it('should correctly compare "1.0.0-alpha.1" < "1.0.0-beta.1"', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-beta.1'), -1);
    });

    it('should correctly compare "1.0.0" < "1.0.0+build.1"', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0+build.1'), -1);
    });

    it('should correctly compare "1.2.3" < "1.2.3-alpha.1"', () => {
        strictEqual(compareSemver('1.2.3', '1.2.3-alpha.1'), -1);
    });
});
```

To run the test suite, make sure you have Node.js installed and execute the following command in your terminal:

```bash
node test semver.test.js
```

This suite tests the `compareSemver` function against a variety of scenarios, ensuring that it behaves as expected according to the provided specifications.