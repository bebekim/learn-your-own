const compareSemver = (a, b) => {
  const isNumeric = (str) => /^\d+$/.test(str);

  const compareIdentifiers = (idA, idB) => {
    const aNum = isNumeric(idA);
    const bNum = isNumeric(idB);

    if (aNum && bNum) {
      const diff = parseInt(idA, 10) - parseInt(idB, 10);
      return diff === 0 ? 0 : diff < 0 ? -1 : 1;
    }
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;

    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  };

  const parse = (v) => {
    const core = v.split('+')[0];
    const match = core.match(/^(\d+)\.(\d+)\.(\d+)(?:-((?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)))?$/);
    
    // Constraints state inputs are always valid, so match is guaranteed
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);
    const prereleaseStr = match[4];
    const prerelease = prereleaseStr ? prereleaseStr.split('.') : [];

    return { major, minor, patch, prerelease };
  };

  const verA = parse(a);
  const verB = parse(b);

  // Compare Major, Minor, Patch
  if (verA.major !== verB.major) {
    return verA.major < verB.major ? -1 : 1;
  }
  if (verA.minor !== verB.minor) {
    return verA.minor < verB.minor ? -1 : 1;
  }
  if (verA.patch !== verB.patch) {
    return verA.patch < verB.patch ? -1 : 1;
  }

  // Core versions are equal
  const aPre = verA.prerelease;
  const bPre = verB.prerelease;

  const aHasPre = aPre.length > 0;
  const bHasPre = bPre.length > 0;

  if (!aHasPre && !bHasPre) return 0;
  if (aHasPre && !bHasPre) return -1;
  if (!aHasPre && bHasPre) return 1;

  // Both have prerelease
  const lenA = aPre.length;
  const lenB = bPre.length;
  const maxLen = Math.max(lenA, lenB);

  for (let i = 0; i < maxLen; i++) {
    if (i >= lenA) return -1; // A is shorter, A < B
    if (i >= lenB) return 1;  // B is shorter, A > B

    const cmp = compareIdentifiers(aPre[i], bPre[i]);
    if (cmp !== 0) return cmp;
  }

  return 0;
};

module.exports = { compareSemver };
