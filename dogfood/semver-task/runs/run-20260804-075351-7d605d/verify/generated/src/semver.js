function compareSemver(a, b) {
  const parseVersion = (v) => {
    const withoutBuild = v.split('+')[0];
    const [main, prerelease] = withoutBuild.split('-');
    const [major, minor, patch] = main.split('.').map(Number);
    const identifiers = prerelease ? prerelease.split('.') : [];
    return { major, minor, patch, identifiers };
  };

  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;

  const aIds = va.identifiers;
  const bIds = vb.identifiers;

  if (aIds.length === 0 && bIds.length === 0) return 0;
  if (aIds.length === 0) return 1;
  if (bIds.length === 0) return -1;

  const maxLen = Math.max(aIds.length, bIds.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= aIds.length) return -1;
    if (i >= bIds.length) return 1;

    const aId = aIds[i];
    const bId = bIds[i];

    const aIsNumeric = /^\d+$/.test(aId);
    const bIsNumeric = /^\d+$/.test(bId);

    if (aIsNumeric && !bIsNumeric) return -1;
    if (!aIsNumeric && bIsNumeric) return 1;

    if (aIsNumeric && bIsNumeric) {
      const aNum = Number(aId);
      const bNum = Number(bId);
      if (aNum !== bNum) return aNum < bNum ? -1 : 1;
    } else {
      if (aId !== bId) return aId < bId ? -1 : 1;
    }
  }

  return 0;
}

module.exports = { compareSemver };
