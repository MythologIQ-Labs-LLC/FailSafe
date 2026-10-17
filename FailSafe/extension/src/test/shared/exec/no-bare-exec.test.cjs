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

// ---------------------------------------------------------------- R3 (review delta LD17)
// In the Bicameral, ACP-proxy and bootstrapBicameral sources, every spawn-family
// call and every `new BicameralMcpClient({ command` takes a plain identifier that
// the same file assigns from an accepted resolver form. Two forwarding wrappers
// are allowed by exact text, and their callers are checked instead. Disclosed
// gaps: identifiers are matched by name file-wide, so a later reassignment to a
// raw value, or a parameter that shares a resolved variable's name, is not caught.
const R3_SCOPE = (rel) => rel.startsWith(path.join('integrations', 'bicameral') + path.sep)
  || rel.startsWith(path.join('integrations', 'acp', 'proxy') + path.sep)
  || rel === path.join('extension', 'bootstrapBicameral.ts');
const ACCEPTED = ['trustedCommandPath(', 'trustedExecutablePath(', 'checkTrustedPath(', 'resolveAgentCommand(',
  '(opts.resolve ?? trustedCommandPath)(', '(opts.resolveCommand ?? resolveAgentCommand)('];
const R3_CALL = /(?:^|[^\w$.])((?:[\w$]+\.)*(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork|spawnFn))\s*\(\s*([^,)]*)/g;
const R3_CLIENT = /new\s+BicameralMcpClient\(([\s\S]*?)\)/g;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function assignedAccepted(text, ident) {
  return ACCEPTED.some((f) => new RegExp(`\\b${esc(ident)}\\s*=\\s*${esc(f)}`).test(text));
}
function r3Violations(text) {
  const out = [];
  const check = (arg, what) => {
    const a = (arg || '').trim();
    if (!IDENT.test(a) || !assignedAccepted(text, a)) out.push(`${what}(${a})`);
  };
  for (const m of text.matchAll(R3_CALL)) {
    const callee = m[1];
    const arg = (m[2] || '').trim();
    const before = text.slice(Math.max(0, m.index - 12), m.index + 1);
    // The two forwarding wrappers, by exact form; their callers are checked below.
    if (callee === 'spawnFn' && arg === 'req.bin') continue;
    if (callee === 'spawn' && arg === 'c' && /\(c, a\) =>\s*$/.test(before)) continue;
    check(arg, callee);
  }
  for (const m of text.matchAll(R3_CLIENT)) {
    const body = m[1];
    if (!/^\s*\{/.test(body)) { out.push(`BicameralMcpClient(${body.trim()})`); continue; }
    const prop = /\bcommand\s*:\s*([^,}\s]+)/.exec(body);
    check(prop ? prop[1] : 'command', 'BicameralMcpClient');
  }
  if (/spawnFn\(req\.bin,/.test(text)) for (const m of text.matchAll(/\bbin:\s*([^,;}\n]+?)\s*[,\n}]/g)) check(m[1], 'runStep bin'); // a `bin: string;` type annotation ends in ';' and is skipped
  return out;
}

test('T12 R3 self-test: the replaced 869bab00 sites and synthetic bypasses are flagged; resolved forms are not', () => {
  const bad = {
    'install-handler (bin: pip)': "const pip = opts.pythonCommand ?? 'pip';\nconst r = await runStep(opts, mode, steps, {\n    bin: pip,\n    args: ['install'] });\n      child = spawnFn(req.bin, req.args, { shell: false, cwd: opts.workspaceRoot });",
    'install-detector line 197': "function runVersionProbe(command, t) {\n      child = spawn(command, ['--version'], { shell: false });\n}",
    'AcpProxyMain line 70': "  const spawnFn = opts.spawnFn ?? ((c, a) => spawn(c, a, { stdio: 'pipe' }));\n  const child = spawnFn(opts.agentCommand, opts.agentArgs);",
    'bootstrapBicameral line 241': '  const command = cfg.get<string>("command", "bicameral-mcp");\n      const client = new BicameralMcpClient({ command, cwd: workspaceRoot });',
    'bootstrapBicameral lines 160-161 (multi-line)': '  const command = cfg.get<string>("command", "bicameral-mcp");\n  const client = new BicameralMcpClient({\n    command,\n    cwd: workspaceRoot,\n  });',
    'synthetic member': 'spawn(opts.command, a);',
    'synthetic call': 'spawn(getCmd(), a);',
    // A resolved `command` sits beside each bypass, so only the rule under test can flag it.
    'synthetic options passed through': 'const command = trustedCommandPath(c, ws);\nconst client = new BicameralMcpClient(opts);',
    'synthetic command not first': 'const command = trustedCommandPath(c, ws);\nconst raw = cfg.get("command");\nconst client = new BicameralMcpClient({ cwd: ws, command: raw });',
    'synthetic exec': "exec(rawCommand, () => {});",
    'synthetic fork': "fork(rawModule, []);",
    'synthetic resolved member': 'const o = {};\no.cmd = trustedCommandPath(c);\nspawn(o.cmd, a);',
    'synthetic runStep raw bin': "const x = (opts.resolve ?? trustedCommandPath)(pip, d);\nawait runStep(o, m, s, { bin: rawSetting });\n child = spawnFn(req.bin, req.args, {});",
  };
  for (const [name, text] of Object.entries(bad)) assert.ok(r3Violations(text).length > 0, `${name} must be flagged`);
  const good = [
    "let exe;\nexe = trustedCommandPath(command, dir);\nchild = spawn(exe, ['--version'], { shell: false, cwd: dir });",
    "const pipBin = (opts.resolve ?? trustedCommandPath)(pip, d);\nawait runStep(o, m, s, { bin: pipBin });\n child = spawnFn(req.bin, req.args, {});",
    "const spawnFn = opts.spawnFn ?? ((c, a) => spawn(c, a, { stdio: 'pipe' }));\nconst agentCommand = (opts.resolveCommand ?? resolveAgentCommand)(opts.agentCommand);\nconst child = spawnFn(agentCommand, opts.agentArgs);",
    "const resolved = trustedCommandPath(command, ws);\nconst client = new BicameralMcpClient({\n    command: resolved,\n    cwd: ws,\n  });",
  ];
  for (const text of good) assert.deepEqual(r3Violations(text), [], text);
});

test('T12 R3: the Bicameral, ACP-proxy and bootstrapBicameral sources start only resolved commands', () => {
  const files = walk(SRC).map((abs) => [path.relative(SRC, abs), abs]).filter(([rel]) => R3_SCOPE(rel));
  assert.ok(files.length >= 10, `scanned ${files.length} R3 files`);
  const found = [];
  for (const [rel, abs] of files) for (const v of r3Violations(strip(fs.readFileSync(abs, 'utf8')))) found.push(`${rel}: ${v}`);
  assert.deepEqual(found, []);
  const host = strip(fs.readFileSync(path.join(SRC, 'integrations', 'mcp', 'McpClientHost.ts'), 'utf8'));
  const guardAt = host.search(/assertLaunchableCommand\(/);
  const transportAt = host.search(/new StdioClientTransport\(/);
  assert.ok(guardAt >= 0 && guardAt < transportAt, 'McpClientHost checks the command before creating the real transport');
});
