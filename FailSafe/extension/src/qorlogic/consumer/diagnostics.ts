/**
 * qorlogic/consumer/diagnostics — the #233 compatibility-status surface.
 * Summarizes the four file-based Qor-logic artifacts into a machine-readable
 * `ConsumerDiagnostics` block (embedded in the hub payload as `qorConsumer`
 * by WorkspaceArtifactBuilder). `compatible` is false when any artifact is
 * `malformed` or `unsupported`; `unavailable`/`stale` are visible but do not
 * flip compatibility.
 */

import {
  readAuditGateArtifact,
  readFeatureIndexArtifact,
  readMetaLedgerArtifact,
  readTrackerManifestArtifact,
  type ConsumerReadOptions,
  type MetaLedgerEntry,
} from './consumer-adapter';
import type { ArtifactEnvelope, ConsumerArtifactSummary, ConsumerDiagnostics } from './types';

export interface ConsumerDiagnosticsOptions extends ConsumerReadOptions {
  /** Session id for `.qor/gates/<sid>/audit.json`; omitted -> gate reported unavailable. */
  auditSessionId?: string;
  /** Pre-classified META_LEDGER envelope from the caller's own single read. When supplied,
   *  diagnostics does NOT re-read the ledger. MUST already carry this call's version-floor
   *  verdict (see applyVersionFloor) — an envelope classified without `versionStatus` would
   *  under-report a below-floor install as `ok`. */
  ledger?: ArtifactEnvelope<MetaLedgerEntry[]>;
}

const INCOMPATIBLE_STATES: ReadonlySet<string> = new Set(['malformed', 'unsupported']);

function summarize(env: ArtifactEnvelope<unknown>): ConsumerArtifactSummary {
  return {
    artifact: env.artifact,
    state: env.state,
    reason: env.reason,
    provenance: env.provenance,
  };
}

export function buildConsumerDiagnostics(
  root: string,
  opts?: ConsumerDiagnosticsOptions,
): ConsumerDiagnostics {
  const artifacts = [
    opts?.ledger ?? readMetaLedgerArtifact(root, opts),
    readFeatureIndexArtifact(root, opts),
    readTrackerManifestArtifact(root, opts),
    readAuditGateArtifact(root, opts?.auditSessionId, opts),
  ].map(summarize);
  const vs = opts?.versionStatus;
  return {
    artifacts,
    // `untested` is intentionally absent from this expression. See the
    // `compatible` doc comment on ConsumerDiagnostics (#233 Scope A).
    compatible: artifacts.every((a) => !INCOMPATIBLE_STATES.has(a.state)),
    qorVersion: vs?.installed ?? null,
    testedAgainst: vs?.testedAgainst ?? null,
    untested: vs ? !vs.matchesTested : false,
  };
}
