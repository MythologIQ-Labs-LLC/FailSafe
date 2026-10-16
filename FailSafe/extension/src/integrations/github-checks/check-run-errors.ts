/**
 * check-run-errors — the refusal texts the GitHub check publisher returns for
 * its own refusals (#476, #479). The transport and the client return them and
 * github-checks-health maps them, all importing from here, so a text cannot
 * drift and the health mapping never imports the transport (the #476 importer
 * pin). This module imports nothing.
 */

export const NOT_PUBLISHABLE_ERROR = 'Check run refused: this name and conclusion are not publishable by FailSafe.';
export const INVALID_API_BASE_ERROR = 'invalid GitHub API base URL';
export const TARGET_HOST_MISMATCH_ERROR = 'check run target host mismatch';
export const INVALID_TARGET_REPO_ERROR = 'invalid check run target repo';
export const UNCONFIRMED_RESPONSE_ERROR = 'unconfirmed GitHub response';
