"""Judge mutants (audit iteration 2) for plan-721, same harness as mutants721.py: python jmut721-iter2-auditor.py <repo-root> [ids...]
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
    ('K1 own-key guard via in operator', S, "Object.hasOwn(OPTIONS, argv[i])", "(argv[i] in OPTIONS)"),
    ('K2 own-key guard dropped', S, "Object.hasOwn(OPTIONS, argv[i]) ? OPTIONS[argv[i]] : undefined", "OPTIONS[argv[i]]"),
    ('K3 trackedFiles non-Git returns empty set', R, "  assert.equal(probe.status, 0, 'FX939 needs a Git checkout of the repository: ' + probe.stderr);", "  if (probe.status !== 0) return new Set();"),
    ('K4 committedModes non-Git returns empty map', R, "  assert.equal(probe.status, 0, 'The Tier-1 census needs a Git checkout of the repository: ' + probe.stderr);", "  if (probe.status !== 0) return new Map();"),
    ('K6 FC006 trailing-text accepted', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (!declared.startsWith('`FailSafe/extension/package.json`')) {"),
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
