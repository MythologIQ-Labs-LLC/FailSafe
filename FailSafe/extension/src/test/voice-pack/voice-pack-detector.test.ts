// FX491 — voice-pack-detector functional tests.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 1.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash, generateKeyPairSync } from 'crypto';
import * as publisher from '../../voice-pack/publisher-auth';

import { probeVoicePackState } from '../../voice-pack/voice-pack-detector';
import { VOICE_ASSETS } from '../../voice-pack/safe-archive';
import type { VoicePackManifest } from '../../voice-pack/types';

interface TestSigner { privatePem: string; publicPem: string }
let activeSigner: TestSigner | undefined;
const signCandidate = require('../../../scripts/voice-pack-auth.cjs').signCandidate as
  (candidate: unknown, privatePem: string, publicPem: string) =>
    { payload: Buffer; signature: Buffer };

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256OfFile(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

interface FixtureOptions {
  manifestVersion: string;
  files?: Array<{ rel: string; content: string }>;
  omitManifest?: boolean;
  corruptOneFile?: boolean;
  /** Override manifest contents AFTER files written (used for sha256 desync tests). */
  manifestOverride?: VoicePackManifest;
}

function writePackFixture(globalStoragePath: string, opts: FixtureOptions): VoicePackManifest {
  const packDir = path.join(globalStoragePath, 'voice-pack');
  fs.mkdirSync(packDir, { recursive: true });

  const sha256: Record<string, string> = {};
  const files = opts.files ?? VOICE_ASSETS.map(rel => ({ rel, content: 'verified-' + rel }));
  for (const f of files) {
    const abs = path.join(packDir, f.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content, 'utf8');
    sha256[f.rel] = sha256OfFile(abs);
  }

  if (opts.corruptOneFile && files.length > 0) {
    const first = path.join(packDir, files[0].rel);
    fs.writeFileSync(first, 'CORRUPTED PAYLOAD', 'utf8');
  }

  const manifest: VoicePackManifest = opts.manifestOverride ?? {
    version: opts.manifestVersion,
    builtAt: new Date().toISOString(),
    expectedFiles: files.map((f) => f.rel),
    sha256,
  };

  if (!opts.omitManifest) {
    const raw = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(packDir, 'voice-pack.manifest.json'), raw);
    if (activeSigner) {
      const candidate = {
        status: 'UNSIGNED_CANDIDATE_ONLY',
        repository: 'MythologIQ-Labs-LLC/FailSafe',
        version: opts.manifestVersion,
        sourceSha: 'a'.repeat(40),
        filename: 'failsafe-voice-pack-' + opts.manifestVersion + '.tar.gz',
        archiveSha256: 'b'.repeat(64),
        manifestSha256: createHash('sha256').update(raw).digest('hex'),
        filesVerified: 6,
      };
      const signed = signCandidate(candidate, activeSigner.privatePem, activeSigner.publicPem);
      fs.writeFileSync(path.join(packDir, 'voice-pack-release.json'), signed.payload);
      fs.writeFileSync(path.join(packDir, 'voice-pack-release.json.sig'),
        signed.signature.toString('base64') + '\n');
    }
  }
  return manifest;
}

suite('voice-pack-detector — probeVoicePackState', () => {
  let globalStoragePath: string;

  let originalPublisher: typeof publisher.loadPinnedVoicePublisherKey;
  setup(() => {
    globalStoragePath = mkTempDir('failsafe-voice-pack-detector-');
    const keys = generateKeyPairSync('ed25519');
    activeSigner = {
      privatePem: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
    originalPublisher = publisher.loadPinnedVoicePublisherKey;
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = () => activeSigner!.publicPem;
  });

  teardown(() => {
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = originalPublisher;
    activeSigner = undefined;
    fs.rmSync(globalStoragePath, { recursive: true, force: true });
  });

  test('returns absent when voice-pack/ directory is missing', async () => {
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'absent');
    assert.strictEqual(result.version, undefined);
  });

  test('returns installed with version + manifestPath when manifest + files valid', async () => {
    writePackFixture(globalStoragePath, {
      manifestVersion: '5.2.0',

    });
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'installed');
    assert.strictEqual(result.version, '5.2.0');
    assert.ok(result.manifestPath?.endsWith('voice-pack.manifest.json'));
  });

  test('returns stale when manifest version < required minimum', async () => {
    writePackFixture(globalStoragePath, {
      manifestVersion: '5.1.0',

    });
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'stale');
    assert.strictEqual(result.version, '5.1.0');
  });

  test('signed versions beyond Number.MAX_SAFE_INTEGER remain ordered exactly', async () => {
    // Both versions are syntactically valid and publisher-authenticated. Number
    // rounds these values together; BigInt must label the lower pack stale.
    const lower = '9007199254740992.0.0';
    const higher = '9007199254740993.0.0';
    writePackFixture(globalStoragePath, { manifestVersion: lower });
    const stale = await probeVoicePackState(globalStoragePath, higher);
    assert.strictEqual(stale.state, 'stale');
    assert.strictEqual(stale.version, lower);
    assert.strictEqual((await probeVoicePackState(globalStoragePath, lower)).state, 'installed');
  });

  test('returns corrupt when manifest exists but a referenced file fails sha256', async () => {
    writePackFixture(globalStoragePath, {
      manifestVersion: '5.2.0',

      corruptOneFile: true,
    });
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'corrupt');
    assert.ok(
      result.missingFiles && result.missingFiles.length >= 1,
      'missingFiles should list the desync',
    );
  });

  test('rejects path traversal in globalStoragePath argument', async () => {
    await assert.rejects(
      () => probeVoicePackState('/etc/passwd/../etc/passwd', '5.2.0'),
      /unsafe globalStoragePath|path traversal/i,
    );
  });
  test('rejects an empty or partial manifest instead of falsely reporting installed', async () => {
    const manifest = writePackFixture(globalStoragePath, { manifestVersion: '5.2.0' });
    const dest = path.join(globalStoragePath, 'voice-pack', 'voice-pack.manifest.json');
    for (const expectedFiles of [[], ['piper/piper.min.js']]) {
      fs.writeFileSync(dest, JSON.stringify({ ...manifest, expectedFiles }));
      assert.equal((await probeVoicePackState(globalStoragePath, '5.2.0')).state, 'corrupt');
    }
  });

  test('rejects a manifest traversal entry without reading the referenced outside file', async () => {
    const manifest = writePackFixture(globalStoragePath, { manifestVersion: '5.2.0' });
    const secret = path.join(globalStoragePath, 'private.txt');
    fs.writeFileSync(secret, 'PRIVATE LOCAL CONTENT');
    fs.writeFileSync(path.join(globalStoragePath, 'voice-pack', 'voice-pack.manifest.json'),
      JSON.stringify({ ...manifest, expectedFiles: ['../private.txt'], sha256: {
        '../private.txt': sha256OfFile(secret),
      } }));
    assert.equal((await probeVoicePackState(globalStoragePath, '5.2.0')).state, 'corrupt');
    assert.equal(fs.readFileSync(secret, 'utf8'), 'PRIVATE LOCAL CONTENT');
  });

  test('linked assets and manifest are refused even when their target hashes match', async () => {
    if (process.platform === 'win32') return; // symlink privileges differ
    const manifest = writePackFixture(globalStoragePath, { manifestVersion: '5.2.0' });
    const dir = path.join(globalStoragePath, 'voice-pack');
    const asset = path.join(dir, VOICE_ASSETS[0]);
    const foreign = path.join(globalStoragePath, 'outside.dat');
    fs.writeFileSync(foreign, fs.readFileSync(asset));
    fs.unlinkSync(asset);
    fs.symlinkSync(foreign, asset);
    assert.equal((await probeVoicePackState(globalStoragePath, '5.2.0')).state, 'corrupt');

    fs.unlinkSync(asset);
    fs.writeFileSync(asset, fs.readFileSync(foreign));
    const manifestFile = path.join(dir, 'voice-pack.manifest.json');
    const outsideManifest = path.join(globalStoragePath, 'outside-manifest.json');
    fs.writeFileSync(outsideManifest, JSON.stringify(manifest));
    fs.unlinkSync(manifestFile);
    fs.symlinkSync(outsideManifest, manifestFile);
    assert.equal((await probeVoicePackState(globalStoragePath, '5.2.0')).state, 'corrupt');
  });

  test('linked Piper directory is refused even when every target asset matches', async () => {
    if (process.platform === 'win32') return;
    writePackFixture(globalStoragePath, { manifestVersion: '5.2.0' });
    const root = path.join(globalStoragePath, 'voice-pack');
    const linked = path.join(root, 'piper');
    const elsewhere = path.join(globalStoragePath, 'outside-piper');
    fs.renameSync(linked, elsewhere);
    fs.symlinkSync(elsewhere, linked, 'dir');
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.equal(result.state, 'corrupt');
    assert.ok(fs.existsSync(path.join(elsewhere, 'piper.min.js')));
  });

  test('linked pack directory is corrupt rather than following its content', async () => {
    if (process.platform === 'win32') return;
    const other = fs.mkdtempSync(path.join(globalStoragePath, 'real-'));
    writePackFixture(other, { manifestVersion: '5.2.0' });
    fs.symlinkSync(path.join(other, 'voice-pack'), path.join(globalStoragePath, 'voice-pack'));
    assert.equal((await probeVoicePackState(globalStoragePath, '5.2.0')).state, 'corrupt');
  });

  test('rejects oversized manifest or payload before unbounded reads', async () => {
    writePackFixture(globalStoragePath, { manifestVersion: '5.2.0' });
    const dir = path.join(globalStoragePath, 'voice-pack');
    const file = path.join(dir, VOICE_ASSETS[0]);
    fs.truncateSync(file, 75 * 1024 * 1024 + 1);
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.equal(result.state, 'corrupt');
    assert.ok(result.missingFiles?.includes(VOICE_ASSETS[0]));
    fs.writeFileSync(path.join(dir, 'voice-pack.manifest.json'), 'x'.repeat(64 * 1024 + 1));
    assert.equal((await probeVoicePackState(globalStoragePath, '5.2.0')).state, 'corrupt');
  });

  test('unexpected extra pack content cannot masquerade as a valid install', async () => {
    writePackFixture(globalStoragePath, { manifestVersion: '5.2.0' });
    const stray = path.join(globalStoragePath, 'voice-pack', 'piper', 'unrelated.js');
    fs.writeFileSync(stray, 'not part of pack');
    assert.equal((await probeVoicePackState(globalStoragePath, '5.2.0')).state, 'corrupt');
    assert.equal(fs.readFileSync(stray, 'utf8'), 'not part of pack');
  });

});
