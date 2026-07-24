function compareSemver(a, b) {
  const parseVersion = (version) => {
    version = version.split('+')[0];
    
    const parts = version.split('-');
    const mainVersion = parts[0];
    const prerelease = parts.length > 1 ? parts[1].split('.') : [];
    
    const [major, minor, patch] = mainVersion.split('.').map(Number);
    
    return { major, minor, patch, prerelease };
  };
  
  const v1 = parseVersion(a);
  const v2 = parseVersion(b);
  
  if (v1.major !== v2.major) return v1.major < v2.major ? -1 : 1;
  if (v1.minor !== v2.minor) return v1.minor < v2.minor ? -1 : 1;
  if (v1.patch !== v2.patch) return v1.patch < v2.patch ? -1 : 1;
  
  const hasPrerelease1 = v1.prerelease.length > 0;
  const hasPrerelease2 = v2.prerelease.length > 0;
  
  if (!hasPrerelease1 && hasPrerelease2) return 1;
  if (hasPrerelease1 && !hasPrerelease2) return -1;
  if (!hasPrerelease1 && !hasPrerelease2) return 0;
  
  const maxLen = Math.max(v1.prerelease.length, v2.prerelease.length);
  for (let i = 0; i < maxLen; i++) {
    const id1 = v1.prerelease[i];
    const id2 = v2.prerelease[i];
    
    if (id1 === undefined) return -1;
    if (id2 === undefined) return 1;
    
    const isNumeric1 = /^\d+$/.test(id1);
    const isNumeric2 = /^\d+$/.test(id2);
    
    if (isNumeric1 && isNumeric2) {
      const num1 = parseInt(id1, 10);
      const num2 = parseInt(id2, 10);
      if (num1 !== num2) return num1 < num2 ? -1 : 1;
    } else if (isNumeric1 && !isNumeric2) {
      return -1;
    } else if (!isNumeric1 && isNumeric2) {
      return 1;
    } else {
      if (id1 !== id2) return id1 < id2 ? -1 : 1;
    }
  }
  
  return 0;
}

module.exports = { compareSemver };
