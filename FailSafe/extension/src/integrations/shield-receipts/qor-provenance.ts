/**
 * qor-provenance — TypeScript mirror of the installed qor-logic
 * gate_provenance module (#476): `_normalize`, `payload_digest`, `sign` and
 * sidecar verification. Gate artifacts are LF-normalized before hashing and
 * signing, so a CRLF checkout verifies the same as LF. The tag is HMAC-SHA256
 * keyed by the per-session key over `session_id|phase|` + normalized bytes.
 *
 * Honest ceiling (stated by qor-logic itself): the per-session key lives in the
 * workspace, so anyone who can write the workspace can also forge a tag. This
 * module proves tamper-evidence against an artifact edited without the key.
 */

import * as crypto from 'crypto';

const HEX64 = /^[0-9a-f]{64}$/;

/** Replace every CRLF with LF (lone CR is kept, as qor-logic does). */
export function normalizeLf(raw: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0x0d && raw[i + 1] === 0x0a) continue;
    out.push(raw[i]);
  }
  return Buffer.from(out);
}

export function qorPayloadDigest(raw: Buffer): string {
  return crypto.createHash('sha256').update(normalizeLf(raw)).digest('hex');
}

export function qorSign(phase: string, sessionId: string, raw: Buffer, key: Buffer): string {
  return crypto.createHmac('sha256', key)
    .update(Buffer.from(`${sessionId}|${phase}|`, 'utf8'))
    .update(normalizeLf(raw))
    .digest('hex');
}

/** Constant-time equality of two 64-hex strings; false for anything malformed. */
export function hex64Equal(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !HEX64.test(a) || !HEX64.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export interface QorSidecar {
  alg: 'HMAC-SHA256';
  session_id: string;
  phase: string;
  payload_sha256: string;
  hmac_tag: string;
}

export interface QorExpectation { sessionId: string; phase: string }

/** Parse a `<phase>.provenance` sidecar; undefined unless it is well formed and
 *  names the expected session and phase. */
export function parseQorSidecar(text: string, expected: QorExpectation): QorSidecar | undefined {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return undefined; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return undefined;
  const o = j as Record<string, unknown>;
  if (o.alg !== 'HMAC-SHA256' || o.session_id !== expected.sessionId || o.phase !== expected.phase) return undefined;
  if (typeof o.payload_sha256 !== 'string' || !HEX64.test(o.payload_sha256)) return undefined;
  if (typeof o.hmac_tag !== 'string' || !HEX64.test(o.hmac_tag)) return undefined;
  return o as unknown as QorSidecar;
}

export type QorArtifactCheck =
  | { kind: 'ok'; payloadSha256: string }
  | { kind: 'sidecar-invalid' }
  | { kind: 'payload' }
  | { kind: 'key-absent' }
  | { kind: 'hmac' };

/** Verify one artifact against its sidecar: structure, keyless digest, then HMAC. */
export function verifyQorArtifact(
  raw: Buffer, sidecarText: string, expected: QorExpectation, key: Buffer | undefined,
): QorArtifactCheck {
  const side = parseQorSidecar(sidecarText, expected);
  if (!side) return { kind: 'sidecar-invalid' };
  const digest = qorPayloadDigest(raw);
  if (!hex64Equal(digest, side.payload_sha256)) return { kind: 'payload' };
  if (!key) return { kind: 'key-absent' };
  if (!hex64Equal(qorSign(expected.phase, expected.sessionId, raw, key), side.hmac_tag)) return { kind: 'hmac' };
  return { kind: 'ok', payloadSha256: digest };
}
