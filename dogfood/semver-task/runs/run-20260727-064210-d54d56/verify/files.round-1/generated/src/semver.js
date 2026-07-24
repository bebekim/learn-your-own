function compareSemver(a, b) {
  const parseVersion = (version) => {
    const [versionPart] = version.split('+');
    const [mainVersion, prerelease] = versionPart.split('-');
    const [major, minor, patch] = mainVersion.split('.').map(Number);
    const prereleaseIdentifiers = prerelease ? prerelease.split('.') : [];
    return { major, minor, patch, prereleaseIdentifiers };
  };

  const verA = parseVersion(a);
  const verB = parseVersion(b);

  if (verA.major !== verB.major) {
    return verA.major < verB.major ? -1 : 1;
  }
  if (verA.minor !== verB.minor) {
    return verA.minor < verB.minor ? -1 : 1;
  }
  if (verA.patch !== verB.patch) {
    return verA.patch < verB.patch ? -1 : 1;
  }

  const len = Math.max(verA.prereleaseIdentifiers.length, verB.prereleaseIdentifiers.length);

  for (let i = 0; i < len; i++) {
    const idA = verA.prereleaseIdentifiers[i];
    const idB = verB.prereleaseIdentifiers[i];

    if (idA === undefined) return -1;
    if (idB === undefined) return 1;

    const isNumericA = /^\d+$/.test(idA);
    const isNumericB = /^\d+$/.test(idB);

    if (isNumericA && isNumericB) {
      const numA = parseInt(idA, 10);
      const numB = parseInt(idB, 10);
      if (numA !== numB) {
        return numA < numB ? -1 : 1;
      }
    } else if (isNumericA && !isNumericB) {
      return -1;
    } else if (!isNumericA && isNumericB) {
      return 1;
    } else {
      if (idA !== idB) {
        return idA < idB ? -1 : 1;
      }
    }
  }

  return 0;
}

module.exports = { compareSemver };
