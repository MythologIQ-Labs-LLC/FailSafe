/**
 * qorlogic/consumer/consumer-adapter — ONE adapter boundary for file-based
 * Qor-logic artifact consumption (#233). Classifies artifact state
 * (ok / unavailable / malformed / unsupported / stale) and DELEGATES parsing
 * to the existing canonical parsers (plan LD1: wrap, don't rewrite).
 *
 * Read-only by contract: the adapter never writes or repairs canonical
 * evidence — envelopes are views. Version anchor is the existing B197 floor
 * surface (`QorLogicVersionStatus`), not a new constant (plan LD2).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { parseMetaLedgerEntries, type MetaLedgerEntry } from '../meta-ledger-model';
export type { MetaLedgerEntry };
import { parseFeatureIndex, type FeatureRow } from '../../roadmap/tracker/tracker-parsers';
import type { TrackerManifest } from '../../roadmap/tracker/tracker-model';
import type { AuditGateArtifact } from '../../qorelogic/risk/AuditGateArtifactReader';
import type { QorLogicVersionStatus } from '../qorLogicInstallRecord';
import type { ArtifactEnvelope, ArtifactProvenance, ArtifactState } from './types';

export interface ConsumerReadOptions {
  /** B197 version-floor result; `meetsFloor === false` -> state `unsupported`. */
  versionStatus?: QorLogicVersionStatus;
  /** When set, an `ok` artifact older than this downgrades to `stale` (data kept). */
  maxAgeMs?: number;
}

/** Mirrors AuditGateArtifactReader.read() sessionId validation (:27-28). */
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

function mtimeIsoOf(sourcePath: string): string | null {
  try {
    return fs.statSync(sourcePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function envelope<T>(
  artifact: string,
  state: ArtifactState,
  data: T | null,
  sourcePath: string,
  reason: string | null,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<T> {
  const provenance: ArtifactProvenance = {
    sourcePath,
    mtimeIso: mtimeIsoOf(sourcePath),
    qorVersion: opts?.versionStatus?.installed ?? null,
  };
  return { artifact, state, data, provenance, reason };
}

/** Non-null exactly when the installed qor-logic version misses the B197 floor. */
function unsupportedReason(opts?: ConsumerReadOptions): string | null {
  const vs = opts?.versionStatus;
  if (!vs || vs.meetsFloor) return null;
  return `qor-logic ${vs.installed ?? 'not installed'} is below the required minimum ${vs.minimum}`;
}

/**
 * One already-attempted read: `text` is non-null exactly on success. `readError`, set only
 * when `text` is null, distinguishes "the artifact does not exist" (`readError` absent) from
 * "the artifact exists but could not be read" (EACCES/EISDIR/etc — `readError` set), which
 * `classifyRead` maps to `unavailable` vs `malformed` respectively. This is the one seam
 * every classifier (fs-backed or a caller's own injected read) must fill in correctly: an fs
 * read that swallows every error to a single "absent" value cannot make that distinction, and
 * silently misreports a present-but-unreadable artifact as "nothing here" instead of
 * "cannot be trusted" — exactly the silent-degrade class #233 exists to close.
 */
export interface RawArtifactRead {
  text: string | null;
  /** ISO-8601 mtime when known; null when unavailable (absent artifact, or a seam with no
   *  real mtime to report, e.g. an in-memory test double). */
  mtimeIso: string | null;
  readError?: string;
}

/**
 * The one classification ladder every artifact reader shares (#233), whether the read came
 * from a real fs stat+read (`classifyFile`) or a caller-supplied seam that already attempted
 * its own read (`classifyMetaLedgerText`). below-floor version -> `unsupported`; `text ===
 * null` with no `readError` -> `unavailable`; `text === null` WITH a `readError`, parse
 * throw, or non-empty-input-parses-empty -> `malformed` (reason names the source path); older
 * than `maxAgeMs` (only checked when `mtimeIso` is known) -> `stale` (data kept); else `ok`.
 * Never writes.
 */
function classifyRead<T>(
  artifact: string,
  sourcePath: string,
  read: RawArtifactRead,
  parse: (text: string) => T,
  isEmpty: (data: T) => boolean,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<T> {
  const provenance: ArtifactProvenance = {
    sourcePath, mtimeIso: read.mtimeIso, qorVersion: opts?.versionStatus?.installed ?? null,
  };
  const versionReason = unsupportedReason(opts);
  if (versionReason) {
    return { artifact, state: 'unsupported', data: null, provenance, reason: versionReason };
  }
  if (read.text === null) {
    if (read.readError) {
      return {
        artifact, state: 'malformed', data: null, provenance,
        reason: `failed to read ${sourcePath}: ${read.readError}`,
      };
    }
    return { artifact, state: 'unavailable', data: null, provenance, reason: `artifact not found: ${sourcePath}` };
  }
  let data: T;
  try {
    data = parse(read.text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { artifact, state: 'malformed', data: null, provenance, reason: `failed to parse ${sourcePath}: ${detail}` };
  }
  if (read.text.trim().length > 0 && isEmpty(data)) {
    return {
      artifact, state: 'malformed', data: null, provenance,
      reason: `non-empty artifact parsed to empty: ${sourcePath}`,
    };
  }
  const maxAgeMs = opts?.maxAgeMs;
  if (maxAgeMs !== undefined && read.mtimeIso !== null && Date.now() - Date.parse(read.mtimeIso) > maxAgeMs) {
    return {
      artifact, state: 'stale', data, provenance,
      reason: `artifact is older than maxAgeMs=${maxAgeMs}: ${sourcePath}`,
    };
  }
  return { artifact, state: 'ok', data, provenance, reason: null };
}

/** Real fs stat+read for `classifyFile`. Absent (stat fails) -> `{ text: null, mtimeIso:
 *  null }`; present but unreadable (read throws after a successful stat, e.g. EACCES/EISDIR)
 *  -> `{ text: null, mtimeIso, readError }`, never conflated with "absent". */
function fsRead(sourcePath: string): RawArtifactRead {
  const mtimeIso = mtimeIsoOf(sourcePath);
  if (mtimeIso === null) return { text: null, mtimeIso: null };
  try {
    return { text: fs.readFileSync(sourcePath, 'utf8'), mtimeIso };
  } catch (err) {
    return { text: null, mtimeIso, readError: err instanceof Error ? err.message : String(err) };
  }
}

/** Classify one fs-backed artifact via the shared `classifyRead` ladder. */
function classifyFile<T>(
  root: string,
  relPath: string,
  artifact: string,
  parse: (text: string) => T,
  isEmpty: (data: T) => boolean,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<T> {
  const sourcePath = path.join(root, relPath);
  return classifyRead(artifact, sourcePath, fsRead(sourcePath), parse, isEmpty, opts);
}

export interface MetaLedgerRead {
  read: RawArtifactRead;
  sourcePath: string;
}

/** The single fs touch for docs/META_LEDGER.md. Callers needing both raw text and a
 *  classified envelope read ONCE through this and pass the result to both consumers. */
export function readMetaLedgerRaw(root: string): MetaLedgerRead {
  const sourcePath = path.join(root, 'docs', 'META_LEDGER.md');
  return { read: fsRead(sourcePath), sourcePath };
}

/** Overlay the B197 version-floor verdict onto an envelope classified WITHOUT options,
 *  reproducing `classifyRead`'s floor precedence (the floor short-circuits ahead of content
 *  state). Lets one read+parse serve both a floor-blind consumer and a floor-aware one.
 *
 *  Accepts ONLY `versionStatus`, deliberately NOT `ConsumerReadOptions`. `classifyRead` also
 *  branches on `maxAgeMs` (:127) to yield `stale`, and this overlay has no stale rung — a
 *  caller passing `maxAgeMs` would silently get `ok` where the real ladder gives `stale`.
 *  The narrowed parameter makes that call unrepresentable rather than merely undocumented.
 *  A consumer needing staleness must classify through `classifyMetaLedgerText` with full
 *  options instead of deriving. */
export function applyVersionFloor<T>(
  env: ArtifactEnvelope<T>,
  versionStatus?: QorLogicVersionStatus,
): ArtifactEnvelope<T> {
  const provenance = { ...env.provenance, qorVersion: versionStatus?.installed ?? null };
  const reason = unsupportedReason({ versionStatus });
  if (reason) return { artifact: env.artifact, state: 'unsupported', data: null, provenance, reason };
  return { ...env, provenance };
}

/** docs/META_LEDGER.md via the canonical parser (meta-ledger-model.ts:39). Defined in terms of
 *  `readMetaLedgerRaw` + `classifyMetaLedgerText` so a caller that already has its own raw read
 *  (e.g. `WorkspaceArtifactBuilder.build()`) can reuse it instead of reading twice (#233). */
export function readMetaLedgerArtifact(
  root: string,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<MetaLedgerEntry[]> {
  const { read, sourcePath } = readMetaLedgerRaw(root);
  return classifyMetaLedgerText(read, sourcePath, opts);
}

/**
 * Classify an already-attempted META_LEDGER read through the SAME `classifyRead` ladder
 * `readMetaLedgerArtifact` uses, for callers with their own injected read seam (e.g.
 * governance-sidecar.ts's `SidecarDeps`, #233 migration) rather than a workspace root. The
 * caller is responsible for supplying an accurate `read.readError` when its seam distinguishes
 * "absent" from "present but unreadable" (a seam that collapses both to `text: null` with no
 * `readError` — e.g. a plain try/catch-to-null — will under-report the file as `unavailable`
 * rather than `malformed`, which is why `governance-sidecar.ts`'s real fs seam does the
 * stat+read itself instead of reusing a generic catch-all).
 */
export function classifyMetaLedgerText(
  read: RawArtifactRead,
  sourcePath: string,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<MetaLedgerEntry[]> {
  return classifyRead('META_LEDGER', sourcePath, read, parseMetaLedgerEntries, (d) => d.length === 0, opts);
}

/** docs/FEATURE_INDEX.md via parseFeatureIndex (tracker-parsers.ts:29). */
export function readFeatureIndexArtifact(
  root: string,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<FeatureRow[]> {
  return classifyFile(
    root, path.join('docs', 'FEATURE_INDEX.md'), 'FEATURE_INDEX',
    parseFeatureIndex, (d) => d.length === 0, opts,
  );
}

/** Same yaml.load call TrackerRoute.ts:133 uses; non-mapping docs are malformed. */
function parseTrackerManifest(text: string): TrackerManifest {
  const doc = yaml.load(text);
  if (doc !== null && doc !== undefined && (typeof doc !== 'object' || Array.isArray(doc))) {
    throw new Error('programs.yaml did not parse to a mapping');
  }
  return (doc ?? {}) as TrackerManifest;
}

/** docs/roadmap/programs.yaml (the operator tracker manifest). */
export function readTrackerManifestArtifact(
  root: string,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<TrackerManifest> {
  return classifyFile(
    root, path.join('docs', 'roadmap', 'programs.yaml'), 'TRACKER_MANIFEST',
    parseTrackerManifest, (m) => Object.keys(m).length === 0, opts,
  );
}

/** Shape check mirrors AuditGateArtifactReader.ts:35-37 (object or bust). */
function parseAuditGate(text: string): AuditGateArtifact {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('audit.json did not parse to an object');
  }
  return parsed as AuditGateArtifact;
}

/** .qor/gates/<sessionId>/audit.json; invalid session id -> `unavailable`. */
export function readAuditGateArtifact(
  root: string,
  sessionId: string | undefined | null,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<AuditGateArtifact> {
  const gatesDir = path.join(root, '.qor', 'gates');
  const versionReason = unsupportedReason(opts);
  if (versionReason) {
    return envelope<AuditGateArtifact>('AUDIT_GATE', 'unsupported', null, gatesDir, versionReason, opts);
  }
  if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    return envelope<AuditGateArtifact>(
      'AUDIT_GATE', 'unavailable', null, gatesDir,
      'no valid audit session id (expected [A-Za-z0-9_-]+)', opts,
    );
  }
  return classifyFile(
    root, path.join('.qor', 'gates', sessionId, 'audit.json'), 'AUDIT_GATE',
    parseAuditGate, () => false, opts,
  );
}
