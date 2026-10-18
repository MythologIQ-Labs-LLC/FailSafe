// Voice Pack — typed payload shapes for v1.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 1.

/** Install/runtime state observed by voice-pack-detector. */
export type VoicePackState =
  | 'absent'
  | 'installed'
  | 'stale'
  | 'corrupt';

export interface VoicePackManifest {
  version: string;
  builtAt: string;
  expectedFiles: string[];
  sha256: Record<string, string>;
}

export interface VoicePackProbeResult {
  state: VoicePackState;
  version?: string;
  manifestPath?: string;
  missingFiles?: string[];
}

export interface InstallProgressEvent {
  phase: 'download' | 'verify' | 'extract' | 'manifest-verify';
  status: 'running' | 'success' | 'error';
  bytesTransferred?: number;
  totalBytes?: number;
  error?: string;
}

/** Where one download came from (#538). `finalUrl` is origin plus path only:
 *  the release-asset hop carries a short-lived signed query that is never kept. */
export interface VoicePackDownloadProvenance {
  requestedUrl: string;
  finalUrl: string;
}

export interface InstallReport {
  ok: boolean;
  version: string;
  finalPath: string;
  error?: string;
  /** Requested and final URL of the tarball and checksum, and the verified tarball sha256. */
  provenance?: {
    tarball: VoicePackDownloadProvenance;
    checksum: VoicePackDownloadProvenance;
    sha256: string;
  };
}

export interface InstallVoicePackOptions {
  globalStoragePath: string;
  version: string;
  output?: { appendLine: (msg: string) => void };
  onProgress?: (evt: InstallProgressEvent) => void;
}

/** Bounded redirect allowlist — only GitHub-hosted destinations may serve the
 *  download. Every hop is checked against it before it is requested, and every
 *  response is checked for a redirect the fetch followed by itself (#538). */
export const ALLOWED_REDIRECT_HOSTS: readonly string[] = [
  'github.com',
  'objects.githubusercontent.com',
  'codeload.github.com',
  'release-assets.githubusercontent.com',
];

/** Redirects followed per download; a further redirect is refused (#538). */
export const MAX_VOICE_PACK_REDIRECTS = 5;
