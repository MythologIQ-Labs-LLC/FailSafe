#!/usr/bin/env node
/**
 * FX943 — disclosed-skip emission (#233 Scope C).
 *
 * Phase 75 declarative tolerance says that when a gate's prerequisite is absent,
 * the operator records a SKIP and emits a severity-1 `gate_skipped_prerequisite_absent`
 * event. `permanent_skips` (Phase 256) then stamps that event closed when the
 * repository has declared the gate can never apply here.
 *
 * The chain has three links. Only the last one existed:
 *
 *   a control skips because it cannot apply here   -> happens on every seal
 *   something emits the disclosed-skip event       -> NEVER HAPPENED
 *   permanent_skips closes it at emission          -> works, had nothing to close
 *
 * This repository's Process Shadow Genome held ZERO `gate_skipped_prerequisite_absent`
 * events across every seal it has ever performed. `data_api_acl_lint` prints
 * "(Phase 75 disclosed-skip)" but contains no `shadow_process` reference — the string
 * is prose. So inapplicability lived only in ledger narrative, which nothing can read.
 *
 * This supplies the emission. Closure semantics stay upstream's: the
 * `cannot-automate:` enforcer prefix, the >=50-character justification rule and the
 * closable-event-type restriction are all `permanent_skips.apply()`'s to enforce.
 * A local reimplementation would drift from the toolkit on the next minor — the
 * exact failure mode #233 exists to prevent.
 *
 * Usage: node scripts/qor-skip-emitter.cjs --gate <name> --skill <name> [--session <id>]
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

/** Event types `permanent_skips` is able to close. Anything else accrues forever. */
const CLOSABLE = new Set(['gate_skipped_prerequisite_absent', 'capability_shortfall']);

const PY = process.env.QOR_LOGIC_PYTHON || 'python';

class SkipEmitError extends Error {}

/**
 * Emit one disclosed-skip event through the toolkit.
 *
 * Returns the written event. `addressed` is true only when the repository has
 * declared this gate in `permanent_skips` — which is the whole point: an
 * undeclared skip must stay open as real debt, and a declared one must close
 * without a human revisiting it every cycle.
 *
 * @param {{gate: string, skill: string, sessionId?: string, eventType?: string,
 *          severity?: number, repoRoot?: string, logPath?: string}} opts
 */
function emitSkip(opts) {
  const {
    gate, skill, sessionId = 'default',
    eventType = 'gate_skipped_prerequisite_absent',
    severity = 1, repoRoot = process.cwd(), logPath,
  } = opts || {};

  if (!gate) throw new SkipEmitError('gate is required');
  if (!skill) throw new SkipEmitError('skill is required');
  if (!CLOSABLE.has(eventType)) {
    // Refused rather than emitted: permanent_skips cannot close it, so a
    // declaration would never apply and the event would accrue as permanent
    // unaddressed debt that looks like a real finding.
    throw new SkipEmitError(
      `event_type ${JSON.stringify(eventType)} is not closable by permanent_skips ` +
      `(closable: ${[...CLOSABLE].join(', ')}) — emitting it would accrue debt that ` +
      'no declaration can ever close'
    );
  }

  const payload = JSON.stringify({
    gate, skill, sessionId, eventType, severity,
    repoRoot: path.resolve(repoRoot),
    logPath: logPath ? path.resolve(logPath) : null,
  });

  const script = `
import json, sys, datetime
from pathlib import Path
from qor.scripts import permanent_skips, shadow_process
o = json.loads(sys.argv[1])
event = {
    "ts": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "skill": o["skill"], "session_id": o["sessionId"],
    "event_type": o["eventType"], "severity": o["severity"],
    "details": {"gate": o["gate"]},
    "addressed": False, "issue_url": None, "addressed_ts": None,
    "addressed_reason": None, "source_entry_id": None,
}
# Closure is upstream's call, not ours. apply() raises on a malformed
# declaration, and we let that propagate BEFORE anything is written — a
# partial write would leave an unclosed event that reads as genuine debt.
stamped = permanent_skips.apply(event, repo_root=Path(o["repoRoot"]))
kwargs = {"log_path": Path(o["logPath"])} if o["logPath"] else {"attribution": "LOCAL"}
shadow_process.append_event(stamped, **kwargs)
print(json.dumps(stamped))
`;

  const res = spawnSync(PY, ['-c', script, payload], {
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, QOR_SKILL_ACTIVE: process.env.QOR_SKILL_ACTIVE || skill },
  });

  if (res.error && res.error.code === 'ENOENT') {
    throw new SkipEmitError(`python not found on PATH (set QOR_LOGIC_PYTHON): ${PY}`);
  }
  if (res.status !== 0) {
    throw new SkipEmitError(`emission failed: ${(res.stderr || '').trim() || `exit ${res.status}`}`);
  }
  return JSON.parse(res.stdout);
}

module.exports = { emitSkip, SkipEmitError, CLOSABLE };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    const ev = emitSkip({
      gate: arg('gate'), skill: arg('skill') || 'qor-substantiate',
      sessionId: arg('session'), logPath: arg('log'),
    });
    const state = ev.addressed ? 'closed at emission (declared)' : 'OPEN — not declared';
    process.stdout.write(`skip emitted for ${ev.details.gate}: ${state}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
