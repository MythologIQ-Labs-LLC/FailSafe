/**
 * Wave 0 (#521) FX967: degraded-mode and activation-failure detection from VS
 * Code's session logs, pinned to the strings FailSafe actually logs.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const fx = require("./helpers/fixtures.cjs");

const { PATTERNS, scanText, selectSession, scanSession } = require(fx.rv("lib/logscan.cjs"));

const FIXTURE = path.join(__dirname, "fixtures", "exthost-stub-mode.log");

test("the recorded 6.0.6 rollback exthost lines yield two degraded findings; a clean session yields none", () => {
  const findings = scanText(fs.readFileSync(FIXTURE, "utf8"));
  assert.deepEqual(findings.map((f) => [f.kind, f.id]), [["degraded", "stub-mode"], ["degraded", "stub-mode"]]);
  assert.match(findings[0].line, /Ledger DB/);
  assert.match(findings[1].line, /ShadowGenome DB/);
  assert.deepEqual(scanText("2026-10-15 00:49:25.000 [info] ExtensionService#_doActivateExtension MythologIQ.mythologiq-failsafe\n"), []);
});

test("checkpoint memory fallback is degraded; duplicate bootstrap and activation failure are activation failures", () => {
  const text = [
    "[warning] [Extension Host] Checkpoint persistence failed, using memory fallback: Error: x",
    "[info] FailSafe already activated in a sibling extension host; skipping duplicate bootstrap.",
    "[error] Activation failed Error: boom",
    "[error] [Extension Host] Sentinel RAG running in JSONL fallback mode (better-sqlite3 unavailable).",
  ].join("\n");
  assert.deepEqual(scanText(text).map((f) => `${f.kind}/${f.id}`), ["degraded/checkpoint-memory", "activation-failure/duplicate-bootstrap", "activation-failure/activation-failed", "degraded/jsonl-fallback"]);
});

test("drift guard: every pattern matches at least one line in each source file it cites", () => {
  const seen = new Set();
  for (const p of PATTERNS) {
    assert.ok(p.sources.length > 0, p.id);
    for (const rel of p.sources) {
      seen.add(rel);
      const lines = fs.readFileSync(path.join(fx.REPO_ROOT, rel), "utf8").split(/\r?\n/);
      assert.ok(lines.some((l) => p.re.test(l)), `${p.id} no longer matches ${rel}`);
    }
  }
  for (const rel of [
    "FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts",
    "FailSafe/extension/src/qorelogic/shadow/ShadowGenomeManager.ts",
    "FailSafe/extension/src/sentinel/SentinelRagStore.ts",
    "FailSafe/extension/src/roadmap/services/CheckpointStore.ts",
    "FailSafe/extension/src/extension/main.ts",
  ]) assert.ok(seen.has(rel), `no pattern cites ${rel}`);
});

test("session selection picks the newest session created after launch, never an older one", () => {
  const logs = fx.tmpDir("rv-logs");
  for (const name of ["20261015T100000", "20261015T100130", "20261015T100135"]) fs.mkdirSync(path.join(logs, name));
  const launch = new Date(2026, 9, 15, 10, 1, 29, 400).getTime();
  assert.equal(path.basename(selectSession(logs, launch)), "20261015T100135");
  const late = new Date(2026, 9, 15, 10, 5, 0).getTime();
  assert.equal(selectSession(logs, late), null, "an old session is not the newest-after-launch");
});

test("scanSession reads every file under the session directory recursively", () => {
  const logs = fx.tmpDir("rv-logs");
  const deep = path.join(logs, "20261015T100135", "window1", "exthost", "output_logging_20261015T100137");
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, "1-FailSafe.log"), "Checkpoint persistence failed, using memory fallback\n");
  const findings = scanSession(path.join(logs, "20261015T100135"));
  assert.deepEqual(findings.map((f) => f.id), ["checkpoint-memory"]);
  assert.match(findings[0].file, /1-FailSafe\.log$/);
});

test("the fixture carries no user-profile path other than the redacted USER (case-insensitive)", () => {
  const text = fs.readFileSync(FIXTURE, "utf8");
  const profiles = [...text.matchAll(/[a-z]:\\users\\([^\\]+)/gi)].map((m) => m[1].toLowerCase());
  assert.ok(profiles.length > 0, "the fixture should contain the redacted path");
  assert.deepEqual([...new Set(profiles)], ["user"]);
});
