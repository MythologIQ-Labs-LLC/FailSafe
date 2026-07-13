/**
 * qorlogic/consumer/types — the versioned Qor-logic consumer-adapter contract
 * (#233). Every file-based Qor-logic artifact read flows through an
 * `ArtifactEnvelope` so consumers branch on an explicit five-state
 * classification instead of receiving indistinguishable valid-empties
 * (research brief F3: silent-degrade posture was universal).
 */

/** Explicit artifact classification — the #233 fail-visible contract. */
export type ArtifactState = 'ok' | 'unavailable' | 'malformed' | 'unsupported' | 'stale';

export interface ArtifactProvenance {
  /** Absolute path of the artifact the envelope was classified from. */
  sourcePath: string;
  /** File mtime as ISO-8601, or null when the file is absent/unreadable. */
  mtimeIso: string | null;
  /** Installed qor-logic version (from the B197 floor check), when known. */
  qorVersion: string | null;
}

export interface ArtifactEnvelope<T> {
  /** Stable artifact name (e.g. `META_LEDGER`, `FEATURE_INDEX`). */
  artifact: string;
  state: ArtifactState;
  /** Parsed payload — non-null ONLY when state is `ok` or `stale`. */
  data: T | null;
  provenance: ArtifactProvenance;
  /** Human-readable cause for any non-`ok` state; names the source path. */
  reason: string | null;
}

/** Envelope minus the payload — what the diagnostics surface reports. */
export interface ConsumerArtifactSummary {
  artifact: string;
  state: ArtifactState;
  reason: string | null;
  provenance: ArtifactProvenance;
}

export interface ConsumerDiagnostics {
  artifacts: ConsumerArtifactSummary[];
  /** false when any artifact is `malformed` or `unsupported`. */
  compatible: boolean;
  /** Installed qor-logic version echoed from the supplied version status. */
  qorVersion: string | null;
}
