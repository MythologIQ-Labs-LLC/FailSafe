/** Adversarial restart checks: local SHA-256 parity does not prove publisher identity. */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash, generateKeyPairSync } from 'crypto';
import * as publisher from '../../voice-pack/publisher-auth';
import { probeVoicePackState } from '../../voice-pack/voice-pack-detector';
import { VOICE_ASSETS } from '../../voice-pack/safe-archive';

const signCandidate = require('../../../scripts/voice-pack-auth.cjs').signCandidate as
  (candidate: unknown, privatePem: string, publicPem: string) =>
    { payload: Buffer; signature: Buffer };
let privatePem: string, publicPem: string;

function signedPack(root: string) {
  const dir = path.join(root, 'voice-pack');
  const hashes: Record<string, string> = {};
  for (const name of VOICE_ASSETS) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fixture-' + name);
    hashes[name] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  const manifest = { version: '5.2.0', builtAt: '2026-11-20T00:00:00Z',
    expectedFiles: [...VOICE_ASSETS], sha256: hashes };
  const raw = Buffer.from(JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'voice-pack.manifest.json'), raw);
  const signed = signCandidate({
    status: 'UNSIGNED_CANDIDATE_ONLY', repository: 'MythologIQ-Labs-LLC/FailSafe',
    version: '5.2.0', sourceSha: 'a'.repeat(40),
    filename: 'failsafe-voice-pack-5.2.0.tar.gz', archiveSha256: 'b'.repeat(64),
    manifestSha256: createHash('sha256').update(raw).digest('hex'), filesVerified: 6,
  }, privatePem, publicPem);
  fs.writeFileSync(path.join(dir, 'voice-pack-release.json'), signed.payload);
  fs.writeFileSync(path.join(dir, 'voice-pack-release.json.sig'),
    signed.signature.toString('base64') + '\n');
  return { dir, manifest };
}

suite('voice-pack signed restart evidence #732', () => {
  let root: string;
  let original: typeof publisher.loadPinnedVoicePublisherKey;
  setup(() => {
    root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'failsafe-voice-restart-'));
    const pair = generateKeyPairSync('ed25519');
    privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    original = publisher.loadPinnedVoicePublisherKey;
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = () => publicPem;
  });
  teardown(() => {
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = original;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('a signed authentic pack survives activation and a second probe', async () => {
    signedPack(root);
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'installed');
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'installed');
  });

  test('matching local hashes without publisher-signed receipt are corrupt', async () => {
    const { dir } = signedPack(root);
    fs.unlinkSync(path.join(dir, 'voice-pack-release.json'));
    const result = await probeVoicePackState(root, '5.2.0');
    assert.equal(result.state, 'corrupt');
    assert.ok(result.missingFiles?.includes('voice-pack-release.json'));
  });

  test('tampered detached signature is refused on restart', async () => {
    const { dir } = signedPack(root);
    fs.writeFileSync(path.join(dir, 'voice-pack-release.json.sig'),
      Buffer.alloc(64).toString('base64') + '\n');
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'corrupt');
  });

  test('high-bit signature encoding is refused after restart', async () => {
    const { dir } = signedPack(root);
    const file = path.join(dir, 'voice-pack-release.json.sig');
    const canonical = fs.readFileSync(file);
    const changed = Buffer.from(canonical);
    changed[0] |= 0x80;
    assert.notDeepEqual(changed, canonical);
    fs.writeFileSync(file, changed);
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'corrupt');
  });

  test('a forged local manifest and matching forged executable are still corrupt', async () => {
    const { dir, manifest } = signedPack(root);
    const asset = VOICE_ASSETS[0];
    const file = path.join(dir, asset);
    fs.writeFileSync(file, 'FORGED-LOCAL-EXECUTABLE');
    manifest.sha256[asset] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    fs.writeFileSync(path.join(dir, 'voice-pack.manifest.json'), JSON.stringify(manifest));
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'corrupt');
  });

  test('symlinked receipt cannot activate a pack even when signature is valid', async () => {
    if (process.platform === 'win32') return;
    const { dir } = signedPack(root);
    const receipt = path.join(dir, 'voice-pack-release.json');
    const other = path.join(root, 'outside-release.json');
    fs.renameSync(receipt, other);
    fs.symlinkSync(other, receipt);
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'corrupt');
    assert.ok(fs.existsSync(other));
  });

  test('oversized signed receipt is refused before allocation or activation', async () => {
    const { dir } = signedPack(root);
    fs.writeFileSync(path.join(dir, 'voice-pack-release.json'), 'X'.repeat(4097));
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'corrupt');
  });

  test('another publisher key cannot confer installed status', async () => {
    signedPack(root);
    const other = generateKeyPairSync('ed25519');
    const otherPem = other.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = () => otherPem;
    assert.equal((await probeVoicePackState(root, '5.2.0')).state, 'corrupt');
  });
});
