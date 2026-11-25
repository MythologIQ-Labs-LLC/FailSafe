import { strict as assert } from 'assert';
import { generateKeyPairSync } from 'crypto';
import * as path from 'path';
import { verifyVoicePublisherAttestation } from '../../voice-pack/publisher-auth';

interface SignedFixture { receipt: Buffer; sig: Buffer; pem: string;
  archive: string; manifest: string }
const sign = require(path.resolve(__dirname, '../../../scripts/voice-pack-auth.cjs')) as {
  signCandidate: (candidate: unknown, priv: string, pub: string) =>
    { payload: Buffer; signature: Buffer };
};

function signed(): SignedFixture {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const candidate = {
    status: 'UNSIGNED_CANDIDATE_ONLY',
    repository: 'MythologIQ-Labs-LLC/FailSafe',
    version: '6.1.0',
    sourceSha: 'a'.repeat(40),
    filename: 'failsafe-voice-pack-6.1.0.tar.gz',
    archiveSha256: 'b'.repeat(64),
    manifestSha256: 'c'.repeat(64),
    filesVerified: 6,
  };
  const result = sign.signCandidate(candidate, priv, pem);
  return { receipt: result.payload, sig: result.signature,
    pem, archive: candidate.archiveSha256, manifest: candidate.manifestSha256 };
}
function verifyWith(x: SignedFixture, overrides: Partial<SignedFixture> = {}) {
  const y = { ...x, ...overrides };
  return verifyVoicePublisherAttestation(y.receipt,
    Buffer.from(y.sig.toString('base64') + '\n'), y.pem,
    '6.1.0', y.archive, y.manifest);
}

suite('publisher-auth — signer/client cryptographic contract #732', () => {
  test('signing producer authenticates consumer with exactly matching version and digests', () => {
    const result = verifyWith(signed());
    assert.equal(result.tag, 'v6.1.0-voice');
    assert.equal(result.sourceSha, 'a'.repeat(40));
  });

  test('a valid signature for a different archive digest or manifest is refused', () => {
    const x = signed();
    assert.throws(() => verifyWith(x, { archive: 'd'.repeat(64) }), /content digest/);
    assert.throws(() => verifyWith(x, { manifest: 'e'.repeat(64) }), /content digest/);
  });

  test('wrong publisher root and tampered signature are refused', () => {
    const x = signed();
    const other = signed();
    assert.throws(() => verifyWith(x, { pem: other.pem }), /content digest|publisher/);
    const sig = Buffer.from(x.sig);
    sig[0] ^= 0xff;
    assert.throws(() => verifyWith(x, { sig }), /signature mismatch/);
  });

  test('malformed or extended signed payload and signature are refused', () => {
    const x = signed();
    assert.throws(() => verifyWith(x, { receipt: Buffer.concat([x.receipt, Buffer.from('\n')]) }),
      /noncanonical/);
    assert.throws(() => verifyWith(x, { sig: Buffer.alloc(2) }), /signature encoding/);
  });

  test('high-bit-altered signature bytes cannot alias canonical Base64', () => {
    const x = signed();
    const canonical = Buffer.from(x.sig.toString('base64') + '\n', 'ascii');
    const altered = Buffer.from(canonical);
    altered[0] |= 0x80;
    assert.notDeepEqual(altered, canonical);
    assert.throws(() => verifyVoicePublisherAttestation(
      x.receipt, altered, x.pem, '6.1.0', x.archive, x.manifest),
    /signature encoding/);
  });

  test('a signed record cannot substitute a different extension version', () => {
    const x = signed();
    assert.throws(() => verifyVoicePublisherAttestation(
      x.receipt, Buffer.from(x.sig.toString('base64') + '\n'),
      x.pem, '6.1.1', x.archive, x.manifest), /content digest/);
  });
});
