// FX949 (#481): the Open Design MCP launch command comes from the daemon's own
// GET /api/mcp/install-info, but an HTTP response must not by itself decide what
// FailSafe spawns. parseLaunchSpec narrows what the operator can be asked to confirm.

import { strict as assert } from 'assert';
import {
  parseLaunchSpec,
  fetchLaunchSpec,
  formatCommandLine,
  sameSpec,
} from '../../../integrations/open-design/OpenDesignLaunchSpec';

// Recorded from the live Open Design 0.24.1 daemon (win32), paths shortened.
const RECORDED = {
  command: 'C:\\Users\\me\\AppData\\Local\\Programs\\Open Design\\Open Design.exe',
  args: ['C:\\Users\\me\\AppData\\Local\\Programs\\Open Design\\resources\\app\\prebundled\\daemon\\daemon-cli.mjs', 'mcp', '--daemon-url', 'http://127.0.0.1:7456'],
  env: { OD_DATA_DIR: 'C:/Users/me/AppData/Roaming/Open Design', ELECTRON_RUN_AS_NODE: '1' },
  daemonUrl: 'http://127.0.0.1:7456',
  webBaseUrl: null,
  platform: 'win32',
  cliExists: true,
  nodeExists: true,
  buildHint: null,
};

const withField = (patch: Record<string, unknown>) => ({ ...RECORDED, ...patch });

suite('integrations/open-design OpenDesignLaunchSpec (FX949)', () => {
  test('accepts the recorded 0.24.1 install-info payload', () => {
    const r = parseLaunchSpec(RECORDED);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.spec.command, RECORDED.command);
      assert.deepEqual(r.spec.args, RECORDED.args);
      assert.deepEqual(r.spec.env, RECORDED.env);
    }
  });

  test('accepts a POSIX absolute command (macOS desktop install)', () => {
    const r = parseLaunchSpec(withField({ command: '/Applications/Open Design.app/Contents/MacOS/Open Design', args: ['/Applications/Open Design.app/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs', 'mcp'] }));
    assert.ok(r.ok);
  });

  test('rejects a relative or bare command (e.g. "od", which Git Bash resolves to octal-dump)', () => {
    for (const command of ['od', 'bin/od', '', 7]) {
      const r = parseLaunchSpec(withField({ command }));
      assert.equal(r.ok, false, String(command));
    }
  });

  test('rejects args whose script path is missing or relative, or non-string args', () => {
    for (const args of [[], ['daemon-cli.mjs', 'mcp'], [RECORDED.args[0], 3], 'mcp']) {
      assert.equal(parseLaunchSpec(withField({ args })).ok, false, JSON.stringify(args));
    }
  });

  test('rejects any env key outside OD_DATA_DIR / ELECTRON_RUN_AS_NODE, including NODE_OPTIONS', () => {
    const r = parseLaunchSpec(withField({ env: { ...RECORDED.env, NODE_OPTIONS: '--require C:\\evil.js' } }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.reason, /NODE_OPTIONS/);
    assert.equal(parseLaunchSpec(withField({ env: { PATH: 'C:\\evil' } })).ok, false);
  });

  test('rejects non-string env values and missing env', () => {
    assert.equal(parseLaunchSpec(withField({ env: { OD_DATA_DIR: 5 } })).ok, false);
    assert.equal(parseLaunchSpec(withField({ env: undefined })).ok, false);
    assert.equal(parseLaunchSpec(null).ok, false);
  });

  test('formatCommandLine shows every env pair and the full argv', () => {
    const r = parseLaunchSpec(RECORDED);
    assert.ok(r.ok);
    if (!r.ok) return;
    const line = formatCommandLine(r.spec);
    // Values with spaces are shown quoted, so match key and full value separately.
    for (const [k, v] of Object.entries(RECORDED.env)) {
      assert.ok(line.includes(`${k}=`), k);
      assert.ok(line.includes(v), `${k} value`);
    }
    assert.ok(line.includes('"C:/Users/me/AppData/Roaming/Open Design"'), 'space-containing value is quoted');
    assert.ok(line.includes('Open Design.exe'));
    assert.ok(line.includes('--daemon-url'));
  });

  test('sameSpec distinguishes a changed command, arg or env value', () => {
    const r = parseLaunchSpec(RECORDED);
    assert.ok(r.ok);
    if (!r.ok) return;
    const a = r.spec;
    assert.equal(sameSpec(a, { ...a, args: [...a.args] }), true);
    assert.equal(sameSpec(a, { ...a, args: [...a.args.slice(0, 3), 'http://127.0.0.1:9999'] }), false);
    assert.equal(sameSpec(a, { ...a, env: { ...a.env, OD_DATA_DIR: 'D:/other' } }), false);
    assert.equal(sameSpec(a, null), false);
  });

  test('fetchLaunchSpec reads /api/mcp/install-info and parses it', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url));
      return { ok: true, json: async () => RECORDED } as unknown as Response;
    }) as unknown as typeof fetch;
    const r = await fetchLaunchSpec({ fetchImpl });
    assert.deepEqual(calls, ['http://127.0.0.1:7456/api/mcp/install-info']);
    assert.ok(r.ok);
  });

  test('fetchLaunchSpec fails closed on non-200 and on refused connections', async () => {
    const non200 = (async () => ({ ok: false, status: 403, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    const refused = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    assert.equal((await fetchLaunchSpec({ fetchImpl: non200 })).ok, false);
    assert.equal((await fetchLaunchSpec({ fetchImpl: refused })).ok, false);
  });
});
