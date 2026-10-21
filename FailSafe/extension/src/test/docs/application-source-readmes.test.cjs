"use strict";

// Prevent nested application/MCP README drift without claiming that a text
// assertion qualifies a live provider, installed host, or signed receipt.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..", "..", "..", "..");
const APP_README = path.join(REPO, "FailSafe", "README.md");
const MCP_README = path.join(REPO, "FailSafe", "extension", "src", "integrations", "mcp", "README.md");
const read = (p) => fs.readFileSync(p, "utf8");

test("nested application README uses the real single-extension source and packaging", () => {
  const s = read(APP_README);
  assert.match(s, /single FailSafe VS Code\/Cursor extension/);
  assert.match(s, /canonical.*architecture/i);
  assert.match(s, /package-target\.cjs/);
  assert.match(s, /validate-vsix\.cjs/);
  assert.match(s, /not automatically a published VSIX/);
  assert.doesNotMatch(s, /\*\*Current Release\*\*: v4\.9\.0|Two Variants, Two Marketplaces|PROD-Extension\/VSCode/);
  for (const p of [
    "FailSafe/extension/package.json",
    "FailSafe/extension/scripts/package-target.cjs",
    "FailSafe/extension/scripts/validate-vsix.cjs",
    "docs/ARCHITECTURE_INDEX.md",
    "docs/architecture/INTEGRATION_PORTFOLIO.md",
  ]) assert.ok(fs.existsSync(path.join(REPO, p)), `missing documented entry point: ${p}`);
});

test("MCP README distinguishes the shared client substrate from an exposed governance server", () => {
  const s = read(MCP_README);
  const host = read(path.join(REPO, "FailSafe", "extension", "src", "integrations", "mcp", "McpClientHost.ts"));
  assert.match(host, /export (?:abstract )?class McpClientHost/);
  assert.match(s, /reusable MCP-over-stdio \*\*client\*\* lifecycle/);
  assert.match(s, /does not prove every consumer attaches/);
  assert.match(s, /unreachable extension-host stdio transport/);
  assert.match(s, /No Omium adapter/);
  assert.doesNotMatch(s, /FailSafe governs every external MCP server it talks to/);
  assert.ok(fs.existsSync(path.join(REPO, "docs", "architecture", "integrations", "failsafe-mcp-server.md")));
});

test("all local Markdown entry-point links in the two source READMEs resolve", () => {
  for (const file of [APP_README, MCP_README]) {
    const txt = read(file);
    for (const match of txt.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const destination = match[1].split("#")[0];
      if (!destination || /^[a-z][a-z0-9+.-]*:/i.test(destination)) continue;
      const abs = path.resolve(path.dirname(file), decodeURIComponent(destination));
      assert.ok(fs.existsSync(abs), `${path.relative(REPO, file)} has broken local link ${destination}`);
    }
  }
});
