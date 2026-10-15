import { strict as assert } from 'assert';
import { modeProblems, parseNumstatPaths, patchStats, pathProblems, validatePatch } from '../../../integrations/agent-cli/patch-paths';

// FX951 (#475, LD6): every reject class, plus ordinary paths accepted.

suite('patch-paths (#475 LD6)', () => {
  const rejected: Array<[string, RegExp]> = [
    ['/etc/passwd', /absolute path/],
    ['\\\\server\\share\\x', /absolute path/],
    ['C:/Windows/x', /absolute path/],
    ['a/b:stream', /':'/],
    ['../outside.txt', /forbidden component '\.\.'/],
    ['a/../../x', /forbidden component '\.\.'/],
    ['./x', /forbidden component '\.'/],
    ['.git/config', /forbidden component '\.git'/],
    ['.GIT/x', /forbidden component '\.GIT'/],
    ['a/.git/config', /forbidden component '\.git'/],
    ['GIT~1/HEAD', /forbidden component 'GIT~1'/],
    ['.gitmodules', /forbidden component '\.gitmodules'/],
    ['sub/.GITMODULES', /forbidden component '\.GITMODULES'/],
    ['dir./x', /ends in a dot or space/],
    ['dir /x', /ends in a dot or space/],
    ['CON', /device name 'CON'/],
    ['aux.txt', /device name 'aux\.txt'/],
    ['src/nul.tar.gz', /device name 'nul\.tar\.gz'/],
    ['CONIN$', /device name/],
    ['conout$.log', /device name/],
    ['COM1', /device name/],
    ['lpt9.txt', /device name/],
    ['COM¹', /device name/],
    ['LPT³.x', /device name/],
    ['com0', /device name/],
  ];
  for (const [p, why] of rejected) {
    test(`rejects ${JSON.stringify(p)}`, () => {
      const problems = pathProblems(p);
      assert.ok(problems.some((x) => why.test(x)), `${p}: ${JSON.stringify(problems)}`);
    });
  }

  for (const p of ['src/a.ts', 'README.md', '.github/workflows/ci.yml', '.gitignore', '.gitattributes', 'console.ts', 'comet/x', 'auxiliary.md', 'git~2/x', 'a.b/c']) {
    test(`accepts ${JSON.stringify(p)}`, () => assert.deepEqual(pathProblems(p), []));
  }

  test('modeProblems: symlink and submodule modes rejected, regular modes accepted', () => {
    assert.match(modeProblems(' create mode 120000 link')[0], /^symlink change/);
    assert.match(modeProblems(' create mode 160000 sub')[0], /^submodule change/);
    assert.match(modeProblems(' mode change 100644 => 120000 x')[0], /^symlink change/);
    assert.deepEqual(modeProblems(' create mode 100644 a.txt\n mode change 100644 => 100755 run.sh\n delete mode 100644 b.txt'), []);
  });

  test('numstat parsing covers plain, binary and renamed entries', () => {
    const z = '1\t2\ta.txt\0-\t-\timg.png\0' + '0\t0\t\0old/name.txt\0new/name.txt\0';
    assert.deepEqual(parseNumstatPaths(z), ['a.txt', 'img.png', 'old/name.txt', 'new/name.txt']);
    assert.deepEqual(patchStats(z), { files: 3, additions: 1, deletions: 2, paths: ['a.txt', 'img.png', 'old/name.txt', 'new/name.txt'] });
  });

  test('a rename INTO a forbidden path is rejected by its destination name', () => {
    const z = '0\t0\t\0ok.txt\0.git/hooks/pre-commit\0';
    assert.ok(validatePatch(z, '').some((x) => x.startsWith('.git/hooks/pre-commit:')));
  });

  test('validatePatch combines mode and path problems; clean patch has none', () => {
    assert.equal(validatePatch('1\t0\tsrc/a.ts\0', ' create mode 100644 src/a.ts').length, 0);
    assert.equal(validatePatch('1\t0\tCON\0', ' create mode 120000 CON').length, 2);
  });
});
