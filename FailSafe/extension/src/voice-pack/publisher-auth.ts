/** #732: verify a purpose-bound publisher signature before promoting a pack.
 * Signer contract: scripts/voice-pack-auth.cjs, with exactly matching JSON
 * canonicalization, domain separation, source/version, and digest bindings.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash, createPublicKey, verify, KeyObject } from 'crypto';

const DOMAIN = Buffer.from('MythologIQ/FailSafe/VoicePack/v1\0', 'utf8');
const REPO = 'MythologIQ-Labs-LLC/FailSafe';
const ROOT = path.join(__dirname, 'publisher-public-key.pem');
const EXPECTED_KEYS = ['archiveSha256', 'filename', 'manifestSha256',
  'repository', 'schema', 'signerKeyId', 'sourceSha', 'tag', 'version'];
const SHA = /^[a-f0-9]{64}$/;
const SOURCE = /^[a-f0-9]{40}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function refuse(reason: string): never {
  throw new Error('publisher authentication refused: ' + reason);
}

/** This source-controlled pin must be approved and packaged before install. */
export function loadPinnedVoicePublisherKey(): string {
  let stat: fs.Stats;
  try { stat = fs.lstatSync(ROOT); }
  catch { return refuse('owner-approved publisher trust root not provisioned'); }
  if (!stat.isFile() || stat.isSymbolicLink() ||
      stat.size === 0 || stat.size > 8192) return refuse('invalid pinned trust root');
  const pem = fs.readFileSync(ROOT, 'utf8');
  try {
    const k = createPublicKey(pem);
    if (k.asymmetricKeyType !== 'ed25519') return refuse('non-Ed25519 trust root');
  } catch { return refuse('invalid pinned trust root'); }
  return pem;
}

interface SignedRelease {
  schema: string; repository: string; version: string;
  tag: string; filename: string; sourceSha: string;
  signerKeyId: string; archiveSha256: string; manifestSha256: string;
}

function parseSignedRelease(raw: Buffer): SignedRelease {
  if (raw.length === 0 || raw.length > 4096) return refuse('invalid signed record length');
  let value: unknown;
  try { value = JSON.parse(raw.toString('utf8')); }
  catch { return refuse('malformed signed record'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return refuse('invalid signed record');
  }
  const record = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(record).sort()) !==
      JSON.stringify([...EXPECTED_KEYS].sort())) return refuse('unexpected signed record fields');
  if (!raw.equals(Buffer.from(JSON.stringify(record) + '\n', 'utf8'))) {
    return refuse('noncanonical signed record');
  }
  return value as SignedRelease;
}

function parseSignature(raw: Buffer): Buffer {
  if (raw.length < 86 || raw.length > 90) return refuse('invalid signature encoding');
  const text = raw.toString('ascii');
  if (!/^[A-Za-z0-9+/]{86}==\n$/.test(text)) return refuse('invalid signature encoding');
  const result = Buffer.from(text.trimEnd(), 'base64');
  if (result.length !== 64 || result.toString('base64') + '\n' !== text) {
    return refuse('noncanonical signature encoding');
  }
  return result;
}

function keyAndId(pem: string): { key: KeyObject; id: string } {
  let key: KeyObject;
  try { key = createPublicKey(pem); }
  catch { return refuse('invalid pinned Ed25519 trust root'); }
  if (key.asymmetricKeyType !== 'ed25519') return refuse('invalid pinned Ed25519 key');
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer;
  return { key, id: 'sha256:' + hash(der) };
}

/** Call only after the validated archive's manifest is extracted to staging. */
export function verifyVoicePublisherAttestation(
  recordBytes: Buffer, signatureBytes: Buffer, trustedPem: string,
  version: string, archiveSha256: string, manifestSha256: string,
): SignedRelease {
  const record = parseSignedRelease(recordBytes);
  const signature = parseSignature(signatureBytes);
  const { key, id } = keyAndId(trustedPem);
  if (!VERSION.test(version) || !SOURCE.test(record.sourceSha) ||
      !SHA.test(archiveSha256) || !SHA.test(manifestSha256) ||
      record.schema !== 'failsafe.voice-pack.publisher.v1' ||
      record.repository !== REPO || record.version !== version ||
      record.tag !== 'v' + version + '-voice' ||
      record.filename !== 'failsafe-voice-pack-' + version + '.tar.gz' ||
      record.signerKeyId !== id || record.archiveSha256 !== archiveSha256 ||
      record.manifestSha256 !== manifestSha256) {
    return refuse('untrusted publisher, source, tag, version or content digest');
  }
  if (!verify(null, Buffer.concat([DOMAIN, recordBytes]), key, signature)) {
    return refuse('Ed25519 signature mismatch');
  }
  return record;
}

/** Reauthenticate installed content after a restart, without fetching an archive.
 * A signed archive hash is retained for provenance, while the signed raw
 * manifest hash and per-file hashes protect the actual installed payload.
 */
export function verifyInstalledVoiceAttestation(
  receipt: Buffer, signature: Buffer, pem: string,
  version: string, installedManifestSha256: string,
): void {
  const record = parseSignedRelease(receipt);
  verifyVoicePublisherAttestation(receipt, signature, pem,
    version, record.archiveSha256, installedManifestSha256);
}
