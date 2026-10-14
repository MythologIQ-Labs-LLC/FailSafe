#!/usr/bin/env bash
# Run full FailSafe test suite. better-sqlite3 13.x is N-API and loads its bundled
# prebuild, so no native rebuild step is needed (#502).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Compile ==="
npm run compile

echo ""
echo "=== Full VS Code test runner ==="
npm test

echo ""
echo "All tests complete."
