/**
 * shield-receipt — the FailSafe SHIELD receipt v1 (#476).
 *
 * A receipt binds one commit SHA (the Seal commit), one repository and one API
 * host to one Qor session's verified audit and substantiate artifacts. Every
 * field is signed: sig = HMAC-SHA256(key, 'failsafe.shield-receipt/v1|' +
 * canonicalJson(receipt without sig)). Stored at
 * .failsafe/shield-receipts/<commitSha>.json, outside git, so writing a receipt
 * never changes the commit it names.
 */

import * as crypto from 'crypto';
import { hex64Equal } from './qor-provenance';

export const SHIELD_RECEIPT_SCHEMA = 'failsafe.shield-receipt/v1';

export interface ShieldReceiptBody {
  schema: typeof SHIELD_RECEIPT_SCHEMA;
  apiHost: string;
  repo: string;
  commitSha: string;
  sessionId: string;
  qorVersion: string;
  audit: { verdict: string; riskGrade: string; target: string; payloadSha256: string };
  substantiate: { verdict: string; planPath: string; payloadSha256: string; merkleSeal: string; ledgerEntry: number };
  issuedAt: string;
  alg: 'HMAC-SHA256';
}

export interface ShieldReceipt extends ShieldReceiptBody { sig: string }

/** Sorted keys (UTF-16 code unit order), no whitespace; throws on values JSON
 *  cannot represent exactly. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error('canonicalJson: non-plain object');
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  throw new Error(`canonicalJson: unsupported ${typeof value}`);
}

function bodyOf(r: ShieldReceiptBody | ShieldReceipt): ShieldReceiptBody {
  const { sig: _sig, ...body } = r as ShieldReceipt;
  return body;
}

function tag(body: ShieldReceiptBody, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(`${SHIELD_RECEIPT_SCHEMA}|${canonicalJson(body)}`, 'utf8').digest('hex');
}

export function signShieldReceipt(body: ShieldReceiptBody, key: Buffer): ShieldReceipt {
  const clean = bodyOf(body);
  return { ...clean, sig: tag(clean, key) };
}

/** Constant-time check of sig; false (never a throw) for a malformed sig. */
export function verifyShieldReceiptSignature(receipt: ShieldReceipt, key: Buffer): boolean {
  try {
    return hex64Equal(tag(bodyOf(receipt), key), receipt.sig);
  } catch {
    return false;
  }
}

/** sha256 hex of canonicalJson(full receipt including sig). */
export function receiptDigest(receipt: ShieldReceipt): string {
  return crypto.createHash('sha256').update(canonicalJson(receipt), 'utf8').digest('hex');
}

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const REPO = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;
const SESSION = /^[A-Za-z0-9_-]+$/;

const exactKeys = (o: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function validAudit(a: unknown): boolean {
  return isObj(a) && exactKeys(a, ['verdict', 'riskGrade', 'target', 'payloadSha256'])
    && str(a.verdict, 32) && str(a.riskGrade, 32) && str(a.target) && typeof a.payloadSha256 === 'string' && HEX64.test(a.payloadSha256);
}

function validSubstantiate(s: unknown): boolean {
  return isObj(s) && exactKeys(s, ['verdict', 'planPath', 'payloadSha256', 'merkleSeal', 'ledgerEntry'])
    && str(s.verdict, 32) && str(s.planPath) && typeof s.payloadSha256 === 'string' && HEX64.test(s.payloadSha256)
    && typeof s.merkleSeal === 'string' && HEX64.test(s.merkleSeal)
    && typeof s.ledgerEntry === 'number' && Number.isSafeInteger(s.ledgerEntry) && s.ledgerEntry > 0;
}

const TOP = ['schema', 'apiHost', 'repo', 'commitSha', 'sessionId', 'qorVersion', 'audit', 'substantiate', 'issuedAt', 'alg', 'sig'];

/** Strict parse: exact field sets at every level, exact types and formats. */
export function parseShieldReceipt(text: string): ShieldReceipt | null {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  if (!isObj(j) || !exactKeys(j, TOP)) return null;
  const ok = j.schema === SHIELD_RECEIPT_SCHEMA && j.alg === 'HMAC-SHA256'
    && typeof j.apiHost === 'string' && HOST.test(j.apiHost)
    && typeof j.repo === 'string' && REPO.test(j.repo)
    && typeof j.commitSha === 'string' && HEX40.test(j.commitSha)
    && typeof j.sessionId === 'string' && SESSION.test(j.sessionId)
    && str(j.qorVersion, 64) && str(j.issuedAt, 64) && typeof j.sig === 'string'
    && validAudit(j.audit) && validSubstantiate(j.substantiate);
  return ok ? (j as unknown as ShieldReceipt) : null;
}

export function isValidApiHost(host: unknown): host is string {
  return typeof host === 'string' && HOST.test(host);
}
