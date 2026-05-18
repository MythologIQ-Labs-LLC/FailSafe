// FX492 — voice-pack install-handler functional tests.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 1.
// F3 remediation (audit cycle 1): fetch + redirect-allowlist coverage.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

import {
  installVoicePack,
  uninstallVoicePack,
  resolveVoicePackUrl,
} from '../../voice-pack/install-handler';

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

interface FetchCall { url: string; init?: RequestInit }

interface FakeFetchHandler {
  url: string | RegExp;
  status?: number;
  body?: Uint8Array | string;
  /** Mutate the response.url field (simulates redirect chain final URL). */
  finalUrl?: string;
  throws?: Error;
}

function installFetchStub(handlers: FakeFetchHandler[]): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const matched = handlers.find((h) =>
      typeof h.url === 'string' ? String(url) === h.url : (h.url as RegExp).test(String(url))
    );
    if (!matched) {
      return mockResponse({ status: 404, body: '', finalUrl: String(url) });
    }
    if (matched.throws) throw matched.throws;
    return mockResponse({
      status: matched.status ?? 200,
      body: matched.body ?? new Uint8Array(0),
      finalUrl: matched.finalUrl ?? String(url),
    });
  };
  return { calls };
}

function mockResponse(opts: { status: number; body: Uint8Array | string; finalUrl: string }) {
  const bytes = typeof opts.body === 'string'
    ? new TextEncoder().encode(opts.body)
    : opts.body;
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    url: opts.finalUrl,
    headers: { get: () => null },
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }),
  };
}

function unstubFetch() {
  delete (globalThis as { fetch?: unknown }).fetch;
}

function buildFixturePackTar(): Uint8Array {
  // Minimal valid tar header is non-trivial; this test only verifies the
  // download/verify pipeline, not the extract. We stub spawn separately.
  return new TextEncoder().encode('FAKE-TAR-PAYLOAD');
}

function sha256OfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface ExtractStubControl {
  shouldFail: boolean;
}

function stubChildProcessSpawn(extractStub: ExtractStubControl, extractedFiles: Record<string, string>): { restore: () => void } {
  const cp = require('child_process');
  const original = cp.spawn;
  cp.spawn = (command: string, args: string[], _opts?: unknown) => {
    if (command === 'tar' && args.includes('-xzf')) {
      const stagingDir = args[args.indexOf('-C') + 1];
      if (!extractStub.shouldFail) {
        for (const [rel, content] of Object.entries(extractedFiles)) {
          const abs = path.join(stagingDir, rel);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, content, 'utf8');
        }
      }
      return fakeChildProcess(extractStub.shouldFail ? 1 : 0);
    }
    return original(command, args, _opts);
  };
  return { restore: () => { cp.spawn = original; } };
}

function fakeChildProcess(exitCode: number) {
  const handlers: Record<string, ((arg: any) => void)[]> = {};
  const fake = {
    on(event: string, fn: (arg: any) => void) {
      handlers[event] ??= [];
      handlers[event].push(fn);
      return fake;
    },
    stdout: { on: () => fake.stdout },
    stderr: { on: () => fake.stderr },
    kill: () => {},
  };
  // Fire close synchronously via microtask so the awaited promise resolves.
  setImmediate(() => {
    for (const fn of handlers['close'] ?? []) fn(exitCode);
  });
  return fake as unknown as ReturnType<typeof require>;
}

suite('voice-pack install-handler — installVoicePack', () => {
  let globalStoragePath: string;
  let extractStub: ExtractStubControl;
  let restoreSpawn: () => void;

  setup(() => {
    globalStoragePath = mkTempDir('failsafe-voice-pack-install-');
    extractStub = { shouldFail: false };
    const stub = stubChildProcessSpawn(extractStub, {
      'piper/piper.min.js': 'piper-payload',
      'voice-pack.manifest.json': JSON.stringify({
        version: '5.2.0',
        builtAt: '2026-05-18T00:00:00Z',
        expectedFiles: ['piper/piper.min.js'],
        sha256: { 'piper/piper.min.js': sha256OfBytes(new TextEncoder().encode('piper-payload')) },
      }),
    });
    restoreSpawn = stub.restore;
  });

  teardown(() => {
    restoreSpawn();
    unstubFetch();
    fs.rmSync(globalStoragePath, { recursive: true, force: true });
  });

  test('invokes fetch with the version-resolved URL AND redirect:follow option (F3 remediation)', async () => {
    const packBytes = buildFixturePackTar();
    const shaText = `${sha256OfBytes(packBytes)}  failsafe-voice-pack-5.2.0.tar.gz\n`;
    const { calls } = installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: packBytes },
      { url: /\.sha256$/, body: shaText },
    ]);
    try {
      await installVoicePack({ globalStoragePath, version: '5.2.0' });
    } catch (e) {
      // Manifest verification may fail because the fake tar didn't get
      // extracted into a real pack — that's the next-test's concern. We
      // only care here that fetch was invoked correctly.
    }
    const tarballCall = calls.find((c) => c.url.includes('failsafe-voice-pack-5.2.0.tar.gz'));
    assert.ok(tarballCall, 'fetch invoked with tarball URL');
    assert.strictEqual((tarballCall!.init as RequestInit)?.redirect, 'follow');
  });

  test('SHA256 mismatch aborts before extract (no staging atomic-rename to final)', async () => {
    const packBytes = buildFixturePackTar();
    const wrongShaText = `${'0'.repeat(64)}  failsafe-voice-pack-5.2.0.tar.gz\n`;
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: packBytes },
      { url: /\.sha256$/, body: wrongShaText },
    ]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath, version: '5.2.0' }),
      /sha256|checksum|integrity/i,
    );
    assert.strictEqual(
      fs.existsSync(path.join(globalStoragePath, 'voice-pack')),
      false,
      'final pack dir must not exist on sha256 failure',
    );
  });

  test('extract failure leaves staging dir without renaming over prior pack', async () => {
    // Pre-existing prior pack
    const finalDir = path.join(globalStoragePath, 'voice-pack');
    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, 'sentinel.txt'), 'PRIOR PACK', 'utf8');

    const packBytes = buildFixturePackTar();
    const shaText = `${sha256OfBytes(packBytes)}  failsafe-voice-pack-5.2.0.tar.gz\n`;
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: packBytes },
      { url: /\.sha256$/, body: shaText },
    ]);
    extractStub.shouldFail = true;

    await assert.rejects(() => installVoicePack({ globalStoragePath, version: '5.2.0' }));

    const sentinel = fs.readFileSync(path.join(finalDir, 'sentinel.txt'), 'utf8');
    assert.strictEqual(sentinel, 'PRIOR PACK', 'prior pack must be intact on extract failure');
  });

  test('success path atomic-renames staging to final', async () => {
    const packBytes = buildFixturePackTar();
    const shaText = `${sha256OfBytes(packBytes)}  failsafe-voice-pack-5.2.0.tar.gz\n`;
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: packBytes },
      { url: /\.sha256$/, body: shaText },
    ]);
    const result = await installVoicePack({ globalStoragePath, version: '5.2.0' });
    assert.strictEqual(result.ok, true);
    assert.ok(fs.existsSync(path.join(globalStoragePath, 'voice-pack', 'voice-pack.manifest.json')));
  });

  test('uninstallVoicePack removes globalStoragePath/voice-pack/ directory only', () => {
    const packDir = path.join(globalStoragePath, 'voice-pack');
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'piper.min.js'), 'piper', 'utf8');
    const sibling = path.join(globalStoragePath, 'other-data.json');
    fs.writeFileSync(sibling, '{}', 'utf8');

    uninstallVoicePack(globalStoragePath);

    assert.strictEqual(fs.existsSync(packDir), false, 'voice-pack dir removed');
    assert.strictEqual(fs.existsSync(sibling), true, 'sibling data preserved');
  });

  test('rejects malformed pack URL via spawn-boundary allowlist (resolveVoicePackUrl)', () => {
    assert.throws(() => resolveVoicePackUrl('not-a-semver'), /version|semver/i);
    assert.throws(() => resolveVoicePackUrl('5.2.0; rm -rf /'), /version|semver/i);
    const ok = resolveVoicePackUrl('5.2.0');
    assert.ok(ok.startsWith('https://github.com/MythologIQ/FailSafe/releases/download/v5.2.0-voice/'));
  });

  test('rejects non-GitHub redirect targets via bounded redirect allowlist (F3 remediation)', async () => {
    const packBytes = buildFixturePackTar();
    installFetchStub([
      // Simulate fetch following redirect to a non-GitHub host
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: packBytes, finalUrl: 'https://evil.example.com/pack.tar.gz' },
    ]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath, version: '5.2.0' }),
      /redirect|host|allowlist|not allowed/i,
    );
    assert.strictEqual(
      fs.existsSync(path.join(globalStoragePath, 'voice-pack')),
      false,
      'no bytes should reach disk when redirect target is rejected',
    );
  });
});
