/**
 * Bound on how many recent commits `TrackerRoute`'s PR-cadence fallback reads
 * via `git log` (FailSafe#244 large-repo/deep-history audit, FailSafe#393).
 *
 * An unbounded `git log` measured 1s+ of blocking `execFileSync` work and an
 * `ENOBUFS` throw past the 8MB output ceiling on a synthetic 150k-commit
 * repository. PR-anchor/cadence detection only needs recent merge history, so
 * the read is bounded to the most recent N commits; a history deeper than
 * this window is disclosed via a non-blocking `git-log-truncated` lint
 * advisory rather than silently dropping older anchors.
 */
export const GIT_LOG_MAX_COMMITS = 5000;
