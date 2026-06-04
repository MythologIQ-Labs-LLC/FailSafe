// END-TO-END enforcement proof for the ACP enforce-proxy (GH #172 Part 2). Builds
// the REAL workspace backing (file-backed providers + the REAL EnforcementEngine,
// reused verbatim via EngineBackedInterceptor) over a temp workspace and drives the
// governor across all three governance modes. This is the "Reality = Promise" proof
// that the standalone proxy actually governs — not just that the transport compiles.
//
// Pulls the full engine tree, so it runs under the vscode-test host (which compiles
// the whole project), not the type-only headless subset.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createWorkspaceAcpBacking } from '../../../../integrations/acp/proxy/backing/createWorkspaceAcpBacking';
import { writeRuntimeMode } from '../../../../integrations/acp/proxy/backing/runtimeMode';
import { AcpProxyGovernor } from '../../../../integrations/acp/proxy/AcpProxyGovernor';
import { AcpInterceptor } from '../../../../integrations/acp/AcpInterceptor';
import type { GovernanceMode } from '../../../../governance/types';

function tmpWs(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-acp-enforce-')); }

function governorFor(ws: string): AcpProxyGovernor {
  const backing = createWorkspaceAcpBacking(ws);
  return new AcpProxyGovernor(new AcpInterceptor(backing.governanceInterceptor), {
    effectiveMode: backing.effectiveMode,
    ledger: backing.ledger,
  });
}

const DANGEROUS_PERMISSION = {
  sessionId: 's',
  toolCall: { toolCallId: 't', title: 'shell', rawInput: { command: ['rm', '-rf', '/'] } },
  options: [
    { optionId: 'ao', name: 'Allow once', kind: 'allow_once' as const },
    { optionId: 'ro', name: 'Reject once', kind: 'reject_once' as const },
  ],
};

suite('integrations/acp/proxy ENFORCEMENT (real engine, file-backed)', () => {
  test('ENFORCE mode WITHHOLDS an out-of-scope fs write (no active intent → Axiom-1 BLOCK)', async () => {
    const ws = tmpWs();
    try {
      writeRuntimeMode(ws, 'enforce');
      const dec = await governorFor(ws).governEffect({
        type: 'fs_write', params: { sessionId: 's', path: '/etc/passwd', content: 'x' },
      });
      assert.equal(dec.blocked, true, 'enforce mode withholds the write');
      assert.equal(dec.record.enforcing, true);
      assert.ok(['BLOCK', 'ESCALATE', 'QUARANTINE', 'MODIFY'].includes(dec.receipt.verdict), `deny verdict, got ${dec.receipt.verdict}`);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('ENFORCE mode DENIES a dangerous permission request (reject_once)', async () => {
    const ws = tmpWs();
    try {
      writeRuntimeMode(ws, 'enforce');
      const { outcome } = await governorFor(ws).governPermission(DANGEROUS_PERMISSION);
      assert.deepEqual(outcome, { outcome: 'selected', optionId: 'ro' }, 'FailSafe selects the reject option');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('OBSERVE mode does NOT withhold, and records enforcing=false (B3 — never a silent enforced grant)', async () => {
    const ws = tmpWs();
    try {
      writeRuntimeMode(ws, 'observe');
      const dec = await governorFor(ws).governEffect({
        type: 'fs_write', params: { sessionId: 's', path: '/etc/passwd', content: 'x' },
      });
      assert.equal(dec.blocked, false, 'observe never blocks');
      assert.equal(dec.record.enforcing, false, 'B3: the grant is recorded as non-enforcing');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('the absent-mirror default (observe) also does not withhold', async () => {
    const ws = tmpWs(); // no runtime-mode.json written
    try {
      const dec = await governorFor(ws).governEffect({
        type: 'terminal_create', params: { sessionId: 's', command: 'rm' },
      });
      assert.equal(dec.blocked, false);
      assert.equal(dec.record.enforcing, false);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('every decision lands a durable JSONL line in the workspace ACP ledger (B7)', async () => {
    const ws = tmpWs();
    try {
      writeRuntimeMode(ws, 'enforce');
      await governorFor(ws).governEffect({ type: 'fs_write', params: { sessionId: 's', path: '/x', content: 'y' } });
      const ledger = path.join(ws, '.failsafe', 'governance', 'acp-ledger.jsonl');
      const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n');
      assert.ok(lines.length >= 1);
      const rec = JSON.parse(lines[lines.length - 1]);
      assert.equal(rec.effectiveMode, 'enforce');
      assert.ok(!('content' in rec) && !('payload' in rec), 'ledger carries no payload/content');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  const ALL_MODES: GovernanceMode[] = ['observe', 'assist', 'enforce'];
  test('enforcing is true ONLY in enforce mode (mode-gating)', async () => {
    for (const mode of ALL_MODES) {
      const ws = tmpWs();
      try {
        writeRuntimeMode(ws, mode);
        const dec = await governorFor(ws).governEffect({ type: 'fs_write', params: { sessionId: 's', path: '/x', content: 'y' } });
        assert.equal(dec.record.enforcing, mode === 'enforce', `enforcing flag for mode=${mode}`);
      } finally { fs.rmSync(ws, { recursive: true, force: true }); }
    }
  });
});
