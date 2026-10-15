/**
 * patch-paths — fail-closed validation of a captured agent patch (#475, LD6).
 *
 * Paths come from `git apply --numstat -z` and modes from `git apply --summary`
 * on the captured bytes, never from parsing diff headers. A patch is rejected if
 * it creates or changes a symlink or submodule, or names any path that could
 * reach outside the work tree or into git metadata on any platform.
 */

const DEVICE = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const FORBIDDEN_COMPONENTS = new Set(['.git', 'git~1', '.gitmodules', '..', '.']);

interface NumstatEntry { added: number; deleted: number; paths: string[] }

/** Entries of `git apply --numstat -z` output; a rename / copy names both paths. */
function parseNumstat(numstatZ: string): NumstatEntry[] {
  const fields = numstatZ.split('\0');
  const entries: NumstatEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const parts = fields[i].split('\t');
    if (parts.length < 3) continue;
    // Binary files report "-" for both counts.
    const entry: NumstatEntry = { added: Number(parts[0]) || 0, deleted: Number(parts[1]) || 0, paths: [] };
    if (parts[2] !== '') entry.paths.push(parts.slice(2).join('\t'));
    else {
      // rename / copy: "<add>\t<del>\t" then old\0new\0
      entry.paths.push(...[fields[i + 1], fields[i + 2]].filter((p): p is string => !!p));
      i += 2;
    }
    entries.push(entry);
  }
  return entries;
}

/** Paths named by `git apply --numstat -z` output (renames contribute both names). */
export function parseNumstatPaths(numstatZ: string): string[] {
  return parseNumstat(numstatZ).flatMap((e) => e.paths);
}

/** File / line counts and every touched path, from `git apply --numstat -z`. */
export function patchStats(numstatZ: string): { files: number; additions: number; deletions: number; paths: string[] } {
  const entries = parseNumstat(numstatZ);
  return {
    files: entries.length,
    additions: entries.reduce((n, e) => n + e.added, 0),
    deletions: entries.reduce((n, e) => n + e.deleted, 0),
    paths: entries.flatMap((e) => e.paths),
  };
}

/** Reasons a single repository-relative path is unsafe; empty when acceptable. */
export function pathProblems(p: string): string[] {
  const problems: string[] = [];
  if (p.startsWith('/') || p.startsWith('\\') || /^[a-zA-Z]:/.test(p)) problems.push('absolute path');
  if (p.includes(':')) problems.push("':' (drive or alternate data stream)");
  for (const raw of p.split(/[\\/]/)) {
    const c = raw.toLowerCase();
    if (FORBIDDEN_COMPONENTS.has(c)) problems.push(`forbidden component '${raw}'`);
    else if (/[. ]$/.test(raw)) problems.push(`component '${raw}' ends in a dot or space`);
    else if (DEVICE.test(raw)) problems.push(`Windows device name '${raw}'`);
  }
  return problems;
}

/** Reasons the mode summary is unsafe (symlinks, submodules). */
export function modeProblems(summary: string): string[] {
  const problems: string[] = [];
  for (const line of summary.split(/\r?\n/)) {
    if (/\b(120000|160000)\b/.test(line)) {
      problems.push(`${/120000/.test(line) ? 'symlink' : 'submodule'} change: ${line.trim()}`);
    }
  }
  return problems;
}

/** All validation problems for a captured patch; empty means promotable. */
export function validatePatch(numstatZ: string, summary: string): string[] {
  const out = [...modeProblems(summary)];
  for (const p of parseNumstatPaths(numstatZ)) {
    for (const problem of pathProblems(p)) out.push(`${p}: ${problem}`);
  }
  return out;
}
