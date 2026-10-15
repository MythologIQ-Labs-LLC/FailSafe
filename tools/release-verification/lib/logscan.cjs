/**
 * Wave 0 (#521): degraded-mode and activation-failure detection in VS Code's
 * session logs (USER_DATA/logs/<YYYYMMDDTHHMMSS>/...).
 *
 * Patterns are pinned to strings FailSafe logs through console.error,
 * console.warn or its logger; console.log output never reaches VS Code's log
 * files, so it is never a signal. Each pattern names the source files it
 * mirrors, and a drift test fails if any of them stops containing it.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PATTERNS = Object.freeze([
  { id: "stub-mode", kind: "degraded", re: /running in stub mode/, sources: ["FailSafe/extension/src/qorelogic/ledger/LedgerManager.ts", "FailSafe/extension/src/qorelogic/shadow/ShadowGenomeManager.ts"] },
  { id: "jsonl-fallback", kind: "degraded", re: /JSONL fallback mode/, sources: ["FailSafe/extension/src/sentinel/SentinelRagStore.ts"] },
  { id: "checkpoint-memory", kind: "degraded", re: /Checkpoint persistence failed/, sources: ["FailSafe/extension/src/roadmap/services/CheckpointStore.ts"] },
  { id: "activation-failed", kind: "activation-failure", re: /Activation failed/, sources: ["FailSafe/extension/src/extension/main.ts"] },
  { id: "duplicate-bootstrap", kind: "activation-failure", re: /skipping duplicate bootstrap/, sources: ["FailSafe/extension/src/extension/main.ts"] },
]);
const MAX_LOG_BYTES = 16 * 1024 * 1024;

/** @returns {{ id: string, kind: string, line: string }[]} in line order */
function scanText(text) {
  const findings = [];
  for (const line of String(text).split(/\r?\n/)) {
    for (const p of PATTERNS) if (p.re.test(line)) findings.push({ id: p.id, kind: p.kind, line: line.slice(0, 400) });
  }
  return findings;
}

/** "20261015T104142" (local time) -> epoch ms, or null. */
function parseSessionName(name) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(name);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/**
 * The newest session directory created after `launchTime` (one second of
 * tolerance for the name's whole-second resolution), or null. An older session
 * is never returned, even when it is the newest overall.
 */
function selectSession(logsDir, launchTime) {
  if (!fs.existsSync(logsDir)) return null;
  const floor = Math.floor(launchTime / 1000) * 1000 - 1000;
  const sessions = fs.readdirSync(logsDir)
    .map((name) => ({ name, t: parseSessionName(name) }))
    .filter((s) => s.t !== null && s.t >= floor)
    .sort((a, b) => a.t - b.t);
  return sessions.length ? path.join(logsDir, sessions[sessions.length - 1].name) : null;
}

/** Scans every file under a session directory, recursively. */
function scanSession(dir) {
  const findings = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && fs.statSync(p).size <= MAX_LOG_BYTES) {
        for (const f of scanText(fs.readFileSync(p, "utf8"))) findings.push({ ...f, file: path.relative(dir, p) });
      }
    }
  })(dir);
  return findings;
}

module.exports = { PATTERNS, scanText, parseSessionName, selectSession, scanSession };
