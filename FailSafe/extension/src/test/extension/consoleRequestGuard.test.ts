/**
 * #538 lane B (plan-538b LD4): the Console request guard refuses requests that did not
 * come from the Console page on this machine. Loaded with a guarded require so the
 * suite runs (and fails by assertion) on the source before the module exists.
 */
import { strict as assert } from 'assert';

type Refusal = 'host' | 'origin' | 'content-type' | null;
type GuardModule = {
  consoleRequestRefusal(req: { headers: Record<string, string | undefined> }, opts: { requireJson: boolean }): Refusal;
};

function load(): GuardModule | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { return require('../../roadmap/routes/consoleRequestGuard') as GuardModule; } catch { return null; }
}

const JSON_CT = 'application/json';

suite('#538 Console request guard', () => {
  const refusal = (headers: Record<string, string | undefined>, requireJson = true): Refusal => {
    const mod = load();
    assert.ok(mod, 'consoleRequestGuard module exists');
    return mod!.consoleRequestRefusal({ headers }, { requireJson });
  };

  test('loopback Host names pass, with or without a port', () => {
    for (const host of ['localhost:9376', '127.0.0.1:9376', '[::1]:9376', 'LOCALHOST:9376', 'localhost', '[::1]']) {
      assert.equal(refusal({ host, 'content-type': JSON_CT }), null, host);
    }
  });

  test('other Host values are refused', () => {
    for (const host of [undefined, '', 'evil.example:9376', 'localhost.evil.example', '127.0.0.1.nip.io:9376',
      '127.0.0.2:9376', '[::2]:9376', 'localhost:93x6', 'localhost:9376:1', '[::1]x']) {
      assert.equal(refusal({ host, 'content-type': JSON_CT }), 'host', String(host));
    }
  });

  test('Origin must equal http:// plus the Host when present', () => {
    assert.equal(refusal({ host: 'localhost:9376', origin: 'http://localhost:9376', 'content-type': JSON_CT }), null);
    assert.equal(refusal({ host: 'localhost:9376', origin: 'HTTP://LOCALHOST:9376', 'content-type': JSON_CT }), null);
    for (const origin of ['http://evil.example', 'null', 'http://127.0.0.1:9376', 'http://localhost:9377',
      'https://localhost:9376', 'http://localhost:9376/', 'vscode-webview://abc']) {
      assert.equal(refusal({ host: 'localhost:9376', origin, 'content-type': JSON_CT }), 'origin', origin);
    }
  });

  test('the media type must be exactly application/json', () => {
    for (const ct of ['application/json', 'Application/JSON', 'application/json; charset=utf-8', ' application/json ;x=y']) {
      assert.equal(refusal({ host: 'localhost:9376', 'content-type': ct }), null, ct);
    }
    for (const ct of [undefined, '', 'text/plain', 'text/plain; charset=application/json', 'text/plain;application/json',
      'application/json-patch+json', 'multipart/form-data', 'application/x-www-form-urlencoded']) {
      assert.equal(refusal({ host: 'localhost:9376', 'content-type': ct }), 'content-type', String(ct));
    }
  });

  test('requireJson false checks Host and Origin only', () => {
    assert.equal(refusal({ host: 'localhost:9376' }, false), null);
    assert.equal(refusal({ host: 'localhost:9376', 'content-type': 'text/plain' }, false), null);
    assert.equal(refusal({ host: 'evil.example' }, false), 'host');
    assert.equal(refusal({ host: 'localhost:9376', origin: 'http://evil.example' }, false), 'origin');
  });
});
