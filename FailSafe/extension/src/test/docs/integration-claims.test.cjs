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
// #538 lane F: the root README is a product page (#543) without the
// Integrations table; the marketplace README is the claim document that states
// each integration fact. The product page is held to the same facts by
// assertProductPage: no overclaim, no stale phrase, and any line that names an
// integration carries its fact phrase.
const ROOT_README = path.join(REPO, "README.md");
const CLAIM_README = path.join(EXT, "README.md");
const READMES = [ROOT_README, CLAIM_README];
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

/**
 * The product page (the root README, or `text` for in-memory rows): while
 * `holds`, no overclaim string appears and every line matching `mention`
 * carries `phrase`; once the fact changes, `phrase` appears nowhere.
 */
function assertProductPage({ holds, phrase, overclaim = [], mention }, text = read(ROOT_README)) {
  const lower = text.toLowerCase();
  if (!holds) {
    assert.ok(!lower.includes(phrase.toLowerCase()), `the code changed, but the product page still says "${phrase}"`);
    return;
  }
  const over = [].concat(overclaim).filter((o) => lower.includes(o.toLowerCase()));
  assert.deepEqual(over, [], "the product page overclaims");
  const bare = text.split(/\r?\n/).filter((l) => mention.test(l) && !l.toLowerCase().includes(phrase.toLowerCase()));
  assert.deepEqual(bare, [], `the product page names the integration without "${phrase}"`);
}

/** F0: the product page has no Integrations row for these labels; the claim document has each. */
const TABLE_LABELS = [/Continue/, /OpenHands/, /Open Design/];
function assertTableSplit(rootText, claimText) {
  const firstCells = (text) => text.split(/\r?\n/).filter((l) => l.startsWith("|")).map((l) => l.split("|")[1] ?? "");
  const rootRows = TABLE_LABELS.filter((label) => firstCells(rootText).some((c) => label.test(c)));
  assert.deepEqual(rootRows.map(String), [], "the product page carries an Integrations row; revisit the claim targets");
  const missing = TABLE_LABELS.filter((label) => !firstCells(claimText).some((c) => label.test(c)));
  assert.deepEqual(missing.map(String), [], "the claim document lost an Integrations row");
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
  const targets = [rowOf(CLAIM_README, /OpenHands/), whole(integrationReadme("agent-observe"))];
  const saved = { holds: !persists, phrase: "Nothing is saved yet", overclaim: "into FailSafe transparency records" };
  const confirmed = { holds: persists, phrase: "after you confirm", overclaim: "live interception of" };
  assertParity({ ...saved, targets });
  assertParity({ ...confirmed, targets });
  assertProductPage({ ...saved, mention: /OpenHands/i });
  assertProductPage({ ...confirmed, mention: /OpenHands/i });
});

test("F2 GitHub: with no verified SHIELD publisher wired, no doc claims one", () => {
  const publisher = path.join(SRC, "integrations", "github-checks", "shield-check-publish.ts");
  assert.ok(fs.existsSync(publisher) && /export async function publishVerifiedShieldCheck\b/.test(read(publisher)),
    "anchor: shield-check-publish.ts no longer exports publishVerifiedShieldCheck");
  const importsIt = /(from\s+|require\(\s*)['"][^'"]*shield-check-publish['"]/;
  const wired = sourceFiles(SRC).filter((f) => f !== publisher && importsIt.test(read(f)));
  const phrase = "No command publishes a verified SHIELD check yet";
  const overclaim = "PASS/WARN/VETO) as GitHub Check Runs";
  assertParity({ holds: wired.length === 0, phrase, overclaim, targets: [whole(CLAIM_README)] });
  assertProductPage({ holds: wired.length === 0, phrase, overclaim, mention: /SHIELD check/i });
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
    targets: [whole(CLAIM_README)],
  });
  assertProductPage({
    holds: m[1] === "false",
    phrase: "install, update and scan are disabled until isolated setup and fail-closed scanning land",
    mention: /Agent Marketplace/i,
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
    targets: [rowOf(CLAIM_README, /Open Design/), whole(integrationReadme("open-design"))],
  });
  assertProductPage({
    holds: m[1] === "throw",
    phrase: "is refused in this release",
    overclaim: ["via the L3-gated", "L3-approved", "one-shot token"],
    mention: /Open Design/i,
  });
});

test("F5 Continue on Windows: the npm cn.cmd shim is documented as unusable", () => {
  const m = /for \(const file of win \? \[([^\]]*)\]/.exec(read(path.join(SRC, "integrations", "agent-cli", "agent-cli-core.ts")));
  assert.ok(m, "anchor: the win32 candidate list in resolveAgentExecutable is gone");
  assertParity({
    holds: !/\.cmd\b/.test(m[1]),
    phrase: "Continue's npm shim `cn.cmd` cannot run without a shell",
    targets: [rowOf(CLAIM_README, /Continue/)],
  });
  assertProductPage({
    holds: !/\.cmd\b/.test(m[1]),
    phrase: "Continue's npm shim `cn.cmd` cannot run without a shell",
    mention: /Continue \(|`cn`|cn\.cmd/,
  });
});

test("F0 the product page carries no Integrations table and the claim document carries the rows", () => {
  assertTableSplit(read(ROOT_README), read(CLAIM_README));
  assert.throws(() => assertTableSplit("| OpenHands run import | x |", read(CLAIM_README)), /product page carries an Integrations row/);
  assert.throws(() => assertTableSplit(read(ROOT_README), "| Continue | x |"), /claim document lost/);
});

test("F0b the product page may name an integration only with its fact phrase", () => {
  const rows = [
    { mention: /OpenHands/i, phrase: "after you confirm", name: "OpenHands" },
    { mention: /Agent Marketplace/i, phrase: "install, update and scan are disabled until isolated setup and fail-closed scanning land", name: "Agent Marketplace" },
    { mention: /Open Design/i, phrase: "is refused in this release", name: "Open Design" },
    { mention: /Continue \(|`cn`|cn\.cmd/, phrase: "Continue's npm shim `cn.cmd` cannot run without a shell", name: "Continue (`cn`)" },
  ];
  for (const r of rows) {
    const bare = `Use ${r.name} with FailSafe.`;
    assert.throws(() => assertProductPage({ holds: true, phrase: r.phrase, mention: r.mention }, bare), /without/, `${r.name}: a bare mention must fail`);
    assertProductPage({ holds: true, phrase: r.phrase, mention: r.mention }, `${bare} ${r.phrase}.`);
    assert.throws(() => assertProductPage({ holds: false, phrase: r.phrase, mention: r.mention }, `${bare} ${r.phrase}.`), /still says/, `${r.name}: a stale phrase must fail`);
  }
  assert.throws(() => assertProductPage({ holds: true, phrase: "x", overclaim: "one-shot token", mention: /Open Design/i }, "Open Design uses a one-shot token."), /overclaims/);
});

test("F6 OpenHands: while the import holds a Secret Storage key, its README says so", () => {
  const signing = path.join(SRC, "integrations", "agent-observe", "openhands-signing.ts");
  assert.ok(fs.existsSync(signing), "anchor: openhands-signing.ts is gone");
  const holdsKey = /secrets\.get\(EVIDENCE_KEY_ID\)/.test(read(signing));
  const target = [whole(integrationReadme("agent-observe"))];
  assertParity({ holds: holdsKey, phrase: "Secret Storage", overclaim: "neither holds a secret", targets: target });
});
