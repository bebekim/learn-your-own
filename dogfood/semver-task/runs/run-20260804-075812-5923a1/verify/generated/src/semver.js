function compareSemver(a, b) {
  // Parse a semver string into { major, minor, patch, prerelease }
  function parse(s) {
    // Strip build metadata (everything after '+')
    const plusIdx = s.indexOf('+');
    const versionPart = plusIdx === -1 ? s : s.substring(0, plusIdx);

    // Split prerelease (after first '-')
    const hyphenIdx = versionPart.indexOf('-');
    let core, prerelease = null;
    if (hyphenIdx === -1) {
      core = versionPart;
    } else {
      core = versionPart.substring(0, hyphenIdx);
      prerelease = versionPart.substring(hyphenIdx + 1);
    }

    const [major, minor, patch] = core.split('.').map(Number);
    return { major, minor, patch, prerelease };
  }

  const va = parse(a);
  const vb = parse(b);

  // Compare major, minor, patch numerically
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;

  // Prerelease presence
  if (va.prerelease === null && vb.prerelease === null) return 0;
  if (va.prerelease === null && vb.prerelease !== null) return 1; // no prerelease > prerelease
  if (va.prerelease !== null && vb.prerelease === null) return -1;

  // Both have prerelease – compare identifiers
  const idsA = va.prerelease.split('.');
  const idsB = vb.prerelease.split('.');
  const len = Math.max(idsA.length, idsB.length);

  for (let i = 0; i < len; i++) {
    if (i >= idsA.length) return -1; // fewer identifiers -> lower
    if (i >= idsB.length) return 1;

    const idA = idsA[i];
    const idB = idsB[i];

    const numA = /^\d+$/.test(idA);
    const numB = /^\d+$/.test(idB);

    if (numA && numB) {
      // Both numeric: compare numerically only
      const nA = parseInt(idA, 10);
      const nB = parseInt(idB, 10);
      if (nA !== nB) return nA < nB ? -1 : 1;
      // If numerically equal, continue to next identifier (no string fallback)
    } else if (numA && !numB) {
      return -1; // numeric < alphanumeric
    } else if (!numA && numB) {
      return 1;
    } else {
      // Both alphanumeric – lexical ASCII comparison
      if (idA !== idB) return idA < idB ? -1 : 1;
    }
  }

  return 0;
}

module.exports = { compareSemver };
