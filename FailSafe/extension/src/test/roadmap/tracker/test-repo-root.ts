import * as fs from "fs";
import * as path from "path";

function hasRepoMarkers(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "docs", "FEATURE_INDEX.md"))
    && fs.existsSync(path.join(candidate, "FailSafe", "extension", "package.json"));
}

export function findTestRepoRoot(startDir = __dirname, maxDepth = 10): string {
  let candidate = path.resolve(startDir);
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    if (hasRepoMarkers(candidate)) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(`FailSafe repository root not found from ${startDir}`);
}

export function resolveTestRepoPath(...segments: string[]): string {
  return path.join(findTestRepoRoot(), ...segments);
}
