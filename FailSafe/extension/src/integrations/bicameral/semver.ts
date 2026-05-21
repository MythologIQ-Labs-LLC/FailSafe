// Lightweight semver compare shared across the Bicameral integration.
// Returns -1, 0, +1. Pre-release tags (anything after `-`) are ignored.
// `v` prefix is stripped. Missing components default to 0.

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}
