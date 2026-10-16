/**
 * signedRequest - nonce-carrying request helpers for SecurityReplayGuard
 * (moved out of SecurityReplayGuard.ts in v6.0.8; re-exported from there).
 */

import type { NonceValidationResult, SecurityReplayGuard } from "./SecurityReplayGuard";

/**
 * Helper function to create a signed request with nonce
 */
export function createSignedRequest(
  guard: SecurityReplayGuard,
  action: string,
  payload: Record<string, unknown>,
): {
  nonce: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
} {
  const nonce = guard.generateNonce({ action });
  return {
    nonce,
    action,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper function to validate and process a signed request
 */
export function processSignedRequest(
  guard: SecurityReplayGuard,
  request: { nonce: string; action: string; timestamp: string },
): NonceValidationResult {
  // Check timestamp is recent (within 5 minutes)
  const requestTime = new Date(request.timestamp).getTime();
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;

  if (isNaN(requestTime) || now - requestTime > maxAge) {
    return {
      valid: false,
      reason: "expired",
    };
  }

  return guard.consumeNonce(request.nonce, request.action);
}
