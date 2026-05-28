/**
 * Open Design integration — barrel exports.
 *
 * v1 (file-path provenance): provenance + detector.
 * v1.1 (MCP + SSE + daemon probe): client + probe + SSE + allowlist + contracts.
 *
 * See `docs/INTEGRATIONS.md` (Open Design section) for the full surface.
 */

export { extractOpenDesignProvenance } from './provenance';
export { OpenDesignProvenanceDetector } from './OpenDesignProvenanceDetector';

// v1.1
export { OpenDesignDaemonProbe } from './OpenDesignDaemonProbe';
export type { DaemonProbeResult, DaemonProbeOptions } from './OpenDesignDaemonProbe';
export { OpenDesignMcpClient } from './OpenDesignMcpClient';
export type {
  OpenDesignMcpClientOptions,
  OpenDesignToolCallResult,
} from './OpenDesignMcpClient';
export { OpenDesignSseClient } from './OpenDesignSseClient';
export type { SseSubscribeOptions, SseEmittedEvent } from './OpenDesignSseClient';
export { OpenDesignMcpAllowlist } from './OpenDesignMcpAllowlist';
export type { ChatSseEvent } from './contracts/sse-chat';
export { isChatSseEvent } from './contracts/sse-chat';
