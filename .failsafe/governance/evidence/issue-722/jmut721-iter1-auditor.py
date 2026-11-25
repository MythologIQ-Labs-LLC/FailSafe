"""Judge mutants (audit iteration 1) for plan-721, same harness as mutants721.py: python mutants721.py <repo-root> [ids...]
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
NL = chr(10)
BS = chr(92)
M = [
    ('J1 census N consistency dropped', R, " || published[0][2] !== patterns[0][2]) {", ") {"),
    ('J2 committedModes vacuous null', R,
     "  if (probe.status !== 0) return null;" + NL + "  assert.equal(probe.stdout.trim(), 'true', 'Tier-1 census requires a Git checkout');",
     "  if (true) return null;" + NL + "  assert.equal(probe.stdout.trim(), 'true', 'Tier-1 census requires a Git checkout');"),
    ('J3 FC006 scans past Tier 1 section', S, "const tier = lines.slice(start + 1, next < 0 ? undefined : next);", "const tier = lines.slice(start + 1);"),
    ('J4 FC006 any Tier heading', S, "/^## Tier 1(?:" + BS + "s|$)/.test(line)", "/^## Tier/.test(line)"),
    ('J5 trackedFiles vacuous null', R, "  if (probe.status !== 0) return null; // distribution without a Git checkout", "  if (true) return null;"),
    ('J6 tier-1 absent rows skipped', R, "    assert.equal(modes.get(registered), '100644',", "    if (!modes.has(registered)) continue;" + NL + "    assert.equal(modes.get(registered), '100644',"),
    ('J7 FC006 substring match', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (!declared.includes('FailSafe/extension/package.json')) {"),
    ('J9 state marker read anywhere', S, "singleHeader(source.state.slice(0, 12000),", "singleHeader(source.state,"),
    ('J10 private count not compared', R, "    private: Number(published[0][3]),", "    private: 15,"),
    ('J11 HEAD read failure tolerated', R, "  assert.equal(res.status, 0, 'FX939 could not read the committed HEAD tree: ' + res.stderr);", "  if (res.status !== 0) return new Set();"),
    ('J12 FC006 row found by any purpose', S, "line.split('|')[2]?.trim().startsWith('Authoritative version source')", "line.includes('package.json')"),
    ('J13 tier-1 rows not starting with backtick ignored', R, "    if (!/^" + BS + "|" + BS + "s*" + BS + "x60/.test(line)) continue;", "    if (!/^" + BS + "|" + BS + "s*" + BS + "x60[^" + BS + "x60]+" + BS + "x60 " + BS + "|/.test(line)) continue;"),
    ('J5b trackedFiles vacuous null for the real repository only', R, "  if (probe.status !== 0) return null; // distribution without a Git checkout", "  if (probe.status !== 0 || repoRoot === REPO_ROOT) return null;"),
    ('J2b committedModes vacuous null for the real repository only', R, "  const result = spawnSync('git', ['ls-tree', '-r', '-z', 'HEAD'], cwd);", "  if (repoRoot === REPO_ROOT) return null;\n  const result = spawnSync('git', ['ls-tree', '-r', '-z', 'HEAD'], cwd);"),
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
