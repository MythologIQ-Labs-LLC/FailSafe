#!/usr/bin/env bash
# release-commit-msg.sh — commit-msg hook for [RELEASE] preflight gate
#
# Install: cp tools/release-commit-msg.sh .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
#
# Blocks any commit whose message begins with "[RELEASE]" when release-gate
# preflight checks fail. Ensures documentation versioning is complete before
# a release commit lands.

MSG=$(cat "$1")

if [[ "$MSG" == \[RELEASE\]* ]]; then
  SCRIPT="FailSafe/extension/scripts/release-gate.cjs"

  if [ ! -f "$SCRIPT" ]; then
    # Graceful degradation — hook installed outside the extension workspace
    exit 0
  fi

  echo "[commit-msg] [RELEASE] commit detected — running release-gate preflight..."
  echo ""

  if ! node "$SCRIPT" --preflight; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "BLOCKED: Documentation versioning incomplete."
    echo "Fix all [FAIL] markers above, then retry the commit."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
  fi

  echo ""
  echo "[commit-msg] Preflight PASSED — verifying publish-block lifting state..."
  echo ""

  # Phase 2 governance state machine (plan-monitor-coherence-and-browser-
  # verification.md). Cheaper preflight runs first; this hard-gate runs second.
  if ! ( cd FailSafe/extension && npm run --silent verify:publish-block ); then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "BLOCKED: PUBLISH_BLOCK lifting conditions not met."
    echo "See .failsafe/governance/PUBLISH_BLOCK.md '## Lifting protocol'"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
  fi

  echo ""
  echo "[commit-msg] Publish-block check PASSED — [RELEASE] commit allowed."
fi

exit 0
