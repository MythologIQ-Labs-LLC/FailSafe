/**
 * Source scan (plan-v607-final-integration Phase 2, T-d): no production file
 * spawns a bare git name or runs git through a shell string. The only
 * production code allowed to name the executable is the resolver itself
 * (src/shared/git/trustedGit.ts) and the injected-runner dispatch sites, whose
 * runners resolve the path.
 *
 * Runs standalone: node --test src/test/shared/git/no-bare-git.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '..', '..');
const RESOLVER = path.join('shared', 'git', 'trustedGit.ts');

// R1: a call whose first argument is the literal executable name: callee ( Q git[.exe] Q [,)]
// R2: a shell-string first argument "git ..." to a callee named like exec/spawn/shell.
// Both are found by one linear pass over "( Q git"; the callee is read backwards
// from a short slice, so a 46 MB vendored bundle in src/ scans in linear time.
const CALL = /\(\s*(['"`])git(?:\.exe)?(?:\1\s*[,)]|\s)/g;
const SHELLISH = /exec|spawn|shell/i;
// R3: shell-string child_process APIs.
const R3_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?child_process['"]/g;
const R3_PROMISIFY = /promisify\(\s*exec\s*\)/g;
// R4: an explicit shell (outside comments).
const R4 = /shell:\s*true/g;

/** Injected-runner dispatch sites: the runner they call resolves the path. */
const ALLOW = [
  { file: path.join('governance', 'revert', 'GitResetService.ts'), callee: 'this.runner' },
  { file: path.join('roadmap', 'services', 'MarketplaceInstaller.ts'), callee: 'this.runner' },
  { file: path.join('roadmap', 'services', 'SecurityScanner.ts'), callee: 'this.runner' },
];
const NEVER_ALLOWED = /^(?:.*\.)?(?:spawn\w*|exec\w*|\w*Async|spawnFn)$/;

/** Every rule hit in `text`, as { rule, callee, index }. */
function hits(text) {
  const out = [];
  for (const m of text.matchAll(CALL)) {
    const callee = (/([\w$.]+)\s*$/.exec(text.slice(Math.max(0, m.index - 160), m.index)) || [])[1] || '';
    const literal = m[0].endsWith(',') || m[0].endsWith(')');
    if (literal && callee) out.push({ rule: 'R1', callee, index: m.index });
    else if (!literal && SHELLISH.test(callee)) out.push({ rule: 'R2', callee, index: m.index });
  }
  for (const m of text.matchAll(R3_IMPORT)) if (/\bexec(?:Sync)?\b/.test(m[1])) out.push({ rule: 'R3', callee: '', index: m.index });
  for (const m of text.matchAll(R3_PROMISIFY)) out.push({ rule: 'R3', callee: '', index: m.index });
  for (const m of text.matchAll(R4)) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    const before = text.slice(lineStart, m.index);
    if (/\/\/|^\s*(?:\/\*|\*)/.test(before)) continue; // a comment that mentions it
    out.push({ rule: 'R4', callee: '', index: m.index });
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (path.relative(SRC, full) === 'test') continue;
      walk(full, out);
    } else if (/\.(ts|js|cjs|mjs)$/.test(e.name)) out.push(full);
  }
  return out;
}

test('T-d self-test: every old bare-git form matches a rule, messages do not', () => {
  // Old lines from ae1d7bd7 (== 176a5abd), plus synthetic forms.
  const bad = {
    'G1:23': "return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 }).trim() || undefined;",
    'G2:131': "const child = spawn('git', args, { cwd, shell: false, windowsHide: true });",
    'G3:25-26': 'const r = spawnSync(\n      "git",\n      ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"],',
    'G4:108': 'const child = spawn("git", args, {',
    'G5:39': "const res = spawnSync('git', ['config', all ? '--get-all' : '--get', key], { cwd: repo, encoding: 'utf8', windowsHide: true });",
    'G6:88': "const child = spawn('git', [...baseArgs, ...args], {",
    'G7:29': 'const execAsync = promisify(exec);',
    'G7:183': 'const { stdout: headOutput } = await execAsync("git rev-parse HEAD", {',
    'G7:13': 'import { exec } from "child_process";',
    'G8:81-82': 'const { stdout } = await execAsync(\n      `git diff --name-only ${oldHead} HEAD`,',
    'G9:46': "return execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], {",
    'G10:91': "const out = execFileSync('git', ['tag'], { cwd: workspaceRoot, encoding: 'utf-8', timeout: 4000 });",
    'G11:19': "const url = execFileSync('git', ['remote', 'get-url', 'origin'], {",
    'G12:33': '? spawn("git", args, options)',
    'G13:33': '? spawn("git", args, options)',
    'G14:151': '? spawn("git", args, options)',
    'synthetic execFileAsync': "await execFileAsync('git', a);",
    'synthetic spawnFn': "spawnFn('git', a);",
    'synthetic cp.spawn git.exe': 'cp.spawn("git.exe", a);',
    'synthetic exec template': 'exec(`git log`);',
    'synthetic shell': 'spawn(cmd, args, { shell: true });',
  };
  for (const [name, line] of Object.entries(bad)) {
    const h = hits(line);
    assert.ok(h.length > 0, `${name} must match a rule`);
    for (const x of h.filter((y) => y.rule === 'R1')) assert.match(x.callee, NEVER_ALLOWED, `${name}: a spawn/exec callee is never allowlistable`);
  }
  const fine = [
    "return refused('git apply --check rejected the change set', [check.stderr.trim()]);",
    "super(`git ${args.join(' ')} failed (exit ${code}): ${stderr.trim().slice(0, 300)}`);",
    "timer = setTimeout(() => reject(new Error('git read timed out')), timeoutMs);",
    'const child = spawn(trustedGitPath(cwd), args, { cwd, shell: false, windowsHide: true });',
    'import { execFile } from "child_process";',
    '{ command: "choco", args: ["install", "git", "-y"] },',
  ];
  for (const line of fine) assert.deepEqual(hits(line), [], line);
});

test('T-d: no production file spawns a bare git or uses a shell', () => {
  const files = walk(SRC);
  assert.ok(files.length >= 500, `scanned ${files.length} files (expected >= 500)`);
  const violations = [];
  const allowed = [];
  for (const abs of files) {
    const rel = path.relative(SRC, abs);
    if (rel === RESOLVER) continue;
    const text = fs.readFileSync(abs, 'utf8');
    for (const h of hits(text)) {
      const line = text.slice(0, h.index).split('\n').length;
      const allow = h.rule === 'R1' && ALLOW.some((a) => a.file === rel && a.callee === h.callee) && !NEVER_ALLOWED.test(h.callee);
      (allow ? allowed : violations).push(`${rel}:${line} ${h.rule} ${h.callee}`.trim());
    }
  }
  assert.deepEqual(violations, [], 'bare git or shell use in production code');
  assert.equal(allowed.length, 4, `exactly 4 injected-runner sites: ${allowed.join(', ')}`);
});
