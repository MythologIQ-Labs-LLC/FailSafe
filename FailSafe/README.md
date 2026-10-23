# FailSafe application source

**Published release:** use the [repository README](../README.md) and linked GitHub Releases page as the source for the current published version. A new commit on `main` or an open PR is **not** automatically a published VSIX.

This directory contains the source for the **single FailSafe VS Code/Cursor extension** under [`extension/`](extension/). The old v4.x split-build diagrams formerly carried in this README (`Antigravity/`, `VSCode/`, `Claude/`, `PROD-Extension/` and separate marketplace build variants) are obsolete. Do not use them as build instructions or architectural authority; historical text remains in Git history.

## Actual entry points

- [Extension README](extension/README.md): supported user flows, optional integrations, shipped version and limitations.
- [Root README](../README.md): product positioning, release links and accurate capability boundaries.
- [Architecture Index](../docs/ARCHITECTURE_INDEX.md): **canonical** architecture/design document authority.
- [Governance Index](../docs/GOVERNANCE_INDEX.md): governance artifact authority and historical evidence.
- [Integration Portfolio](../docs/architecture/INTEGRATION_PORTFOLIO.md): **canonical** feature states, egress, test depth, and outstanding integration defects.
- [Release verification tooling](../tools/release-verification/README.md): platform and artifact evidence.

## Source and packaging

The extension's TypeScript source, tests, scripts and bundled documentation live under `extension/`. Check its [package.json](extension/package.json) for the supported VS Code engine and actual script names.

A basic development checkout uses:

```bash
cd FailSafe/extension
npm ci
npm run compile
npm run test:node
```

**Packaging is platform-specific.** The released product depends on `better-sqlite3` N-API binaries. Use `node scripts/package-target.cjs --host --out failsafe-host.vsix` for this machine's target, then `node scripts/validate-vsix.cjs failsafe-host.vsix` to inspect the artifact. Supported target names and binary mappings live in `scripts/native-targets.cjs`; publication requires the full [release verification process](../tools/release-verification/README.md). A universal VSIX is not equivalent and is not a supported replacement.

## Governance, interoperability and security reality

Workspace governance is **not enforced by physical directory separation**. FailSafe runs in VS Code and governs only the action paths it can actually observe or intercept. VS Code editor-save denials are observational; agent disposable worktrees are not OS process sandboxes. No extension can truthfully promise interception of every process or filesystem write.

The shared MCP client transport currently serves Bicameral and Open Design. FailSafe's own in-process MCP server exists in code but has **no reachable external-client transport** ([contract and B209](../docs/architecture/integrations/failsafe-mcp-server.md)). There is no native Omium or generic production-outcome verification integration; those are proposed interoperability opportunities, not shipped features.

Marketplace installs are disabled pending isolation and scanner acceptance. GitHub's user-facing check command sends a neutral manual advisory, not a verified SHIELD PASS. Read the [extension README](extension/README.md) and [integration portfolio](../docs/architecture/INTEGRATION_PORTFOLIO.md) before making a feature, availability or security claim.

**Do not revive the obsolete v4.x deployment recipes from repository history.** `docs/ARCHITECTURE_INDEX.md` and current tested scripts take precedence.
