"""Mutation run for plan-721: python mutants721.py <repo-root> [ids...]
Each mutant edits one source file in place, runs the three governance suites, records KILLED/SURVIVED
with the failing test names, and restores the file."""
import os, re, subprocess, sys

ROOT = sys.argv[1]
ONLY = set(sys.argv[2:])
E = os.path.join(ROOT, 'FailSafe', 'extension')
S = 'scripts/check-governance-currency.cjs'
R = 'src/test/governance/governanceIndexReaders.cjs'
SUITES = ['src/test/governance/governance-index-publication.test.cjs',
          'src/test/governance/governance-index-census.test.cjs',
          'src/test/scripts/governanceCurrency.test.cjs', 'src/test/scripts/governanceCurrencyRefusals.test.cjs']
M = [
    ('C1 FC001 newest heading not compared', S, "if (newest !== version) error('FC001'", "if (false) error('FC001'"),
    ('C2 FC002 SYSTEM_STATE release not compared', S, "if (stateRelease !== version) error('FC002'", "if (false) error('FC002'"),
    ('C3 FC003 ARCHITECTURE_PLAN release not compared', S, "if (architectureRelease !== version) error('FC003'", "if (false) error('FC003'"),
    ('C4 FC004 stale review marker accepted', S, "if (reviewedAt < publishedAt) {", "if (false) {"),
    ('C5 FC004 uses the oldest review marker', S, "return releaseDate(matches[0][1]);", "return releaseDate(matches[matches.length - 1][1]);"),
    ('C6 FC005 warning dropped', S, "if (featureLead && featureLead[1] !== version) {", "if (false) {"),
    ('C7 FC006 manifest issue ignored', S, "if (manifestIssue) error('FC006'", "if (false) error('FC006'"),
    ('C8 FC006 phantom root manifest accepted', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (declared !== '`FailSafe/extension/package.json`' && declared !== '`package.json` (root + extension)' && declared !== '`package.json`') {"),
    ('C9 FC006 duplicate authority rows accepted', S, "if (rows.length !== 1) return", "if (rows.length === 0) return"),
    ('C10 FC006 missing Tier 1 section passes', S, "if (start < 0) return 'Missing canonical Tier 1 registry section';", "if (start < 0) return null;"),
    ('C11 duplicate CHANGELOG heading accepted', S, "if (published.length !== 1) throw", "if (published.length === 0) throw"),
    ('C12 impossible date accepted', S, "if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {", "if (Number.isNaN(date.getTime())) {"),
    ('C13 symlink component followed', S, "if (st.isSymbolicLink()) throw new Error(`Not a regular file (symlink component)", "if (false) throw new Error(`Not a regular file (symlink component)"),
    ('C14 malformed suffix accepted (state)', S, "if (!versionPattern.test(marker)) throw", "if (!/^\\d+\\.\\d+\\.\\d+/.test(marker)) throw"),
    ('C15 ambiguous duplicate marker accepted', S, "if (matches.length !== 1) throw new Error(`Expected exactly one ${field}", "if (matches.length === 0) throw new Error(`Expected exactly one ${field}"),
    ('C16 duplicate option accepted', S, "if (!option || seen.has(argv[i]) ||", "if (!option ||"),
    ('C17 unknown option accepted', S, "if (!option || seen.has(argv[i]) || (option.values === 1 && !value)) throw new Error(USAGE);", "if (!option) { i++; continue; } if (seen.has(argv[i]) || (option.values === 1 && !value)) throw new Error(USAGE);"),
    ('C18 refusal exits 0', S, "    return 2;\n  }\n}", "    return 0;\n  }\n}"),
    ('C19 --enforce ignored', S, "return args.enforce && result.summary.errors > 0 ? 1 : 0;", "return 0;"),
    ('C20 non-json format accepted', S, "if (value !== 'json') throw new Error(USAGE); ", ""),
    ('C21 oversize source accepted', S, "if (st.size > 3 * 1024 * 1024) throw", "if (false) throw"),
    ('C22 file outside repository accepted', S, "if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {", "if (false) {"),
    ('C23 symlinked repository root accepted', S, "if (!stat.isDirectory() || stat.isSymbolicLink()) throw", "if (!stat.isDirectory()) throw"),
    ('C24 FC004 equal dates flagged', S, "if (reviewedAt < publishedAt) {", "if (reviewedAt <= publishedAt) {"),
    ('C25 manifest version shape unchecked', S, "if (typeof manifest.version !== 'string' || !versionPattern.test(manifest.version)) {", "if (typeof manifest.version !== 'string') {"),
    ('C26 inherited names accepted as options', S, "const option = Object.hasOwn(OPTIONS, argv[i]) ? OPTIONS[argv[i]] : undefined;", "const option = OPTIONS[argv[i]];"),
    ('C27 FC006 substring authority accepted', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (!declared.includes('FailSafe/extension/package.json')) {"),
    ('C28 FC006 prefix authority accepted', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (!declared.startsWith('`FailSafe/extension/package.json`')) {"),
    ('R1 census counts unexplained as private', R, "return prefixes.some((pre) => p.startsWith(pre)) ? 'private' : 'unexplained';", "return 'private';"),
    ('R2 census claims accepted outside the section', R, "const section = /^## Publication status$([\\s\\S]*?)^## /m.exec(text);\n  if (!section) throw", "const section = [null, text];\n  if (!section) throw"),
    ('R3 census duplicate claims accepted', R, "if (published.length !== 1 || patterns.length !== 1 ||", "if (published.length < 1 || patterns.length < 1 ||"),
    ('R4 census count comparison dropped', R, "  assert.deepEqual(counts, claimedPublicationCensus(text),", "  claimedPublicationCensus(text); assert.deepEqual(counts, counts,"),
    ('R5 tracked set from index not HEAD', R, "spawnSync('git', ['ls-tree', '-r', '-z', '--name-only', 'HEAD'], cwd);", "spawnSync('git', ['ls-files', '-z'], cwd);"),
    ('R6 tier-1 non-regular mode accepted', R, "assert.equal(modes.get(registered), '100644',", "assert.ok(modes.has(registered),"),
    ('R7 tier-1 duplicate paths accepted', R, "assert.equal(new Set(names).size, names.length, 'Tier 1 has duplicate canonical paths');", ""),
    ('R8 tier-1 local exception undisclosed accepted', R, "assert.ok(row.includes('A local file, not in the repository'),", "assert.ok(true || row.includes('A local file, not in the repository'),"),
    ('R9 tier-1 published local tracker accepted', R, "assert.equal(modes.has(registered), false,", "assert.equal(false, false,"),
    ('R10 tier-1 only first path per row', R, "for (const m of cell.matchAll(/\\x60([^\\x60]+)\\x60/g)) {", "for (const m of [...cell.matchAll(/\\x60([^\\x60]+)\\x60/g)].slice(0, 1)) {"),
    ('R11 tier-1 manifest registration not required', R, "assert.ok(names.includes('FailSafe/extension/package.json'),", "assert.ok(true || names.includes('FailSafe/extension/package.json'),"),
    ('R12 out-of-tier rows counted', R, "const tiers = cut === -1 ? text : text.slice(0, cut);", "const tiers = text;"),
    ('R13 shapes counted as files', R, "return p.includes('*') || p.includes('<');", "return p.includes('*');"),
    ('R14 trackedFiles vacuous without Git', R, "  assert.equal(probe.status, 0, 'FX939 needs a Git checkout of the repository: ' + probe.stderr);", "  if (probe.status !== 0) return new Set();"),
    ('R15 committedModes vacuous for the real repository', R, "  assert.equal(probe.status, 0, 'The Tier-1 census needs a Git checkout of the repository: ' + probe.stderr);", "  if (repoRoot === REPO_ROOT) return new Map();"),
    ('R16 census N consistency dropped', R, " || published[0][2] !== patterns[0][2]) {", ") {"),
]


def run():
    r = subprocess.run(['node', '--test', '--test-reporter=tap'] + SUITES, cwd=E, capture_output=True, text=True, encoding='utf-8')
    fails = re.findall(r'^( *)not ok \d+ - (.*)$', r.stdout, re.M)
    deepest = max((len(i) for i, _ in fails), default=0)
    # report the innermost failing tests (subtests inside a describe), not the enclosing suite
    return [n.replace('\#', '#') for i, n in fails if len(i) == deepest], r.stdout


for name, rel, a, b in M:
    mid = name.split()[0]
    if ONLY and mid not in ONLY:
        continue
    p = os.path.join(E, rel)
    orig = open(p, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in orig else '\n'
    s = orig.replace(nl, '\n')
    if s.count(a) != 1:
        print(f'APPLY-FAIL {name} ({s.count(a)})')
        continue
    open(p, 'w', encoding='utf-8', newline='').write(s.replace(a, b).replace('\n', nl))
    try:
        fails, out = run()
    finally:
        open(p, 'w', encoding='utf-8', newline='').write(orig)
    print(f"{'KILLED' if fails else 'SURVIVED':9} {name} | {'; '.join(sorted(set(fails)))[:300]}")
