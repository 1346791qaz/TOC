// Normalized Levenshtein similarity: 1 = identical, 0 = completely different.
// Uses two-row DP to keep memory O(n).
export function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const m = s1.length;
  const n = s2.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        s1[i - 1] === s2[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
}
