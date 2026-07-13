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
 * Classify one file-based artifact: below-floor version -> `unsupported`;
 * absent -> `unavailable`; read/parse throw OR non-empty-file-parses-empty ->
 * `malformed` (reason names the source path; plan LD3); older than
 * `maxAgeMs` -> `stale` (data kept); else `ok`. Never writes.
 */
function classifyFile<T>(
  root: string,
  relPath: string,
  artifact: string,
  parse: (text: string) => T,
  isEmpty: (data: T) => boolean,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<T> {
  const sourcePath = path.join(root, relPath);
  const versionReason = unsupportedReason(opts);
  if (versionReason) {
    return envelope<T>(artifact, 'unsupported', null, sourcePath, versionReason, opts);
  }
  const mtimeIso = mtimeIsoOf(sourcePath);
  if (mtimeIso === null) {
    return envelope<T>(artifact, 'unavailable', null, sourcePath, `artifact not found: ${sourcePath}`, opts);
  }
  let text: string;
  let data: T;
  try {
    text = fs.readFileSync(sourcePath, 'utf8');
    data = parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return envelope<T>(artifact, 'malformed', null, sourcePath, `failed to parse ${sourcePath}: ${detail}`, opts);
  }
  if (text.trim().length > 0 && isEmpty(data)) {
    return envelope<T>(artifact, 'malformed', null, sourcePath, `non-empty artifact parsed to empty: ${sourcePath}`, opts);
  }
  const maxAgeMs = opts?.maxAgeMs;
  if (maxAgeMs !== undefined && Date.now() - Date.parse(mtimeIso) > maxAgeMs) {
    return envelope(artifact, 'stale', data, sourcePath, `artifact is older than maxAgeMs=${maxAgeMs}: ${sourcePath}`, opts);
  }
  return envelope(artifact, 'ok', data, sourcePath, null, opts);
}

/** docs/META_LEDGER.md via the canonical parser (meta-ledger-model.ts:39). */
export function readMetaLedgerArtifact(
  root: string,
  opts?: ConsumerReadOptions,
): ArtifactEnvelope<MetaLedgerEntry[]> {
  return classifyFile(
    root, path.join('docs', 'META_LEDGER.md'), 'META_LEDGER',
    parseMetaLedgerEntries, (d) => d.length === 0, opts,
  );
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
