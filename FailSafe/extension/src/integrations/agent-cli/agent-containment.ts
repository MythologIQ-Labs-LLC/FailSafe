/**
 * #475: no audited OS-enforced process boundary is wired yet.
 * A Git worktree is NOT an OS sandbox. A future PASSed implementation must
 * supply the contained runner and advance this capability in the same change.
 * No configuration setting, environmental flag, or caller can enable it.
 */
export const AGENT_OS_CONTAINMENT_AVAILABLE = false;
