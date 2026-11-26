"""Mutation run for plan-696: python mutants696.py <worktree-root> [ids...]
Each mutant edits the real G4 verifier CLI or library in place, runs g4Witness.test.cjs, records
KILLED/SURVIVED with the failing tests, and restores the file. The verifier is never left modified."""
import os, re, subprocess, sys

ROOT = sys.argv[1]
ONLY = set(sys.argv[2:])
E = os.path.join(ROOT, 'FailSafe', 'extension')
CLI = 'scripts/g4-verify-checkpoint.cjs'
LIB = 'scripts/lib/g4/verify.cjs'
SUITE = 'src/test/scripts/g4Witness.test.cjs'
M = [
    ('M1 BLOCKED exits 0', CLI, "return { PASS: 0, REFUSED: 1 }[r.verdict] ?? 2;", "return { PASS: 0, REFUSED: 1 }[r.verdict] ?? 0;"),
    ('M2 PASS exits 2', CLI, "return { PASS: 0, REFUSED: 1 }[r.verdict] ?? 2;", "return { PASS: 2, REFUSED: 1 }[r.verdict] ?? 2;"),
    ('M3 diagnostic label dropped', CLI, 'diagnostic: "diagnostic (NOT release evidence)"', 'diagnostic: "diagnostic"'),
    ('M4 verdict line not printed', CLI, "process.stdout.write(`[g4-verify] ${r.verdict} ${r.code}: ${r.detail}\\n`);", ""),
    ('M5 no-checkpoint code renamed', LIB, 'throw block("NO_CHECKPOINTS", "no checkpoints to verify");', 'throw block("EMPTY", "no checkpoints to verify");'),
    ('M6 no checkpoints reported as REFUSED', CLI, "return { PASS: 0, REFUSED: 1 }[r.verdict] ?? 2;", "return { PASS: 0, REFUSED: 1, BLOCKED: 1 }[r.verdict] ?? 2;"),
    ('M7 BLOCKED printed as PASS', CLI, "process.stdout.write(`[g4-verify] ${r.verdict} ${r.code}: ${r.detail}\\n`);", "process.stdout.write(`[g4-verify] ${r.verdict === 'BLOCKED' ? 'PASS' : r.verdict} ${r.code}: ${r.detail}\\n`);"),
]


def run():
    r = subprocess.run(['node', '--test', '--test-reporter=tap', SUITE], cwd=E, capture_output=True, text=True, encoding='utf-8')
    return re.findall(r'^not ok \d+ - (.*)$', r.stdout, re.M)


for name, rel, a, b in M:
    if ONLY and name.split()[0] not in ONLY:
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
        fails = run()
    finally:
        open(p, 'w', encoding='utf-8', newline='').write(orig)
    print(f"{'KILLED' if fails else 'SURVIVED':9} {name} | {'; '.join(fails)[:240]}")
