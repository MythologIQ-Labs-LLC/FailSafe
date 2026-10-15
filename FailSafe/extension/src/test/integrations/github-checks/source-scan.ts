// Source-scan helper for the #476 importer pins. Reads the .ts sources (not the
// compiled output) under FailSafe/extension/src, excluding src/test/**.

import * as fs from 'fs';
import * as path from 'path';

/** FailSafe/extension/src, resolved from out/test/integrations/github-checks. */
export const SRC_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'src');

export interface ModuleReference { file: string; specifier: string; typeOnly: boolean }

// Static import / export-from / side-effect import / require( / dynamic import(,
// with ', " or ` quoted literal specifiers.
const ANY_REF = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)(['"`])([^'"`]+)\1/g;
const TYPE_ONLY = /\bimport\s+type\s[^;]*?from\s*(['"`])([^'"`]+)\1/g;
const CALL = /(?<![.\w$])(require|import)\s*\(/g;
const LITERAL_ARG = /^\s*(['"`])[^'"`$]*\1\s*\)/;

/** Drop block and line comments (prose such as "import (#98)" is not a call). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Every literal module specifier in a source text, flagged when it is `import type` only. */
export function moduleReferences(text: string): Array<{ specifier: string; typeOnly: boolean }> {
  const typeOnly = new Set<number>();
  for (const m of text.matchAll(TYPE_ONLY)) typeOnly.add((m.index ?? 0) + m[0].lastIndexOf(m[2]));
  const out: Array<{ specifier: string; typeOnly: boolean }> = [];
  for (const m of text.matchAll(ANY_REF)) {
    const at = (m.index ?? 0) + m[0].lastIndexOf(m[2]);
    out.push({ specifier: m[2], typeOnly: typeOnly.has(at) });
  }
  return out;
}

/** require(...) / import(...) calls whose argument is not one plain string literal. */
export function dynamicReferences(source: string): string[] {
  const text = stripComments(source);
  const out: string[] = [];
  for (const m of text.matchAll(CALL)) {
    const start = m.index ?? 0;
    const rest = text.slice(start + m[0].length);
    if (LITERAL_ARG.test(rest)) continue;
    const close = rest.indexOf(')');
    out.push(text.slice(start, start + m[0].length + (close < 0 ? rest.length : close + 1)));
  }
  return out;
}

/** The last path segment of a specifier, with and without a .js / .ts suffix. */
export function specifierNames(specifier: string): string[] {
  const last = specifier.split('/').pop() ?? specifier;
  return [last, last.replace(/\.(js|ts|cjs|mjs)$/, '')];
}

export function productionSources(root = SRC_ROOT): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (path.relative(root, p).split(path.sep)[0] === 'test') continue;
        walk(p);
      } else if (e.isFile() && p.endsWith('.ts') && !p.endsWith('.d.ts')) {
        files.push(p);
      }
    }
  };
  walk(root);
  return files;
}

/** Production files referencing a module by its file name (any directory, optional suffix). */
export function referencesTo(moduleName: string, root = SRC_ROOT): ModuleReference[] {
  const files = productionSources(root);
  if (files.length === 0) throw new Error(`source scan found no .ts files under ${root}`);
  const refs: ModuleReference[] = [];
  for (const file of files) {
    for (const r of moduleReferences(fs.readFileSync(file, 'utf8'))) {
      if (specifierNames(r.specifier).includes(moduleName)) {
        refs.push({ file: path.relative(root, file).split(path.sep).join('/'), ...r });
      }
    }
  }
  return refs;
}
