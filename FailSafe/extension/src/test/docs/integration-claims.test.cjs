"use strict";
// Claim parity: the Integrations docs say what the shipped code does. Each row
// reads one fact from the source and requires one exact phrase in the docs
// while the fact holds, and its absence once the fact changes. Lanes that
// change one of these facts update the row and the docs together. A detector
// whose anchor is gone fails; it never skips.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXT = path.resolve(__dirname, "..", "..", "..");
const REPO = path.resolve(EXT, "..", "..");
const SRC = path.join(EXT, "src");
const read = (abs) => fs.readFileSync(abs, "utf8");
const READMES = [path.join(REPO, "README.md"), path.join(EXT, "README.md")];
const integrationReadme = (name) => path.join(SRC, "integrations", name, "README.md");
const rel = (file) => path.relative(REPO, file).split(path.sep).join("/");

/** The Integrations-table row whose first cell matches `label`; fails if absent. */
function row(file, label) {
  const line = read(file).split(/\r?\n/).find((l) => l.startsWith("|") && label.test(l.split("|")[1] ?? ""));
  assert.ok(line, `${rel(file)} has no Integrations row matching ${label}`);
  return line;
}

/** One doc target: a whole file, or one table row of it. */
const whole = (file) => ({ name: rel(file), text: () => read(file) });
const rowOf = (file, label) => ({ name: `${rel(file)} ${label}`, text: () => row(file, label) });

/**
 * While `holds`, `phrase` is in every target and no `overclaim` string (one or
 * a list) is in any; once the fact changes, `phrase` is in no target. Matching
 * ignores case.
 */
function assertParity({ holds, phrase, targets, overclaim = [] }) {
  const has = (t, s) => t.text().toLowerCase().includes(s.toLowerCase());
  if (holds) {
    const missing = targets.filter((t) => !has(t, phrase)).map((t) => t.name);
    assert.deepEqual(missing, [], `"${phrase}" is missing`);
    const over = [].concat(overclaim).flatMap((o) => targets.filter((t) => has(t, o)).map((t) => `${t.name}: "${o}"`));
    assert.deepEqual(over, [], "the docs overclaim");
  } else {
    const stale = targets.filter((t) => has(t, phrase)).map((t) => t.name);
    assert.deepEqual(stale, [], `the code changed, but "${phrase}" still claims the old behaviour`);
  }
}

function sourceFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (full !== path.join(SRC, "test")) sourceFiles(full, out); }
    else if (e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("F1 OpenHands: the docs say whether the import saves anything", () => {
  const text = read(path.join(SRC, "extension", "agent-observe-command.ts"));
  const start = text.indexOf("registerCommand('failsafe.openhands.observe'");
  assert.ok(start >= 0, "anchor: the failsafe.openhands.observe command is gone");
  const next = text.indexOf("registerCommand(", start + 1);
  const body = text.slice(start, next < 0 ? text.length : next);
  // Since #477 the handler delegates to openhands-import-command.ts; follow it.
  let logic = body;
  if (body.includes("openHandsImportFromVscode(")) {
    const cmd = read(path.join(SRC, "extension", "openhands-import-command.ts"));
    const s0 = cmd.indexOf("export async function runOpenHandsImport(");
    assert.ok(s0 >= 0, "anchor: runOpenHandsImport is gone");
    const s1 = cmd.indexOf("\nfunction ", s0);
    logic = cmd.slice(s0, s1 < 0 ? cmd.length : s1);
  }
  assert.ok(logic.includes("observeOpenHandsRun("), "anchor: the import no longer calls observeOpenHandsRun");
  // Lane B (#477): the import persists when it calls persistOpenHandsObservations.
  const persists = /\bpersistOpenHandsObservations\(/.test(logic) || /\b(AgentTimelineService|importOpenHandsRun)\b/.test(logic);
  const targets = [...READMES.map((f) => rowOf(f, /OpenHands/)), whole(integrationReadme("agent-observe"))];
  assertParity({ holds: !persists, phrase: "Nothing is saved yet", overclaim: "into FailSafe transparency records", targets });
  assertParity({ holds: persists, phrase: "after you confirm", overclaim: "live interception of", targets });
});

test("F2 GitHub: with no verified SHIELD publisher wired, no doc claims one", () => {
  const publisher = path.join(SRC, "integrations", "github-checks", "shield-check-publish.ts");
  assert.ok(fs.existsSync(publisher) && /export async function publishVerifiedShieldCheck\b/.test(read(publisher)),
    "anchor: shield-check-publish.ts no longer exports publishVerifiedShieldCheck");
  const importsIt = /(from\s+|require\(\s*)['"][^'"]*shield-check-publish['"]/;
  const wired = sourceFiles(SRC).filter((f) => f !== publisher && importsIt.test(read(f)));
  const phrase = "No command publishes a verified SHIELD check yet";
  assertParity({ holds: wired.length === 0, phrase, overclaim: "PASS/WARN/VETO) as GitHub Check Runs", targets: READMES.map(whole) });
  if (wired.length === 0) {
    const lines = READMES.flatMap((f) => read(f).split(/\r?\n/).filter((l) => /SHIELD check/i.test(l)));
    assert.ok(lines.length >= 2, "neither README mentions a SHIELD check");
    assert.deepEqual(lines.filter((l) => !l.toLowerCase().includes(phrase.toLowerCase())), []);
  }
});

test("F3 Agent Marketplace: the docs say installs are off exactly while they are", () => {
  const m = /export const MARKETPLACE_INSTALLS_ENABLED = (true|false);/.exec(read(path.join(SRC, "roadmap", "services", "MarketplaceInstaller.ts")));
  assert.ok(m, "anchor: MARKETPLACE_INSTALLS_ENABLED is no longer a boolean literal");
  assertParity({
    holds: m[1] === "false",
    phrase: "install, update and scan are disabled until isolated setup and fail-closed scanning land",
    targets: READMES.map(whole),
  });
});

test("F4 Open Design: a refused create_artifact is documented as refused", () => {
  const text = read(path.join(SRC, "integrations", "open-design", "OpenDesignMcpClient.ts"));
  const m = /async executeApprovedCreateArtifact\([^)]*\)[^{]*\{\s*(\w+)/.exec(text);
  assert.ok(m, "anchor: executeApprovedCreateArtifact is gone");
  assertParity({
    holds: m[1] === "throw",
    phrase: "is refused in this release",
    overclaim: ["via the L3-gated", "L3-approved", "one-shot token"],
    targets: [...READMES.map((f) => rowOf(f, /Open Design/)), whole(integrationReadme("open-design"))],
  });
});

test("F5 Continue on Windows: the npm cn.cmd shim is documented as unusable", () => {
  const m = /for \(const file of win \? \[([^\]]*)\]/.exec(read(path.join(SRC, "integrations", "agent-cli", "agent-cli-core.ts")));
  assert.ok(m, "anchor: the win32 candidate list in resolveAgentExecutable is gone");
  assertParity({
    holds: !/\.cmd\b/.test(m[1]),
    phrase: "Continue's npm shim `cn.cmd` cannot run without a shell",
    targets: READMES.map((f) => rowOf(f, /Continue/)),
  });
});
