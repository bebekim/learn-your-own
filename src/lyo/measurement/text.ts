export function summaryTokens(summary: string | null): Set<string> {
  if (!summary) return new Set();
  const cleaned = summary.replace(/\s+length=\d+$/, '').toLowerCase();
  return new Set(cleaned.split(/[^a-z0-9]+/).filter((token) => token.length > 0));
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}
