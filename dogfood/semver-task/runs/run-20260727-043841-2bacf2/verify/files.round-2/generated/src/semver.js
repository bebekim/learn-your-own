function compareSemver(a, b) {
  const parseVersion = (version) => {
    // Remove build metadata (after '+')
    version = version.split('+')[0];
    
    // Split main version from prerelease
    const parts = version.split('-');
    const mainVersion = parts[0];
    // Prerelease identifiers (if any)
    const prerelease = parts.length > 1 ? parts.slice(1).join('-').split('.') : [];
    
    const [major, minor, patch] = mainVersion.split('.').map(Number);
    
    return { major, minor, patch, prerelease };
  };
  
  const v1 = parseVersion(a);
  const v2 = parseVersion(b);
  
  // Compare major, minor, patch numerically
  if (v1.major !== v2.major) return v1.major < v2.major ? -1 : 1;
  if (v1.minor !== v2.minor) return v1.minor < v2.minor ? -1 : 1;
  if (v1.patch !== v2.patch) return v1.patch < v2.patch ? -1 : 1;
  
  const hasPrerelease1 = v1.prerelease.length > 0;
  const hasPrerelease2 = v2.prerelease.length > 0;
  
  // A version with a prerelease has lower precedence than the same version without one
  if (!hasPrerelease1 && hasPrerelease2) return 1;
  if (hasPrerelease1 && !hasPrerelease2) return -1;
  if (!hasPrerelease1 && !hasPrerelease2) return 0;
  
  // Compare prerelease identifiers left to right
  const maxLen = Math.max(v1.prerelease.length, v2.prerelease.length);
  for (let i = 0; i < maxLen; i++) {
    const id1 = v1.prerelease[i];
    const id2 = v2.prerelease[i];
    
    // A prerelease with fewer identifiers has lower precedence
    if (id1 === undefined) return -1;
    if (id2 === undefined) return 1;
    
    const isNumeric1 = /^\d+$/.test(id1);
    const isNumeric2 = /^\d+$/.test(id2);
    
    if (isNumeric1 && isNumeric2) {
      // Numeric identifiers compare numerically
      const num1 = parseInt(id1, 10);
      const num2 = parseInt(id2, 10);
      if (num1 !== num2) return num1 < num2 ? -1 : 1;
    } else if (isNumeric1 && !isNumeric2) {
      // Numeric prerelease identifier always has lower precedence than alphanumeric
      return -1;
    } else if (!isNumeric1 && isNumeric2) {
      return 1;
    } else {
      // Alphanumeric identifiers compare lexically in ASCII order
      if (id1 !== id2) return id1 < id2 ? -1 : 1;
    }
  }
  
  return 0;
}

module.exports = { compareSemver };
