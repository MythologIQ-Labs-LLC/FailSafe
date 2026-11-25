// Voice-pack activation wiring tests.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 3.
// Mirrors the bicameral-activation.test.ts shape; exercises
// wireVoicePack(context, consoleServer) against a fake ConsoleServer surface
// and observes its mutations without booting a real extension host.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createHash, generateKeyPairSync } from 'crypto';
import * as publisher from '../../voice-pack/publisher-auth';
import { VOICE_ASSETS } from '../../voice-pack/safe-archive';

import { wireVoicePack } from '../../extension/bootstrapVoicePack';

interface ServerCalls {
  setVoicePackPath: Array<string | null>;
  broadcasts: Array<Record<string, unknown>>;
}

function fakeServer(): { server: any; calls: ServerCalls } {
  const calls: ServerCalls = { setVoicePackPath: [], broadcasts: [] };
  const server = {
    setVoicePackPath(p: string | null) { calls.setVoicePackPath.push(p); },
    broadcastEvent(d: Record<string, unknown>) { calls.broadcasts.push(d); },
  };
  return { server, calls };
}

function fakeContext(globalStoragePath: string): vscode.ExtensionContext {
  return {
    subscriptions: [] as { dispose: () => void }[],
    globalStorageUri: { fsPath: globalStoragePath } as vscode.Uri,
  } as unknown as vscode.ExtensionContext;
}

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

let signer: { privateKey: string; publicKey: string };
const signCandidate = require('../../../scripts/voice-pack-auth.cjs').signCandidate as
  (candidate: unknown, privatePem: string, publicPem: string) =>
    { payload: Buffer; signature: Buffer };

/** A real pack has exactly six canonical files, not a permissive one-file mock. */
function writeCanonicalPack(packDir: string, version: string): void {
  fs.mkdirSync(packDir, { recursive: true });
  const sha256: Record<string, string> = {};
  for (const rel of VOICE_ASSETS) {
    const filename = path.join(packDir, rel);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const data = 'activation-fixture:' + rel;
    fs.writeFileSync(filename, data, 'utf8');
    sha256[rel] = createHash('sha256').update(data).digest('hex');
  }
  const raw = Buffer.from(JSON.stringify({
    version,
    builtAt: new Date().toISOString(),
    expectedFiles: [...VOICE_ASSETS],
    sha256,
  }), 'utf8');
  fs.writeFileSync(path.join(packDir, 'voice-pack.manifest.json'), raw);
  const signed = signCandidate({
    status: 'UNSIGNED_CANDIDATE_ONLY', repository: 'MythologIQ-Labs-LLC/FailSafe',
    version, sourceSha: 'a'.repeat(40),
    filename: 'failsafe-voice-pack-' + version + '.tar.gz',
    archiveSha256: 'b'.repeat(64),
    manifestSha256: createHash('sha256').update(raw).digest('hex'), filesVerified: 6,
  }, signer.privateKey, signer.publicKey);
  fs.writeFileSync(path.join(packDir, 'voice-pack-release.json'), signed.payload);
  fs.writeFileSync(path.join(packDir, 'voice-pack-release.json.sig'),
    signed.signature.toString('base64') + '\n');
}

suite('bootstrapVoicePack — wireVoicePack', () => {
  let originalPublisher: typeof publisher.loadPinnedVoicePublisherKey;
  setup(() => {
    const keys = generateKeyPairSync('ed25519');
    signer = {
      privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
    originalPublisher = publisher.loadPinnedVoicePublisherKey;
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = () => signer.publicKey;
  });
  teardown(() => {
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = originalPublisher;
  });

  test('wireVoicePack with no pack installed sets voicePackPath to null', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-absent-');
    try {
      const { server, calls } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      assert.strictEqual(calls.setVoicePackPath.length, 1, 'one initial set');
      assert.strictEqual(calls.setVoicePackPath[0], null, 'null when pack absent');
    } finally {
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });

  test('wireVoicePack is lazy — does NOT trigger install at activation', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-lazy-');
    let installCalled = false;
    (globalThis as { fetch?: unknown }).fetch = async () => {
      installCalled = true;
      return { ok: true, status: 200, url: '', headers: { get: () => null }, body: null } as any;
    };
    try {
      const { server } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      assert.strictEqual(installCalled, false, 'wireVoicePack must not download at activation');
    } finally {
      delete (globalThis as { fetch?: unknown }).fetch;
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });

  test('wireVoicePack with installed pack sets voicePackPath to the directory', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-installed-');
    const packDir = path.join(globalStoragePath, 'voice-pack');
    writeCanonicalPack(packDir, '5.2.0');

    try {
      const { server, calls } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      assert.strictEqual(calls.setVoicePackPath[0], packDir, 'sets to pack dir when installed');
    } finally {
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });

  test('wireVoicePack ignores stale/corrupt pack — sets path to null so /vendor falls back', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-stale-');
    const packDir = path.join(globalStoragePath, 'voice-pack');
    writeCanonicalPack(packDir, '5.1.0'); // valid but below required 5.2.0

    try {
      const { server, calls } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      // Stale pack: voicePackPath should be null so the /vendor route falls
      // back to the default uiDir mount; UI surfaces the "Update voice pack"
      // affordance via /api/integrations/voice-pack/status.
      assert.strictEqual(calls.setVoicePackPath[0], null, 'null for stale pack');
    } finally {
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });
  test('wireVoicePack refuses a fabricated empty manifest rather than enabling the pack', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-corrupt-');
    try {
      const packDir = path.join(globalStoragePath, 'voice-pack');
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(path.join(packDir, 'voice-pack.manifest.json'), JSON.stringify({
        version: '5.2.0', builtAt: new Date().toISOString(), expectedFiles: [], sha256: {},
      }));
      const { server, calls } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      assert.strictEqual(calls.setVoicePackPath[0], null, 'corrupt pack cannot activate');
    } finally {
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });

});
