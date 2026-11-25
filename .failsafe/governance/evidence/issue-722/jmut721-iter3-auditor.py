"""Judge mutants (audit iteration 3) for plan-721, same harness as mutants721.py: python jmut721-iter3-auditor.py <repo-root> [ids...]
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
    ('L1 FC006 suffix match', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (!declared.endsWith('`FailSafe/extension/package.json`')) {"),
    ('L2 FC006 case-insensitive', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (declared.toLowerCase() !== '`failsafe/extension/package.json`') {"),
    ('L3 FC006 first backticked path only', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if ((declared.match(/`[^`]+`/) || [''])[0] !== '`FailSafe/extension/package.json`') {"),
    ('L4 FC006 whitespace-insensitive', S, "if (declared !== '`FailSafe/extension/package.json`') {", "if (declared.replace(/\s+/g, '') !== '`FailSafe/extension/package.json`') {"),
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
