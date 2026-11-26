"""Judge teardown-guard probe for plan-696: python jteardown696.py <worktree-root> <scratch>
Temporarily points scenario.work at a decoy (via a restored g4Scenario.cjs edit) and checks
whether test.after deletes it. Decoys carry a sentinel file."""
import glob, os, re, subprocess, sys, tempfile

ROOT, SCR = sys.argv[1], sys.argv[2]
E = os.path.join(ROOT, 'FailSafe', 'extension')
SCN = os.path.join(E, 'src', 'test', 'scripts', 'g4Scenario.cjs')
SUITE = 'src/test/scripts/g4Witness.test.cjs'
A = 'return { work, bin, tsa, signer, repo, cp1, cp2 };'
B = 'return { work: process.env.J696_DECOY || work, bin, tsa, signer, repo, cp1, cp2 };'
TMP = os.path.realpath(tempfile.gettempdir())


def mk(d):
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'SENTINEL'), 'w').write('keep')
    return d


tgtC = mk(os.path.join(SCR, 'jdecoyC-target'))
link = os.path.join(TMP, 'g4-falsify-jjunctionC')
if not os.path.exists(link):
    subprocess.run(['cmd', '/c', 'mklink', '/J', link, tgtC], check=True, capture_output=True)
CASES = [
    ('T1 outside tmp root, right prefix', mk(os.path.join(SCR, 'g4-falsify-jdecoyA')), os.path.join(SCR, 'g4-falsify-jdecoyA')),
    ('T2 tmp child, wrong prefix', mk(os.path.join(TMP, 'notg4-jdecoyB')), os.path.join(TMP, 'notg4-jdecoyB')),
    ('T3 tmp-child junction g4-falsify-* -> outside', link, tgtC),
    ('T4 control: tmp child, right prefix', mk(os.path.join(TMP, 'g4-falsify-jdecoyD')), os.path.join(TMP, 'g4-falsify-jdecoyD')),
]
before = set(glob.glob(os.path.join(TMP, 'g4-falsify-*')))
orig = open(SCN, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in orig else '\n'
s = orig.replace(nl, '\n')
assert s.count(A) == 1
open(SCN, 'w', encoding='utf-8', newline='').write(s.replace(A, B).replace('\n', nl))
try:
    for name, work, sentinel_dir in CASES:
        env = dict(os.environ, J696_DECOY=work)
        r = subprocess.run(['node', '--test', '--test-reporter=tap', SUITE], cwd=E, env=env, capture_output=True, text=True, encoding='utf-8')
        fails = re.findall(r'^not ok \d+ - (.*)$', r.stdout, re.M)
        refused = 'AssertionError' in r.stdout + r.stderr
        kept = os.path.exists(os.path.join(sentinel_dir, 'SENTINEL'))
        print(f'{name} | rc {r.returncode} | guard assertion fired {refused} | sentinel kept {kept} | not-ok {fails}', flush=True)
finally:
    open(SCN, 'w', encoding='utf-8', newline='').write(orig)
leaked = set(glob.glob(os.path.join(TMP, 'g4-falsify-*'))) - before
print('new real work dirs leaked by decoy runs (to remove):', sorted(leaked))
