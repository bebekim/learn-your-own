const compareSemver = (a, b) => {
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

  const aHasPrerelease = verA.prereleaseIdentifiers.length > 0;
  const bHasPrerelease = verB.prereleaseIdentifiers.length > 0;

  if (!aHasPrerelease && bHasPrerelease) {
    return 1;
  }
  if (aHasPrerelease && !bHasPrerelease) {
    return -1;
  }

  const maxLength = Math.max(
    verA.prereleaseIdentifiers.length,
    verB.prereleaseIdentifiers.length
  );

  for (let i = 0; i < maxLength; i++) {
    const aId = verA.prereleaseIdentifiers[i];
    const bId = verB.prereleaseIdentifiers[i];

    if (aId === undefined) {
      return -1;
    }
    if (bId === undefined) {
      return 1;
    }

    const aIsNumeric = /^\d+$/.test(aId);
    const bIsNumeric = /^\d+$/.test(bId);

    if (aIsNumeric && bIsNumeric) {
      const aNum = parseInt(aId, 10);
      const bNum = parseInt(bId, 10);
      if (aNum !== bNum) {
        return aNum < bNum ? -1 : 1;
      }
    } else if (aIsNumeric && !bIsNumeric) {
      return -1;
    } else if (!aIsNumeric && bIsNumeric) {
      return 1;
    } else {
      if (aId !== bId) {
        return aId < bId ? -1 : 1;
      }
    }
  }

  return 0;
};

module.exports = { compareSemver };
