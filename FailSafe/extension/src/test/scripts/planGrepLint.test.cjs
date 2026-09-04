/**
 * Unit tests for plan-grep-lint.cjs.
 *
 * Covers SG-PlanInfrastructureVerificationGap discipline (META_LEDGER #287):
 * verification-token re-checking against actual repo state.
 *
 * Runs standalone: node --test src/test/scripts/planGrepLint.test.cjs
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const lint = require(path.resolve(__dirname, '..', '..', '..', 'scripts', 'plan-grep-lint.cjs'));

let TMP_REPO;
let ORIGINAL_CWD;

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-grep-lint-'));
  execFileSync('git', ['init', '-q', dir], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false'], { stdio: 'ignore' });
  return dir;
}

function commitFile(repo, relPath, content) {
  const full = path.join(repo, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  execFileSync('git', ['-C', repo, 'add', relPath], { stdio: 'ignore' });
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', `add ${relPath}`], { stdio: 'ignore' });
}

function writePlan(repo, planRel, body) {
  const full = path.join(repo, planRel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  return full;
}

before(() => {
  ORIGINAL_CWD = process.cwd();
  TMP_REPO = makeRepo();
  process.chdir(TMP_REPO);
});

after(() => {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(TMP_REPO, { recursive: true, force: true });
});

describe('parseAffectedRows', () => {
  it('extracts rows from a verification-token table', () => {
    const planBody = [
      '# Plan: foo',
      '',
      '## Phase 1',
      '',
      '### Affected Files',
      '',
      '| Path | Op | Verification command + result | Token |',
      '|---|---|---|---|',
      '| `a.ts` | NEW | `git log -- a.ts` returns empty | NEW-VERIFIED |',
      '| `b.ts` | MODIFIED | `git log -- b.ts` shows commit `abc123` | MODIFIED-VERIFIED |',
      '',
      '### Changes',
      '',
      'stuff',
      '',
    ].join('\n');
    const rows = lint.parseAffectedRows(planBody);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].path, 'a.ts');
    assert.equal(rows[0].token, 'NEW-VERIFIED');
    assert.equal(rows[1].path, 'b.ts');
    assert.equal(rows[1].token, 'MODIFIED-VERIFIED');
  });

  it('returns empty when plan has no Affected Files table', () => {
    const rows = lint.parseAffectedRows('# Plan with no tables\n\nProse only.\n');
    assert.equal(rows.length, 0);
  });

  it('skips template placeholder rows', () => {
    const planBody = [
      '### Affected Files',
      '',
      '| Path | Op | Verification command + result | Token |',
      '|---|---|---|---|',
      '| `path/to/file.ts` | NEW | `git log -- path/to/file.ts` returns empty | NEW-VERIFIED |',
      '| [template placeholder] | NEW | [example] | [TOKEN] |',
      '',
    ].join('\n');
    const rows = lint.parseAffectedRows(planBody);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].path, 'path/to/file.ts');
  });
});

describe('reverify — NEW-VERIFIED via git log', () => {
  it('passes when path has no git history (truly new)', () => {
    const result = lint.reverify({
      path: 'absent.ts',
      op: 'NEW',
      command: '`git log -- absent.ts` returns empty',
      token: 'NEW-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('fails when NEW path actually has git history', () => {
    commitFile(TMP_REPO, 'committed.ts', 'export const x = 1;\n');
    const result = lint.reverify({
      path: 'committed.ts',
      op: 'NEW',
      command: '`git log -- committed.ts` returns empty',
      token: 'NEW-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /commit /);
  });
});

describe('reverify — MODIFIED-VERIFIED via git log', () => {
  before(() => {
    if (!fs.existsSync(path.join(TMP_REPO, 'mod.ts'))) {
      commitFile(TMP_REPO, 'mod.ts', 'export const y = 2;\n');
    }
  });

  it('passes when MODIFIED path has git history', () => {
    const result = lint.reverify({
      path: 'mod.ts',
      op: 'MODIFIED',
      command: '`git log -- mod.ts` shows commit abc123',
      token: 'MODIFIED-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('fails when MODIFIED path has no git history', () => {
    const result = lint.reverify({
      path: 'never-existed.ts',
      op: 'MODIFIED',
      command: '`git log -- never-existed.ts` shows commit',
      token: 'MODIFIED-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
  });
});

describe('reverify — EXISTING-VERIFIED via grep', () => {
  before(() => {
    if (!fs.existsSync(path.join(TMP_REPO, 'package.json'))) {
      commitFile(TMP_REPO, 'package.json', '{\n  "devDependencies": {\n    "foo": "^1.2.3"\n  }\n}\n');
    }
  });

  it('passes when grep finds the cited symbol', () => {
    const result = lint.reverify({
      path: 'package.json devDep `foo`',
      op: 'EXISTING-USE',
      command: 'grep \'"foo"\' package.json shows version pin',
      token: 'EXISTING-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('fails when grep finds no match', () => {
    const result = lint.reverify({
      path: 'package.json devDep `bar`',
      op: 'EXISTING-USE',
      command: 'grep \'"bar"\' package.json',
      token: 'EXISTING-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
  });
});

describe('reverify — ls fallback', () => {
  it('passes NEW when ls reports no such file', () => {
    const result = lint.reverify({
      path: 'no-such.ts',
      op: 'NEW',
      command: '`ls no-such.ts` returns no such file',
      token: 'NEW-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('fails NEW when ls finds the file', () => {
    if (!fs.existsSync(path.join(TMP_REPO, 'mod.ts'))) {
      commitFile(TMP_REPO, 'mod.ts', 'x\n');
    }
    const result = lint.reverify({
      path: 'mod.ts',
      op: 'NEW',
      command: '`ls mod.ts` returns no such file',
      token: 'NEW-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
  });
});

describe('reverify — regex-shaped grep patterns (FailSafe#439)', () => {
  before(() => {
    if (!fs.existsSync(path.join(TMP_REPO, 'ledger-regex.md'))) {
      let body = '';
      for (let i = 1; i <= 5; i++) body += `### Entry #${i}: something\n`;
      commitFile(TMP_REPO, 'ledger-regex.md', body);
    }
  });

  it('fails NEW-VERIFIED when the cited regex actually matches (exact #439 repro)', () => {
    // Prior to the fix, `^### Entry #[0-9]+:` was matched with a literal
    // String.includes() check, never found the regex text verbatim, and so
    // NEW-VERIFIED incorrectly passed on a file that is not new.
    const result = lint.reverify({
      path: 'ledger-regex.md',
      op: 'NEW',
      command: "`grep -nE '^### Entry #[0-9]+:' ledger-regex.md` -> 5 matches",
      token: 'NEW-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /^match: /);
  });

  it('passes MODIFIED-VERIFIED for the same cited regex match (exact #439 repro)', () => {
    const result = lint.reverify({
      path: 'ledger-regex.md',
      op: 'MODIFIED',
      command: "`grep -nE '^### Entry #[0-9]+:' ledger-regex.md` -> 5 matches",
      token: 'MODIFIED-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('passes NEW-VERIFIED when a regex pattern genuinely does not match', () => {
    const result = lint.reverify({
      path: 'ledger-regex.md',
      op: 'NEW',
      command: "`grep -nE '^### Retired #[0-9]+:' ledger-regex.md` -> 0 matches",
      token: 'NEW-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
    assert.equal(result.observed, 'no match');
  });

  it('fails closed (not silently ok) on an invalid regex pattern', () => {
    const result = lint.reverify({
      path: 'ledger-regex.md',
      op: 'MODIFIED',
      command: "`grep -E '### Entry #[0-9+:' ledger-regex.md`",
      token: 'MODIFIED-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /not a valid regular expression/);
  });

  it('honors -F (fixed strings) to force literal matching even with regex-shaped text', () => {
    // The literal string "[0-9]+" never appears in ledger-regex.md (only the
    // *interpreted* regex would match digits), so -F must not match.
    const result = lint.reverify({
      path: 'ledger-regex.md',
      op: 'MODIFIED',
      command: "`grep -F '[0-9]+' ledger-regex.md`",
      token: 'MODIFIED-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.equal(result.observed, 'no match');
  });

  it('leaves plain literal patterns (no metacharacters) unaffected', () => {
    const result = lint.reverify({
      path: 'ledger-regex.md',
      op: 'EXISTING-USE',
      command: "grep 'Entry #3' ledger-regex.md",
      token: 'EXISTING-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('matches BRE-literal + as a literal character under plain grep, not "one or more" (FailSafe#443)', () => {
    // Real `grep 'a+b' file` (no -E) only matches the literal text "a+b" --
    // confirmed empirically against real grep. A naive JS-regex
    // interpretation of unescaped `+` would also match "ab", which this
    // must not do.
    commitFile(TMP_REPO, 'plus-literal.txt', 'a+b line\nab line\naab line\n');
    const matchesLiteral = lint.reverify({
      path: 'plus-literal.txt',
      op: 'EXISTING-USE',
      command: "grep 'a+b' plus-literal.txt",
      token: 'EXISTING-VERIFIED',
    }, TMP_REPO);
    assert.equal(matchesLiteral.ok, true);
    assert.match(matchesLiteral.observed, /^match: a\+b line$/);

    const doesNotMatchBareAb = lint.reverify({
      path: 'plus-literal.txt',
      op: 'NEW',
      command: "grep 'a+b' plus-literal.txt", // NEW-VERIFIED claims absence
      token: 'NEW-VERIFIED',
    }, TMP_REPO);
    // The literal "a+b" IS present, so NEW-VERIFIED (absence claim) must fail.
    assert.equal(doesNotMatchBareAb.ok, false);
  });

  it('honors backslash-escaped grouping under plain grep as real regex intent', () => {
    commitFile(TMP_REPO, 'escaped-group.txt', 'foobar line\nfoo(bar) line\n');
    const result = lint.reverify({
      path: 'escaped-group.txt',
      op: 'EXISTING-USE',
      command: "grep 'foo\\(bar\\)' escaped-group.txt",
      token: 'EXISTING-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
    assert.match(result.observed, /^match: foobar line$/);
  });
});

describe('isRegexShapedGrep', () => {
  it('treats -F as always literal, even with metacharacters present', () => {
    assert.equal(lint.isRegexShapedGrep('foo[0-9]+', '-F '), false);
  });
  it('treats -E/-P/-G as always regex, even with no metacharacters', () => {
    assert.equal(lint.isRegexShapedGrep('foo', '-E '), true);
    assert.equal(lint.isRegexShapedGrep('foo', '-P '), true);
    assert.equal(lint.isRegexShapedGrep('foo', '-nG '), true);
  });
  it('infers regex from metacharacters when no mode flag is given', () => {
    assert.equal(lint.isRegexShapedGrep('^### Entry #[0-9]+:', ''), true);
    assert.equal(lint.isRegexShapedGrep('"/api/skills"', ''), false);
  });
  it('does not treat BRE-literal characters as regex when no mode flag is given (FailSafe#443)', () => {
    // ( ) { } + ? | are literal in real grep's default POSIX/GNU BRE mode
    // unless backslash-escaped -- unlike ERE/JS regex, where they are
    // special unless escaped. Misclassifying these as regex-shaped diverges
    // from real grep's actual match behavior (verified empirically: real
    // `grep 'a+b'` matches only the literal text "a+b", never "ab").
    assert.equal(lint.isRegexShapedGrep('a+b', ''), false);
    assert.equal(lint.isRegexShapedGrep('colou?r', ''), false);
    assert.equal(lint.isRegexShapedGrep('cat|dog', ''), false);
    assert.equal(lint.isRegexShapedGrep('foo(bar)', ''), false);
    assert.equal(lint.isRegexShapedGrep('a{2,3}', ''), false);
  });
  it('treats backslash-escaped BRE extensions as regex intent (GNU \\( \\) \\{ \\} \\+ \\? \\|)', () => {
    assert.equal(lint.isRegexShapedGrep('foo\\(bar\\)', ''), true);
    assert.equal(lint.isRegexShapedGrep('a\\+b', ''), true);
    assert.equal(lint.isRegexShapedGrep('cat\\|dog', ''), true);
  });
});

describe('convertBreToJsRegexSource', () => {
  it('escapes BRE-literal ( ) { } + ? | for JS RegExp', () => {
    assert.equal(lint.convertBreToJsRegexSource('a+b'), 'a\\+b');
    assert.equal(lint.convertBreToJsRegexSource('cat|dog'), 'cat\\|dog');
    assert.equal(lint.convertBreToJsRegexSource('foo(bar)'), 'foo\\(bar\\)');
  });
  it('unescapes GNU BRE-extension escapes into JS-special characters', () => {
    assert.equal(lint.convertBreToJsRegexSource('foo\\(bar\\)'), 'foo(bar)');
    assert.equal(lint.convertBreToJsRegexSource('a\\+b'), 'a+b');
  });
  it('leaves always-special BRE metacharacters and other escapes unchanged', () => {
    assert.equal(lint.convertBreToJsRegexSource('^### Entry #[0-9]+:'), '^### Entry #[0-9]\\+:');
    assert.equal(lint.convertBreToJsRegexSource('foo\\.bar'), 'foo\\.bar');
  });
});

describe('PLAN_PATH_RE — defensive arg validation', () => {
  it('accepts canonical .failsafe/governance/plans/ path', () => {
    assert.ok(lint.PLAN_PATH_RE.test('.failsafe/governance/plans/plan-foo.md'));
  });
  it('accepts root plan-*.md', () => {
    assert.ok(lint.PLAN_PATH_RE.test('plan-foo.md'));
  });
  it('rejects ../ traversal', () => {
    assert.equal(lint.PLAN_PATH_RE.test('../etc/passwd'), false);
  });
  it('rejects unrelated paths', () => {
    assert.equal(lint.PLAN_PATH_RE.test('docs/foo.md'), false);
  });
});

describe('TOKEN_VOCAB — closed enum', () => {
  it('contains exactly the four documented tokens', () => {
    assert.equal(lint.TOKEN_VOCAB.size, 4);
    assert.ok(lint.TOKEN_VOCAB.has('NEW-VERIFIED'));
    assert.ok(lint.TOKEN_VOCAB.has('MODIFIED-VERIFIED'));
    assert.ok(lint.TOKEN_VOCAB.has('EXISTING-VERIFIED'));
    assert.ok(lint.TOKEN_VOCAB.has('FITNESS-VERIFIED'));
  });
});

describe('reverify — FITNESS-VERIFIED via grep (Entry #290 R2-bis)', () => {
  before(() => {
    if (!fs.existsSync(path.join(TMP_REPO, 'routes.ts'))) {
      commitFile(
        TMP_REPO,
        'routes.ts',
        'app.get("/api/skills", handler);\napp.get("/api/skills/relevance", handler);\n',
      );
    }
  });

  it('passes when grep finds the cited symbol inside the file', () => {
    const result = lint.reverify({
      path: '/api/skills (route)',
      op: 'route',
      command: 'grep \'"/api/skills"\' routes.ts shows handler registration',
      token: 'FITNESS-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('fails when the cited route does not exist in the file (invented route)', () => {
    const result = lint.reverify({
      path: '/api/skills/catalog (route)',
      op: 'route',
      command: 'grep \'"/api/skills/catalog"\' routes.ts',
      token: 'FITNESS-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /no match/);
  });

  it('fails when the file does not exist', () => {
    const result = lint.reverify({
      path: 'somesymbol',
      op: 'symbol',
      command: 'grep \'somesymbol\' nonexistent.ts',
      token: 'FITNESS-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /file not found/);
  });

  it('fails when token is FITNESS-VERIFIED but command is git log (intra-file content not verified)', () => {
    const result = lint.reverify({
      path: 'routes.ts',
      op: 'route',
      command: 'git log -- routes.ts',
      token: 'FITNESS-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /requires a grep command/);
  });

  it('fails when token is FITNESS-VERIFIED but command is ls (intra-file content not verified)', () => {
    const result = lint.reverify({
      path: 'routes.ts',
      op: 'symbol',
      command: 'ls routes.ts',
      token: 'FITNESS-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /requires a grep command/);
  });

  it('passes for a typo correction case (Entry #289 F2 fix)', () => {
    if (!fs.existsSync(path.join(TMP_REPO, 'transparency.ts'))) {
      commitFile(
        TMP_REPO,
        'transparency.ts',
        'app.get("/api/transparency", handler);\n',
      );
    }
    const result = lint.reverify({
      path: '/api/transparency (route)',
      op: 'route',
      command: 'grep \'"/api/transparency"\' transparency.ts',
      token: 'FITNESS-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, true);
  });

  it('fails for the same file under a typo of the cited route (Entry #289 F2 simulation)', () => {
    const result = lint.reverify({
      path: '/api/transparency/events (typo)',
      op: 'route',
      command: 'grep \'"/api/transparency/events"\' transparency.ts',
      token: 'FITNESS-VERIFIED',
    }, TMP_REPO);
    assert.equal(result.ok, false);
    assert.match(result.observed, /no match/);
  });
});
