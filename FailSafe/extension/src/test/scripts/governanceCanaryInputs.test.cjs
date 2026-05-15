const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const scanner = require(path.resolve(__dirname, '..', '..', '..', 'scripts', 'check-governance-canaries.cjs'));

let TMP_REPO;
let ORIGINAL_CWD;

before(() => {
  ORIGINAL_CWD = process.cwd();
  TMP_REPO = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-canary-'));
});

after(() => {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(TMP_REPO, { recursive: true, force: true });
});

describe('parseArgs', () => {
  it('accepts --repo-root /some/path', () => {
    const args = scanner.parseArgs(['--repo-root', '/some/path']);
    assert.equal(args.repoRoot, '/some/path');
  });

  it('sets includeRemediationPlan when flag present', () => {
    const args = scanner.parseArgs(['--repo-root', '/path', '--include-remediation-plan']);
    assert.equal(args.includeRemediation, true);
  });

  it('sets plansOnly when flag present', () => {
    const args = scanner.parseArgs(['--repo-root', '/path', '--plans-only']);
    assert.equal(args.plansOnly, true);
  });

  it('exits when --repo-root is missing', () => {
    let caught = false;
    const origExit = process.exit;
    process.exit = (code) => { caught = code; throw new Error('exit'); };
    try { scanner.parseArgs([]); } catch (e) { if (!caught) throw e; }
    process.exit = origExit;
    assert.equal(caught, 2);
  });
});

describe('buildFileList', () => {
  it('returns 3 default governance files', () => {
    const files = scanner.buildFileList({ includeRemediation: false, plansOnly: false });
    assert.equal(files.length, 3);
  });

  it('returns 4 files with includeRemediation', () => {
    const files = scanner.buildFileList({ includeRemediation: true, plansOnly: false });
    assert.equal(files.length, 4);
  });

  it('returns 2 files with plansOnly', () => {
    const files = scanner.buildFileList({ includeRemediation: false, plansOnly: true });
    assert.equal(files.length, 2);
  });
});

describe('scanFile', () => {
  it('returns empty hits for clean content', () => {
    const hits = scanner.scanFile('ARCHITECTURE_PLAN.md', 'No HTML here\nJust prose\n');
    assert.equal(hits.length, 0);
  });

  it('returns empty hits for escaped &lt;script', () => {
    const hits = scanner.scanFile('ARCHITECTURE_PLAN.md', 'Use &lt;script&gt; carefully\n');
    assert.equal(hits.length, 0);
  });

  it('detects raw <script with correct line number', () => {
    const content = 'Line one\n<script>alert(1)</script>\nLine three\n';
    const hits = scanner.scanFile('ARCHITECTURE_PLAN.md', content);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 2);
  });

  it('skips <script inside fenced code block', () => {
    const content = 'Prose\n```\n<script>\n```\nMore prose\n';
    const hits = scanner.scanFile('ARCHITECTURE_PLAN.md', content);
    assert.equal(hits.length, 0);
  });

  it('detects raw <iframe', () => {
    const hits = scanner.scanFile('CONCEPT.md', '<iframe src="evil">\n');
    assert.equal(hits.length, 1);
  });
});

describe('integration — subprocess', () => {
  const scriptPath = path.resolve(__dirname, '..', '..', '..', 'scripts', 'check-governance-canaries.cjs');

  it('exits 0 when governance files are clean', () => {
    const docsDir = path.join(TMP_REPO, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'ARCHITECTURE_PLAN.md'), '# Plan\nClean content\n');
    fs.writeFileSync(path.join(docsDir, 'META_LEDGER.md'), '# Ledger\nClean\n');
    fs.writeFileSync(path.join(docsDir, 'CONCEPT.md'), '# Concept\nClean\n');
    const out = execFileSync('node', [scriptPath, '--repo-root', TMP_REPO], { encoding: 'utf-8', stdio: 'pipe' });
    assert.match(out, /OK/);
  });

  it('exits 1 when governance file contains <script>', () => {
    const dirtyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-canary-dirty-'));
    const docsDir = path.join(dirtyDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'ARCHITECTURE_PLAN.md'), '# Plan\n<script>bad()</script>\n');
    fs.writeFileSync(path.join(docsDir, 'META_LEDGER.md'), 'Clean\n');
    fs.writeFileSync(path.join(docsDir, 'CONCEPT.md'), 'Clean\n');
    let exited = false;
    try {
      execFileSync('node', [scriptPath, '--repo-root', dirtyDir], { stdio: 'pipe' });
    } catch (err) {
      exited = true;
      assert.equal(err.status, 1);
    }
    fs.rmSync(dirtyDir, { recursive: true, force: true });
    assert.equal(exited, true);
  });
});
