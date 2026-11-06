# Qor-logic 0.176.1 conformance against FailSafe's consumer contract (v6.0.12 qualification).
# Runs REAL qor-logic 0.176.1 (verified wheel) in disposable folders; never touches the repository.
# Usage: <qor-venv python> -I qor_conformance_01761.py <failsafe-repo> <qor-wheel> <out.json>
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, venv
from pathlib import Path

repo, wheel, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
PY = sys.executable
results = []

def rec(name, ok, detail):
    results.append({'name': name, 'pass': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + ' :: ' + json.dumps(detail)[:220])

def run(args, cwd=None, env=None, timeout=600):
    r = subprocess.run([PY, '-I', '-m', 'qor.cli', *args] if args and args[0] != '--raw' else args[1:],
                       cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout, r.stderr

import importlib.metadata as md
import qor.hosts as hosts
rec('installed distribution is exactly 0.176.1', md.version('qor-logic') == '0.176.1', md.version('qor-logic'))

# ---- host layouts: FailSafe HOST_INSTALL_LAYOUTS vs upstream HostTarget.install_map ----
src = (repo / 'FailSafe/extension/src/qorlogic/hostLayouts.ts').read_text(encoding='utf-8')
fs_hosts = re.findall(r'"([a-z-]+)"', re.search(r'QOR_LOGIC_HOSTS: QorLogicHost\[\] = \[([^\]]*)\]', src).group(1))
fs_unmirrored = re.findall(r'^\s{2}"?([a-z-]+)"?:\s*$', re.search(r'UNMIRRORED_HOSTS[^{]*\{(.*?)\n\};', src, re.S).group(1), re.M)
ws = Path(tempfile.mkdtemp(prefix='qor-conf-'))
up = {}
for name in ['claude', 'codex', 'kilo-code', 'gemini', 'cursor', 'cline']:
    try:
        t = hosts.resolve(name, scope='repo', target_override=str(ws))
        up[name] = {k: os.path.relpath(v, ws).replace('\\', '/') for k, v in t.install_map.items()}
    except Exception as e:  # noqa: BLE001
        up[name] = f'ERR {e}'
expected = {'claude': {'skills/': 'skills', 'agents/': 'agents'}, 'codex': {'skills/': 'skills', 'agents/': 'agents'},
            'kilo-code': {'skills/': 'skills', 'agents/': 'agents'}, 'gemini': {'commands/': 'commands'}}
rec('host install_map prefixes match FailSafe mirror for every mirrored host',
    all(up.get(h) == expected[h] for h in fs_hosts), {'failsafe_hosts': fs_hosts, 'upstream': up})
upstream_names = [h for h in up if not str(up[h]).startswith('ERR')]
rec('every upstream host is mirrored or declared unmirrored', set(upstream_names) <= set(fs_hosts) | set(fs_unmirrored),
    {'upstream': upstream_names, 'declared_unmirrored': fs_unmirrored})
base_dirs = {h: hosts.resolve(h, scope='repo').base.name for h in fs_hosts}
rec('repo-scope base directories match (.claude/.codex/.kilo/.gemini)',
    base_dirs == {'claude': '.claude', 'codex': '.codex', 'kilo-code': '.kilo', 'gemini': '.gemini'}, base_dirs)

# ---- CLI flags FailSafe uses: install --host --scope --dry-run --json ----
proj = ws / 'proj'; proj.mkdir()
(proj / '.git').mkdir()
code, so, se = run(['install', '--host', 'claude', '--scope', 'repo', '--dry-run', '--json'], cwd=proj)
try:
    plan = json.loads(so); parsed = True
except Exception:  # noqa: BLE001
    plan, parsed = None, False
rec('install --dry-run --json: exit 0, JSON, no files written', code == 0 and parsed and not (proj / '.claude').exists(),
    {'exit': code, 'json': parsed, 'keys': sorted(plan.keys()) if isinstance(plan, dict) else type(plan).__name__, 'stderr': se[-200:]})
code, so, se = run(['install', '--host', 'not-a-host', '--scope', 'repo', '--dry-run', '--json'], cwd=proj)
rec('negative: unknown host is refused (non-zero)', code != 0, {'exit': code, 'stderr': se[-200:]})
code, so, se = run(['install', '--host', 'claude', '--scope', 'nonsense', '--dry-run', '--json'], cwd=proj)
rec('negative: unknown scope is refused (non-zero)', code != 0, {'exit': code, 'stderr': se[-200:]})

# ---- real install / uninstall into a disposable project ----
code, so, se = run(['install', '--host', 'claude', '--scope', 'repo'], cwd=proj)
skills = list((proj / '.claude' / 'skills').glob('*/SKILL.md')) if (proj / '.claude' / 'skills').exists() else []
rec('install (repo scope, claude) writes skills into the disposable project only', code == 0 and len(skills) > 0,
    {'exit': code, 'skills': len(skills), 'stderr': se[-200:]})
code, so, se = run(['uninstall', '--help'])
has_uninstall = code == 0
if has_uninstall:
    code, so, se = run(['uninstall', '--host', 'claude', '--scope', 'repo'], cwd=proj)
    left = list((proj / '.claude' / 'skills').glob('*/SKILL.md')) if (proj / '.claude' / 'skills').exists() else []
    rec('uninstall removes what install wrote', code == 0 and not left, {'exit': code, 'left': len(left), 'stderr': se[-200:]})
else:
    rec('uninstall subcommand exists', False, {'note': 'qor-logic 0.176.1 has no uninstall subcommand', 'help_exit': code})

# ---- ledger contract: governance on a copy; negative controls on corrupted copies ----
gov = ws / 'gov'
shutil.copytree(repo / 'docs', gov / 'docs', ignore=shutil.ignore_patterns('*.png', '*.jpg', 'validation'))
shutil.copytree(repo / '.qorlogic', gov / '.qorlogic')
(gov / '.git').mkdir()
code, so, se = run(['governance-health'], cwd=gov)
rec('governance-health OK on an unmodified copy of the candidate docs', code == 0 and 'DAMAGED' not in so, {'exit': code, 'tail': so.strip().splitlines()[:1]})
code, so, se = run(['verify-ledger', '--post-anchor'], cwd=gov)
rec('verify-ledger --post-anchor clean on the copy', code == 0 and 'post-anchor clean' in so, {'exit': code, 'tail': so.strip().splitlines()[-1:]})
led = gov / 'docs' / 'META_LEDGER.md'
orig = led.read_bytes()
# Negative 1: change the Verdict metadata of post-anchor entry #900 (PASS -> VETO).
txt = orig.decode('utf-8')
i = txt.index('### Entry #900:'); seg_end = txt.index('### Entry #901:')
seg = txt[i:seg_end]
led.write_bytes((txt[:i] + seg.replace('**Verdict**: PASS', '**Verdict**: VETO', 1) + txt[seg_end:]).encode('utf-8'))
code, so, se = run(['verify-ledger', '--post-anchor'], cwd=gov)
verdict_detected = code != 0
rec('negative: flipping entry #900 **Verdict** PASS->VETO is detected by verify-ledger', verdict_detected, {'exit': code, 'tail': (so + se).strip().splitlines()[-1:]})
# Negative 2: change one word of entry #900's hashed **Decision** body.
led.write_bytes((txt[:i] + seg.replace('**Decision**: PASS on', '**Decision**: VETO on', 1) + txt[seg_end:]).encode('utf-8'))
code, so, se = run(['verify-ledger', '--post-anchor'], cwd=gov)
rec('negative: one word changed in entry #900 **Decision** body fails verify-ledger', code != 0, {'exit': code, 'tail': (so + se).strip().splitlines()[-2:]})
code, so, se = run(['governance-health'], cwd=gov)
rec('negative: governance-health flags the Decision-body edit', code != 0 or 'DAMAGED' in so, {'exit': code, 'first': so.strip().splitlines()[:1]})
# Negative 3: remove entry #913's chain-hash line (corrupt artifact).
k = txt.index('### Entry #913:'); k_end = txt.index('### Entry #914:')
seg13 = re.sub(r'\*\*Chain Hash[^\n]*\n', '', txt[k:k_end], count=1)
led.write_bytes((txt[:k] + seg13 + txt[k_end:]).encode('utf-8'))
code, so, se = run(['verify-ledger', '--post-anchor'], cwd=gov)
rec('negative: removing entry #913 chain-hash line fails verify-ledger', code != 0, {'exit': code, 'removed': seg13 != txt[k:k_end], 'tail': (so + se).strip().splitlines()[-2:]})
# Negative 3: truncated / empty ledger.
led.write_bytes(b'')
code, so, se = run(['governance-health'], cwd=gov)
rec('negative: empty ledger is not reported healthy', code != 0 or 'OK            docs/META_LEDGER.md' not in so, {'exit': code, 'first': so.strip().splitlines()[:1]})
led.write_bytes(orig)

# ---- offline exact-version install from the verified wheel ----
off = ws / 'offline-venv'
venv.EnvBuilder(with_pip=True).create(off)
opy = off / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
env = {**os.environ, 'PIP_NO_INDEX': '1', 'PIP_DISABLE_PIP_VERSION_CHECK': '1'}
r = subprocess.run([str(opy), '-m', 'pip', 'install', '--no-index', 'qor-logic==0.176.1'], capture_output=True, text=True, env=env)
rec('offline negative: exact pin with no index and no wheel fails cleanly (no network)', r.returncode != 0, {'exit': r.returncode, 'tail': r.stderr.strip().splitlines()[-1:]})
deps = Path(tempfile.mkdtemp(prefix='qor-wheels-'))
r = subprocess.run([PY, '-m', 'pip', 'download', '--dest', str(deps), '--no-deps', '--no-index', '--find-links', str(wheel.parent), 'qor-logic==0.176.1'], capture_output=True, text=True)
r2 = subprocess.run([str(opy), '-m', 'pip', 'install', '--no-index', '--no-deps', '--find-links', str(wheel.parent), 'qor-logic==0.176.1'], capture_output=True, text=True, env=env)
ver = subprocess.run([str(opy), '-c', 'import importlib.metadata as m;print(m.version("qor-logic"))'], capture_output=True, text=True).stdout.strip()
rec('offline positive: exact pin installs 0.176.1 from the verified wheel only (no dependencies fetched)', r2.returncode == 0 and ver == '0.176.1',
    {'exit': r2.returncode, 'version': ver, 'wheel_sha256': hashlib.sha256(wheel.read_bytes()).hexdigest()})
r3 = subprocess.run([str(opy), '-m', 'pip', 'install', '--no-index', '--find-links', str(wheel.parent), 'qor-logic==0.176.0'], capture_output=True, text=True, env=env)
rec('negative: a different exact version is not satisfied by the 0.176.1 wheel', r3.returncode != 0, {'exit': r3.returncode, 'tail': r3.stderr.strip().splitlines()[-1:]})

shutil.rmtree(ws, ignore_errors=True); shutil.rmtree(deps, ignore_errors=True)
summary = {'qor_logic': md.version('qor-logic'), 'python': sys.version.split()[0], 'passed': sum(r['pass'] for r in results),
           'failed': sum(not r['pass'] for r in results), 'results': results}
out.write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(f"SUMMARY passed={summary['passed']} failed={summary['failed']}")
