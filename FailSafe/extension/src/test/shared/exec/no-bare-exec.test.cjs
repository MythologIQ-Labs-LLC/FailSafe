/**
 * Source scan (v6.0.8 lane A, B211, plan T12).
 *
 * R1: no production file starts gh, PowerShell, a scanner, a package manager,
 * taskkill, Python or pip by bare name; the only allowed bare names are the two
 * deferred B215 sites (voice-pack tar, the POSIX ps sampler).
 * R2: every python argv literal `-m` or `-c` has `-P` immediately before it;
 * the allowed exceptions are git `-c`/`commit -m` and AdapterService's `-c`,
 * which runs from a fresh empty folder instead (LD13). R2 sees separate
 * literals only: a combined or built flag string ('-m pip', '-' + 'm') is not
 * caught (disclosed in the plan).
 *
 * Runs standalone: node --test src/test/shared/exec/no-bare-exec.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', '..');
const RESOLVERS = new Set([path.join('shared', 'git', 'trustedGit.ts'), path.join('shared', 'exec', 'trustedExecutable.ts')]);
const NAMES = 'gh|powershell|pwsh|garak|npx|npm|pip3?|winget|choco|brew|apt-get|dnf|yum|pacman|taskkill|python3?|py|tar|ps';
const R1 = new RegExp(`(?:^|[^\\w$])((?:[\\w$]+\\.)*(?:spawn|spawnSync|execFile|execFileSync|exec|execSync))\\s*\\(\\s*(['"\`])(?:${NAMES})(?:\\.exe)?\\2\\s*[,)]`, 'g');
const R2 = /(['"`])-(m|c)\1/g;

/** Block comments and whole-line // comments removed; strings are left alone. */
function strip(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
}

function r1Hits(text) {
  return [...text.matchAll(R1)].map((m) => ({ index: m.index, text: m[0].trim() }));
}
function r2Hits(text) {
  const out = [];
  for (const m of text.matchAll(R2)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index).replace(/[\s,]+$/, '');
    out.push({ index: m.index, flag: m[2], guarded: /(['"`])-P\1$/.test(before) });
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (path.relative(SRC, full) !== 'test') walk(full, out); continue; }
    if (/\.(ts|js|cjs|mjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

const R1_ALLOW = [path.join('voice-pack', 'install-handler.ts'), path.join('integrations', 'agent-cli', 'process-tree.ts')];
const R2_ALLOW = {
  [path.join('integrations', 'agent-cli', 'git-safety.ts')]: 6,
  [path.join('integrations', 'shield-receipts', 'workspace-evidence-source.ts')]: 2,
  [path.join('extension', 'governedCommit.ts')]: 1,
  [path.join('roadmap', 'services', 'AdapterService.ts')]: 1,
};

test('T12 self-test: every replaced b66a32d8 bare start matches R1', () => {
  const old = [
    "const out = execFileSync('gh', ['pr', 'view', '--json', 'number', '-q', '.number'], { cwd, encoding: 'utf8', timeout: 8000 }).trim();",
    "const out = execFileSync('gh', [",
    "const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, shell: false });",
    '? spawn("garak", args, options)', '? spawn("npx", args, options)',
    '? spawn("pip", args, options)', '? spawn("npm", args, options)',
    '? spawn("winget", args, options)', '? spawn("choco", args, options)', '? spawn("brew", args, options)',
    '? spawn("apt-get", args, options)', '? spawn("dnf", args, options)', '? spawn("yum", args, options)', '? spawn("pacman", args, options)',
    "? spawn('python3', argv, { shell: false })", "? spawn('python', argv, { shell: false })", "? spawn('py', argv, { shell: false })",
    "? spawn('python3', argv, spawnOptions)", "? spawn('python', argv, spawnOptions)", "? spawn('py', argv, spawnOptions)",
    '? spawn("python3", args, options)', '? spawn("python", args, options)', '? spawn("pip3", args, options)',
    'cp.spawnSync("taskkill", ["/PID", pid]);',
  ];
  for (const line of old) assert.equal(r1Hits(line).length, 1, line);
  for (const fine of ["spawn(trustedExecutablePath(GH, cwd), args)", "{ command: 'winget', args: [] }", "refused('gh is missing')"]) {
    assert.deepEqual(r1Hits(fine), [], fine);
  }
});

test('T12 R2 self-test: every b66a32d8 python -m / -c line is unguarded, a -P line is guarded', () => {
  const old = [
    "      '-m', 'qor.cli', 'install',",
    "    const args = [...py.args, '-m', 'pip', 'install', '--upgrade', spec];",
    "    const args = [...py.args, '-m', 'pip', 'show', PACKAGE];",
    "    const args = [...py.args, '-m', `qor.scripts.${opts.module}`, ...opts.args];",
    '    const r = await defaultInstallerRun(py.command, [...py.args, "-m", "qor.cli", ...extra], { timeoutMs: 180_000 });',
    "    const res = await opts.run(opts.python, ['-c', EXPORT_SNIPPET, genomePath]);",
  ];
  for (const line of old) {
    const h = r2Hits(line);
    assert.equal(h.length, 1, line);
    assert.equal(h[0].guarded, false, `unguarded: ${line}`);
  }
  assert.equal(r2Hits("[...py.args,\n      '-P',\n      '-m', 'qor.cli']")[0].guarded, true);
  assert.equal(r2Hits('["-P", "-c", "x"]')[0].guarded, true);
});

test('T12: no production bare start outside the two deferred sites, and every python -m/-c is guarded', () => {
  const files = walk(SRC);
  assert.ok(files.length >= 500, `scanned ${files.length} files (expected >= 500)`);
  const r1v = [];
  const r1a = [];
  const r2v = [];
  const r2a = {};
  let r2g = 0;
  for (const abs of files) {
    const rel = path.relative(SRC, abs);
    if (RESOLVERS.has(rel)) continue;
    const raw = fs.readFileSync(abs, 'utf8');
    if (!/spawn|exec|['"`]-[mc]['"`]/.test(raw)) continue;
    const text = strip(raw);
    for (const h of r1Hits(text)) (R1_ALLOW.includes(rel) ? r1a : r1v).push(`${rel}:${text.slice(0, h.index).split('\n').length} ${h.text}`);
    for (const h of r2Hits(text)) {
      if (h.guarded) { r2g++; continue; }
      if (R2_ALLOW[rel] !== undefined) r2a[rel] = (r2a[rel] || 0) + 1;
      else r2v.push(`${rel}:${text.slice(0, h.index).split('\n').length} -${h.flag}`);
    }
  }
  assert.deepEqual(r1v, [], 'bare starts in production code');
  assert.equal(r1a.length, 2, `exactly the 2 deferred sites: ${r1a.join(', ')}`);
  assert.deepEqual(r2v, [], 'unguarded python -m/-c');
  assert.deepEqual(r2a, R2_ALLOW, 'the non-python -m/-c sites, by file and count');
  assert.equal(r2g, 7, 'exactly 7 python sites carry -P');
});
