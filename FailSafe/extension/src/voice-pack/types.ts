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

export interface InstallReport {
  ok: boolean;
  version: string;
  finalPath: string;
  error?: string;
}

export interface InstallVoicePackOptions {
  globalStoragePath: string;
  version: string;
  output?: { appendLine: (msg: string) => void };
  onProgress?: (evt: InstallProgressEvent) => void;
}

/** Bounded redirect allowlist — only GitHub-hosted destinations are permitted
 *  to receive the body download. Enforced post-fetch via response.url check. */
export const ALLOWED_REDIRECT_HOSTS: readonly string[] = [
  'github.com',
  'objects.githubusercontent.com',
  'codeload.github.com',
];
