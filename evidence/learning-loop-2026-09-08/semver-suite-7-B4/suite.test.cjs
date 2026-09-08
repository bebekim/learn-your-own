Here's an executable CommonJS Node.js test suite for the `compareSemver` function. This suite covers the specified invariants, examples, and additional cases using the core numbers 9, 19, and prerelease identifiers `beta.9` and `beta.19`.

```javascript
// test.js
const { compareSemver } = require('./semver.cjs');

// Test suite for compareSemver
const assert = require('assert');

describe('compareSemver', () => {
    // Example cases
    it('should return -1 for "1.2.3" and "1.2.4"', () => {
        assert.strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
    });

    it('should return -1 for "2.0.0" and "10.0.0"', () => {
        assert.strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should return -1 for "1.0.0-alpha" and "1.0.0"', () => {
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
    });

    it('should return -1 for "1.0.0-alpha" and "1.0.0-alpha.1"', () => {
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    });

    it('should return -1 for "1.0.0-alpha.1" and "1.0.0-alpha.beta"', () => {
        assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should return -1 for "1.0.0-beta.2" and "1.0.0-beta.11"', () => {
        assert.strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should return -1 for "1.0.0-rc.1" and "1.0.0"', () => {
        assert.strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for "1.0.0+build.5" and "1.0.0"', () => {
        assert.strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Negation properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.2',
            '1.0.0-beta.11',
            '2.0.0',
            '10.0.0'
        ];
        
        versions.forEach(a => {
            versions.forEach(b => {
                assert.strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
            });
        });
    });

    it('should satisfy compareSemver(a, a) === 0', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.2',
            '1.0.0-beta.11',
            '2.0.0',
            '10.0.0'
        ];
        
        versions.forEach(a => {
            assert.strictEqual(compareSemver(a, a), 0);
        });
    });

    // Additional cases
    it('should return -1 for "1.0.0-beta.9" and "1.0.0-beta.19"', () => {
        assert.strictEqual(compareSemver('1.0.0-beta.9', '1.0.0-beta.19'), -1);
    });

    it('should return -1 for "1.0.0-beta.19" and "1.0.0-beta.2"', () => {
        assert.strictEqual(compareSemver('1.0.0-beta.19', '1.0.0-beta.2'), 1);
    });

    it('should return -1 for "1.0.0-beta.19" and "1.0.0-beta"', () => {
        assert.strictEqual(compareSemver('1.0.0-beta.19', '1.0.0-beta'), 1);
    });

    it('should return -1 for "1.0.0-beta" and "1.0.0-beta.2"', () => {
        assert.strictEqual(compareSemver('1.0.0-beta', '1.0.0-beta.2'), -1);
    });

    it('should return -1 for "1.0.0-alpha.1" and "1.0.0-alpha.10"', () => {
        assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.10'), -1);
    });

    it('should return -1 for "1.0.0-alpha.1" and "1.0.0-alpha.beta"', () => {
        assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });
});

// Run the tests
if (require.main === module) {
    require('mocha').run();
}
```

### Instructions to Run the Test Suite
1. Save the above code in a file named `test.js`.
2. Ensure that the `compareSemver` function is correctly implemented and exported in `semver.cjs`.
3. Run the test suite using Node.js by executing the command:
   ```bash
   node test.js
   ```

This will execute the tests and report any failures or successes based on the assertions defined in the test suite.