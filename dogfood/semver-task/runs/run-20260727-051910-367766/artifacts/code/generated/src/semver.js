'use strict';

function parseSemver(version) {
  // Strip build metadata
  var plusIndex = version.indexOf('+');
  if (plusIndex !== -1) {
    version = version.substring(0, plusIndex);
  }

  var prerelease = null;
  var dashIndex = version.indexOf('-');
  if (dashIndex !== -1) {
    prerelease = version.substring(dashIndex + 1);
    version = version.substring(0, dashIndex);
  }

  var parts = version.split('.');
  var major = parseInt(parts[0], 10);
  var minor = parseInt(parts[1], 10);
  var patch = parseInt(parts[2], 10);

  var prereleaseIdentifiers = null;
  if (prerelease !== null && prerelease.length > 0) {
    prereleaseIdentifiers = prerelease.split('.');
  }

  return {
    major: major,
    minor: minor,
    patch: patch,
    prerelease: prereleaseIdentifiers
  };
}

function isNumericIdentifier(identifier) {
  return /^[0-9]+$/.test(identifier);
}

function comparePrereleaseIdentifiers(a, b) {
  var aNumeric = isNumericIdentifier(a);
  var bNumeric = isNumericIdentifier(b);

  // Numeric identifiers always have lower precedence than alphanumeric
  if (aNumeric && !bNumeric) {
    return -1;
  }
  if (!aNumeric && bNumeric) {
    return 1;
  }

  if (aNumeric && bNumeric) {
    // Compare numerically
    var aNum = parseInt(a, 10);
    var bNum = parseInt(b, 10);
    if (aNum < bNum) return -1;
    if (aNum > bNum) return 1;
    return 0;
  }

  // Both alphanumeric: compare lexically in ASCII order
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareSemver(a, b) {
  var parsedA = parseSemver(a);
  var parsedB = parseSemver(b);

  // Compare major, minor, patch numerically
  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }

  // Compare prerelease
  var preA = parsedA.prerelease;
  var preB = parsedB.prerelease;

  // No prerelease has higher precedence than having prerelease
  if (preA === null && preB === null) {
    return 0;
  }
  if (preA === null && preB !== null) {
    return 1;
  }
  if (preA !== null && preB === null) {
    return -1;
  }

  // Both have prerelease identifiers; compare left to right
  var len = Math.min(preA.length, preB.length);
  for (var i = 0; i < len; i++) {
    var cmp = comparePrereleaseIdentifiers(preA[i], preB[i]);
    if (cmp !== 0) {
      return cmp;
    }
  }

  // All preceding identifiers equal: fewer identifiers has lower precedence
  if (preA.length < preB.length) {
    return -1;
  }
  if (preA.length > preB.length) {
    return 1;
  }

  return 0;
}

module.exports = {
  compareSemver: compareSemver
};
