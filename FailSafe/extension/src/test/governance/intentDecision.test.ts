// B340 (plan-b340-enforce-approval LD1-LD8): an operator-confirmed approval path for enforce mode.
//
// Every row uses a real IntentService on a temp workspace, a real anchored SOA ledger and an
// EnforcementEngine built by createEnforcementEngine (the production factory). In enforce mode the
// status that enforcement acts on is derived from sealed INTENT_DECIDED rows ordered by row id,
// their intent-history mirrors, and one verified ledger snapshot; the agent-writable intent file's
// `status` is never trusted. Forgeries, edits, deletions, reordering, transplants and index
// desynchronisation must all leave the intent blocked.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Axiom3Enforcer } from '../../governance/enforcement/Axiom3Enforcer';
import { IntentService } from '../../governance/IntentService';
import { IntentHistoryLog } from '../../governance/IntentHistoryLog';
import { SessionManager } from '../../governance/SessionManager';
import { ReleasePipelineGate } from '../../governance/ReleasePipelineGate';
import { registerCommitCheckRoute } from '../../roadmap/routes/CommitCheckRoute';
import { findGovernanceEvidence } from '../../governance/delivery/deliveryEvidence';
import type { IntentHistoryEntry } from '../../governance/types/IntentTypes';
import { isAnchorKey, openLedger, rawRows } from '../qorelogic/ledgerTestKit';
import {
  attacker, close, DECIDED, DECISION_DID, decide, decisionModule, decisionRows, deps, editIntentFile, enforced, engineFor,
  evaluate, harness, historyEntries, historyFile, intentFile, isMirror, requireCommands, rewriteHistory, seal, snapshotFiles,
  wireLedger, type Harness,
} from './intentDecisionHarness';

/* eslint-disable @typescript-eslint/no-explicit-any */
const EXT = path.resolve(__dirname, '..', '..', '..');

async function passed(h: Harness): Promise<any> {
  const r = await decide(h, 'PASS');
  assert.equal(r.outcome, 'recorded', `PASS recorded: ${r.detail}`);
  return r;
}

async function vetoed(h: Harness): Promise<any> {
  const r = await decide(h, 'VETO');
  assert.equal(r.outcome, 'recorded', `VETO recorded: ${r.detail}`);
  return r;
}

function dropMirrorOf(h: Harness, rowId: number): void {
  rewriteHistory(h.root, (entries) => entries.filter((e) => !(isMirror(e) && (e.details as any).ledgerEntryId === rowId)));
}

suite('B340 intent decision: enforce-mode approval path (plan-b340)', () => {
  let h: Harness | undefined;
  teardown(() => { close(h); h = undefined; });

  test('E1 a PULSE intent BLOCKs; the remediation names failsafe.intent.decide and failsafe.setGovernanceMode, and the command is contributed', async () => {
    h = await harness();
    const v: any = await evaluate(h);
    assert.equal(v.status, 'BLOCK');
    assert.equal(v.axiomViolated, 3);
    assert.match(v.remediation, /failsafe\.intent\.decide/);
    assert.match(v.remediation, /failsafe\.setGovernanceMode/);
    assert.doesNotMatch(v.remediation, /checkGateStatus/);
    const direct: any = new Axiom3Enforcer().enforce({ action: { type: 'file_write', targetPath: 'x', intentId: 'i', proposedAt: '', proposedBy: '' }, activeIntent: { ...h.intent, status: 'PULSE' }, workspaceRoot: h.root } as any);
    assert.doesNotMatch(direct.remediation, /checkGateStatus/);
    const pkg = JSON.parse(fs.readFileSync(path.join(EXT, 'package.json'), 'utf8'));
    const ids = pkg.contributes.commands.map((c: { command: string }) => c.command);
    assert.ok(ids.includes('failsafe.intent.decide'), 'failsafe.intent.decide is contributed');
    assert.ok(ids.includes('failsafe.intent.seal'), 'failsafe.intent.seal is contributed');
    assert.ok(pkg.activationEvents.includes('onCommand:failsafe.intent.decide'));
    assert.ok(pkg.activationEvents.includes('onCommand:failsafe.intent.seal'));
  });

  test('E2 a confirmed PASS writes one sealed row and its mirror, the stored anchor already names the row, and the action is ALLOWed', async () => {
    h = await harness();
    let release: () => void = () => undefined;
    const delayed = new Promise<void>((r) => { release = r; });
    setTimeout(() => release(), 300);
    h.env.secrets.storeGate = async (key) => { if (key.startsWith('ledgerAnchor:g:')) await delayed; };
    const before = historyEntries(h.root).length;
    const r = await passed(h);
    // Read the stored record straight from the stub (verifyLedger would flush first).
    const genesis = rawRows(h.ledger)[0].entry_hash;
    const stored = h.env.secrets.record(genesis);
    assert.ok(stored && stored.headId >= r.ledgerEntryId, `the stored anchor names row #${r.ledgerEntryId} when the command resolves (stored ${JSON.stringify(stored)})`);
    h.env.secrets.storeGate = null;
    const rows = decisionRows(h.ledger);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agent_did, DECISION_DID);
    assert.equal(rows[0].overseer_decision, 'PASS');
    const payload = JSON.parse(rows[0].payload as string);
    assert.equal(payload.intentId, h.intent.id);
    assert.equal(payload.verdict, 'PASS');
    const mirrors = historyEntries(h.root).filter(isMirror);
    assert.equal(historyEntries(h.root).length, before + 1);
    assert.equal(mirrors.length, 1);
    assert.equal((mirrors[0].details as any).ledgerEntryId, rows[0].id);
    assert.equal((mirrors[0].details as any).ledgerEntryHash, rows[0].entry_hash);
    assert.equal(h.confirm.requests.length, 1);
    assert.equal((await evaluate(h)).status, 'ALLOW');
    assert.equal((await enforced(h)).status, 'PASS');
  });

  test('E3 declined, expired, busy and unwired write nothing and the action still BLOCKs', async () => {
    const x = await harness();
    h = x;
    for (const answer of ['declined', 'busy', 'hang', 'unwired'] as const) {
      const rowsBefore: number = rawRows(x.ledger).length;
      const histBefore: number = historyEntries(x.root).length;
      if (answer !== 'unwired') h.confirm.answer = answer;
      const extra: Record<string, unknown> = answer === 'unwired' ? { confirm: undefined } : answer === 'hang' ? { deadlineMs: 50 } : {};
      const r = await decide(h, 'PASS', extra);
      const expected = answer === 'hang' ? 'expired' : answer;
      assert.equal(r.outcome, expected, `${answer}: ${r.detail}`);
      assert.equal(rawRows(h.ledger).length, rowsBefore, `${answer}: no ledger row`);
      assert.equal(historyEntries(h.root).length, histBefore, `${answer}: no history entry`);
      assert.equal((await evaluate(h)).status, 'BLOCK', `${answer}: still blocked`);
    }
  });

  test('E4 an argument call still shows the modal exactly once, "as requested" with the command-call footer; declined writes nothing', async () => {
    h = await harness();
    const m = requireCommands();
    h.confirm.answer = 'declined';
    const rowsBefore = rawRows(h.ledger).length;
    const r = await m.runIntentDecisionCommand(deps(h), { verdict: 'PASS', note: 'from an extension' });
    assert.equal(r.outcome, 'declined');
    assert.equal(h.confirm.requests.length, 1, 'the confirmer is called exactly once');
    const detail = h.confirm.requests[0].detail;
    assert.match(detail, /Verdict \(as requested\): PASS/);
    assert.match(detail, /Requested by a command call/);
    assert.match(detail, /from an extension/);
    assert.equal(rawRows(h.ledger).length, rowsBefore);
    h.confirm.answer = 'approved';
    const ok = await m.runIntentDecisionCommand(deps(h), { verdict: 'PASS' });
    assert.equal(ok.outcome, 'recorded');
    assert.equal(h.confirm.requests.length, 2);
  });

  test('E5 forgeries BLOCK: a chained PASS line plus a PASS file, a mirror naming no row, a mirror whose hash does not match', async () => {
    h = await harness();
    // (a) a PASS status line with a valid chain and the file edited to PASS
    await new IntentHistoryLog(path.join(h.root, '.failsafe', 'manifest')).appendEntry({
      intentId: h.intent.id, timestamp: new Date().toISOString(), event: 'STATUS_CHANGED', previousStatus: 'PULSE', newStatus: 'PASS', actor: 'judge',
    });
    editIntentFile(h.root, (i) => { i.status = 'PASS'; });
    assert.equal((await evaluate(h)).status, 'BLOCK', '(a) a forged PASS line and file do not unlock');
    // (b) a well-formed mirror naming a row id that does not exist
    await new IntentHistoryLog(path.join(h.root, '.failsafe', 'manifest')).appendEntry({
      intentId: h.intent.id, timestamp: new Date().toISOString(), event: 'STATUS_CHANGED', previousStatus: 'PASS', newStatus: 'PASS', actor: 'user',
      details: { decisionId: '00000000-0000-4000-8000-000000000000', ledgerEntryId: 9999, ledgerEntryHash: 'a'.repeat(64), operationId: 'op_x', digestVersion: 1, contentDigest: 'b'.repeat(64) },
    });
    assert.equal((await evaluate(h)).status, 'BLOCK', '(b) a mirror naming no row does not unlock');
    // (c) a real approval whose mirror hash is then edited (chain recomputed)
    await passed(h);
    assert.equal((await evaluate(h)).status, 'ALLOW');
    rewriteHistory(h.root, (entries) => entries.map((e) => (isMirror(e) && (e.details as any).ledgerEntryId < 9999
      ? { ...e, details: { ...(e.details as any), ledgerEntryHash: 'c'.repeat(64) } } : e)));
    assert.equal((await evaluate(h)).status, 'BLOCK', '(c) a mirror that does not match its row does not unlock');
  });

  test('E6 a PASS binds the approved content: a widened scope BLOCKs, mutable fields do not, restoring allows again', async () => {
    h = await harness();
    await passed(h);
    assert.equal((await evaluate(h)).status, 'ALLOW');
    editIntentFile(h.root, (i) => { i.scope.files = ['src/a.ts', 'src/b.ts']; });
    const v: any = await evaluate(h);
    assert.equal(v.status, 'BLOCK');
    assert.match(JSON.stringify(v), /changed after approval/);
    editIntentFile(h.root, (i) => { i.scope.files = ['src/a.ts']; i.updatedAt = '2030-01-01T00:00:00.000Z'; i.evidence = { testsPassed: true, buildSucceeded: true, visualVerified: false, sentinelPassed: true }; });
    assert.equal((await evaluate(h)).status, 'ALLOW', 'updatedAt and evidence are not approved content');
  });

  test('E7 a confirmed VETO BLOCKs with the VETO remediation; a plain PULSE line does not clear it; a later confirmed PASS does', async () => {
    h = await harness();
    await vetoed(h);
    const v: any = await evaluate(h);
    assert.equal(v.status, 'BLOCK');
    assert.match(v.violation, /VETO/);
    assert.match(v.remediation, /failsafe\.intent\.decide/);
    await h.svc.updateStatus('PULSE', 'user');
    assert.equal((await enforced(h)).status, 'VETO', 'a plain status line never clears a VETO');
    assert.equal((await evaluate(h)).status, 'BLOCK');
    await passed(h);
    assert.equal((await evaluate(h)).status, 'ALLOW');
  });

  test('E8 Seal: refused without effective PASS; confirmed writes the SEALED row then SEALED + archive; declined writes nothing; truncation keeps SEALED', async () => {
    h = await harness();
    const refused = await seal(h);
    assert.equal(refused.outcome, 'refused');
    assert.equal(h.confirm.requests.length, 0, 'no seal dialog without an effective PASS');
    await passed(h);
    h.confirm.answer = 'declined';
    const rowsBefore = rawRows(h.ledger).length;
    assert.equal((await seal(h)).outcome, 'declined');
    assert.equal(rawRows(h.ledger).length, rowsBefore);
    assert.ok(fs.existsSync(intentFile(h.root)));
    const preSeal = snapshotFiles(h.root);
    h.confirm.answer = 'approved';
    const sealed = await seal(h);
    assert.equal(sealed.outcome, 'recorded', sealed.detail);
    const sealRows = decisionRows(h.ledger).filter((r) => r.overseer_decision === 'SEALED');
    assert.equal(sealRows.length, 1);
    assert.ok(!fs.existsSync(intentFile(h.root)), 'the active intent is archived and removed');
    assert.ok(fs.existsSync(path.join(h.root, '.failsafe', 'manifest', 'intents', `${h.intent.id}.json`)));
    assert.equal(historyEntries(h.root).filter((e) => e.event === 'SEALED' && e.intentId === h!.intent.id).length, 1);
    assert.equal((await evaluate(h)).status, 'BLOCK', 'no active intent: Axiom 1 blocks');
    // Restore the pre-seal intent file and history (the SEALED entries truncated away): the row still says SEALED.
    fs.writeFileSync(intentFile(h.root), preSeal.intent);
    fs.writeFileSync(historyFile(h.root), preSeal.history);
    assert.equal((await enforced(h)).status, 'SEALED');
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E8b Seal completion: after an interrupted seal the command offers Finish sealing, writes no second row, and completes once', async () => {
    h = await harness();
    await passed(h);
    const interrupted = await seal(h, { hooks: { beforeComplete: async () => { throw new Error('crash after the row'); } } });
    assert.notEqual(interrupted.outcome, 'recorded');
    assert.equal(decisionRows(h.ledger).filter((r) => r.overseer_decision === 'SEALED').length, 1);
    editIntentFile(h.root, (i) => { i.status = 'SEALED'; });
    const finish = await seal(h);
    assert.equal(finish.outcome, 'recorded', finish.detail);
    assert.match(h.confirm.requests[h.confirm.requests.length - 1].title, /Finish sealing/);
    assert.equal(decisionRows(h.ledger).filter((r) => r.overseer_decision === 'SEALED').length, 1, 'no second SEALED row');
    assert.ok(!fs.existsSync(intentFile(h.root)));
    assert.ok(fs.existsSync(path.join(h.root, '.failsafe', 'manifest', 'intents', `${h.intent.id}.json`)));
    assert.equal(historyEntries(h.root).filter((e) => e.event === 'SEALED' && e.intentId === h!.intent.id).length, 1);
  });

  test('E9 restart: a new IntentService, ledger manager and engine honour the PASS and still refuse a forgery', async () => {
    h = await harness();
    await passed(h);
    h.ledger.close();
    h.ledger = await openLedger(h.env);
    const svc = new IntentService(h.root, new SessionManager(h.root));
    const engine = engineFor(svc, h.root, h.mode);
    wireLedger(svc, h.ledger);
    assert.equal((await evaluate(h, 'src/a.ts', engine)).status, 'ALLOW');
    editIntentFile(h.root, (i) => { i.scope.files = ['.']; });
    assert.equal((await evaluate(h, 'src/z.ts', engine)).status, 'BLOCK');
  });

  test('E10 with the ledger unavailable the command says so, writes nothing, and enforce BLOCKs', async () => {
    h = await harness();
    wireLedger(h.svc, undefined);
    const histBefore = historyEntries(h.root).length;
    const r = await decide(h, 'PASS', { getLedger: () => undefined });
    assert.notEqual(r.outcome, 'recorded');
    assert.match(r.detail, /ledger/i);
    assert.equal(historyEntries(h.root).length, histBefore);
    editIntentFile(h.root, (i) => { i.status = 'PASS'; });
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E11 a caller-supplied boolean is not proof: updateStatus(PASS, agent, true) throws in enforce mode and writes nothing', async () => {
    h = await harness();
    const before = snapshotFiles(h.root);
    await assert.rejects(() => (h!.svc.updateStatus as any)('PASS', 'agent', true));
    const after = snapshotFiles(h.root);
    assert.equal(after.intent, before.intent, 'the intent file is unchanged');
    assert.equal(after.history, before.history, 'the history is unchanged');
  });

  test('E12 a valid INTENT_DECIDED row is not governance evidence; a broken-seal one and another DID one are', async () => {
    h = await harness();
    await passed(h);
    let ev: any = await findGovernanceEvidence(h.ledger, h.intent.id);
    assert.equal(ev.state, 'ok');
    assert.equal(ev.total, 0, 'the decision row is not counted');
    await h.ledger.appendEntry({ eventType: DECIDED as any, agentDid: 'did:myth:someone-else', payload: { intentId: h.intent.id, verdict: 'PASS' } });
    ev = await findGovernanceEvidence(h.ledger, h.intent.id);
    assert.equal(ev.total, 1, 'another agent DID is evidence');
    const row = decisionRows(h.ledger)[0];
    attacker(h.ledger.getLedgerPath(), (db) => db.prepare('UPDATE soa_ledger SET payload = ? WHERE id = ?').run(row.payload!.replace('"PASS"', '"VETO"'), row.id));
    ev = await findGovernanceEvidence(h.ledger, h.intent.id);
    assert.equal(ev.total, 2, 'a decision row whose seal fails is counted');
    assert.equal(ev.unverifiable.length, 1);
  });

  test('E13 newest deletion: removing the VETO row and its mirror leaves the anchored head missing, and the action still BLOCKs', async () => {
    h = await harness();
    await passed(h);
    const veto = await vetoed(h);
    attacker(h.ledger.getLedgerPath(), (db) => db.prepare('DELETE FROM soa_ledger WHERE id = ?').run(veto.ledgerEntryId));
    dropMirrorOf(h, veto.ledgerEntryId);
    assert.equal((await evaluate(h)).status, 'BLOCK', 'open manager');
    h.ledger.close();
    h.ledger = await openLedger(h.env);
    wireLedger(h.svc, h.ledger);
    const report = await h.ledger.verifyLedger();
    assert.ok(!report.ok, 'the fresh manager reports a failure');
    assert.equal((await evaluate(h)).status, 'BLOCK', 'fresh manager');
  });

  test('E13b middle deletion: with a later anchored row, the anchor stays live but report.ok is false (prev-link) and the action BLOCKs', async () => {
    h = await harness();
    await passed(h);
    const veto = await vetoed(h);
    await h.ledger.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:a', verificationResult: 'FAIL', riskGrade: 'L3', agentTrustAtAction: 0.4 });
    await h.ledger.flushAnchor();
    attacker(h.ledger.getLedgerPath(), (db) => db.prepare('DELETE FROM soa_ledger WHERE id = ?').run(veto.ledgerEntryId));
    dropMirrorOf(h, veto.ledgerEntryId);
    const report = await h.ledger.verifyLedger();
    assert.ok(['verified', 'established-now', 'established-late'].includes(report.anchor.status), `anchor live (${report.anchor.status})`);
    assert.equal(report.ok, false);
    assert.ok(report.failures.some((f) => f.code === 'prev-link'), JSON.stringify(report.failures));
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E13c an unanchored ledger (no head-anchor record) with ok true still BLOCKs a sealed PASS with its mirror', async () => {
    h = await harness();
    h.ledger.close();
    for (const k of [...h.env.secrets.map.keys()]) if (isAnchorKey(k)) h.env.secrets.map.delete(k);
    h.env.secrets.rejectStore = (k) => isAnchorKey(k);
    h.ledger = await openLedger(h.env);
    wireLedger(h.svc, h.ledger);
    const report = await h.ledger.verifyLedger();
    assert.equal(report.anchor.status, 'unanchored');
    assert.equal(report.anchor.headId, null);
    assert.equal(report.ok, true);
    const r = await decide(h, 'PASS');
    assert.equal(decisionRows(h.ledger).length, 1, 'the row is written');
    assert.equal(historyEntries(h.root).filter(isMirror).length, 1, 'its mirror is written');
    assert.notEqual(r.status, 200);
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E14 ordering: row id decides, and only the first mirror of a row binds', async () => {
    h = await harness();
    await passed(h);
    await vetoed(h);
    // the VETO mirror moved before the PASS mirror, chain recomputed
    rewriteHistory(h.root, (entries) => {
      const mirrors = entries.filter(isMirror);
      const rest = entries.filter((e) => !isMirror(e));
      return [...rest, mirrors[1], mirrors[0]];
    });
    assert.equal((await enforced(h)).status, 'VETO');
    assert.equal((await evaluate(h)).status, 'BLOCK');
    close(h);
    // duplicate: a plain VETO line, then a second copy of the PASS mirror after it
    h = await harness();
    await passed(h);
    const passMirror = historyEntries(h.root).filter(isMirror)[0];
    await new IntentHistoryLog(path.join(h.root, '.failsafe', 'manifest')).appendEntry({
      intentId: h.intent.id, timestamp: new Date().toISOString(), event: 'STATUS_CHANGED', previousStatus: 'PASS', newStatus: 'VETO', actor: 'auditor',
    });
    rewriteHistory(h.root, (entries) => [...entries, { ...passMirror, timestamp: new Date().toISOString() }]);
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E15 a decision row edited in the database gives bad-decision-row and BLOCKs', async () => {
    h = await harness();
    const r = await passed(h);
    const row = decisionRows(h.ledger)[0];
    attacker(h.ledger.getLedgerPath(), (db) => db.prepare('UPDATE soa_ledger SET payload = ? WHERE id = ?').run(row.payload!.replace('"note":""', '"note":"edited"'), r.ledgerEntryId));
    const e = await enforced(h);
    assert.equal(e.statusCode, 'bad-decision-row', JSON.stringify(e));
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E15b in-place edits (event_type; separately payload.intentId) report a hash failure and BLOCK', async () => {
    for (const edit of ['event_type', 'intentId'] as const) {
      h = await harness();
      await passed(h);
      const veto = await vetoed(h);
      await h.ledger.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:a', verificationResult: 'FAIL', riskGrade: 'L3', agentTrustAtAction: 0.4 });
      await h.ledger.flushAnchor();
      const row = decisionRows(h.ledger).find((x) => x.id === veto.ledgerEntryId)!;
      attacker(h.ledger.getLedgerPath(), (db) => {
        if (edit === 'event_type') db.prepare("UPDATE soa_ledger SET event_type = 'AUDIT_FAIL' WHERE id = ?").run(row.id);
        else db.prepare('UPDATE soa_ledger SET payload = ? WHERE id = ?').run(row.payload!.replace(h!.intent.id, '00000000-0000-4000-8000-00000000abcd'), row.id);
      });
      dropMirrorOf(h, veto.ledgerEntryId);
      const report = await h.ledger.verifyLedger();
      assert.ok(report.failures.some((f) => f.code === 'hash-mismatch'), `${edit}: ${JSON.stringify(report.failures)}`);
      assert.equal((await evaluate(h)).status, 'BLOCK', edit);
      close(h);
      h = undefined;
    }
  });

  test('E16 observe mode: getEnforcedActiveIntent returns the file intent unchanged and reads no ledger', async () => {
    h = await harness({ mode: 'observe' });
    editIntentFile(h.root, (i) => { i.status = 'PASS'; });
    let calls = 0;
    const spy = new Proxy(h.ledger, { get: (t, p, r) => { const v = Reflect.get(t, p, r); return typeof v === 'function' ? (...a: unknown[]) => { calls++; return v.apply(t, a); } : v; } });
    wireLedger(h.svc, spy);
    const e = await enforced(h);
    assert.equal(e.status, 'PASS');
    assert.equal(calls, 0, 'no ledger call in observe mode');
  });

  test('E17 classified paths pinned as today (B374): the release gate trusts a SEALED file; the commit check allows a PULSE intent', async () => {
    h = await harness();
    editIntentFile(h.root, (i) => { i.status = 'SEALED'; });
    const gate = new ReleasePipelineGate(h.svc, h.ledger);
    const check = await (gate as any).checkUnsealedIntents();
    assert.equal(check.passed, true, 'B374: the release gate reads the file status');
    editIntentFile(h.root, (i) => { i.status = 'PULSE'; });
    const handlers = new Map<string, (req: unknown, res: unknown) => Promise<void> | void>();
    registerCommitCheckRoute({ get: (p: string, fn: any) => handlers.set(p, fn) } as any, {
      validateCommitToken: () => true, buildHubSnapshot: async () => ({ governanceModeState: { mode: 'enforce' } }),
      getActiveIntent: () => h!.svc.getActiveIntent(),
    } as any);
    let body: any = null;
    const res: any = { status: () => res, json: (b: unknown) => { body = b; } };
    await handlers.get('/api/v1/governance/commit-check')!({ header: () => 'tok', headers: {} }, res);
    assert.equal(body.allow, true, 'B374: the commit check allows any active intent');
  });

  test('E18 an unwired mode getter fails closed: a forged PASS file reads PULSE', async () => {
    h = await harness();
    const svc = new IntentService(h.root, new SessionManager(h.root));
    wireLedger(svc, h.ledger);
    editIntentFile(h.root, (i) => { i.status = 'PASS'; });
    const e = await enforced(h, svc);
    assert.equal(e.status, 'PULSE');
  });

  test('E19 a sealed decision row transplanted from another workspace gives bad-decision-row and BLOCKs', async () => {
    h = await harness();
    await passed(h);
    const real = JSON.parse(decisionRows(h.ledger)[0].payload as string);
    const mirror = historyEntries(h.root).filter(isMirror)[0];
    const workspace = String(real.workspace ?? '').replace(/.$/, (c: string) => (c === '0' ? '1' : '0'));
    const forged = { ...real, decisionId: '11111111-1111-4111-8111-111111111111', workspace };
    const entry = await h.ledger.appendEntry({
      eventType: DECIDED as any, agentDid: DECISION_DID, overseerDid: 'did:myth:overseer:local', overseerDecision: 'PASS',
      verificationMethod: 'operator-intent-decision', verificationResult: 'PASS', artifactHash: real.contentDigest, payload: forged,
    });
    await h.ledger.flushAnchor();
    await new IntentHistoryLog(path.join(h.root, '.failsafe', 'manifest')).appendEntry({
      intentId: h.intent.id, timestamp: new Date().toISOString(), event: 'STATUS_CHANGED', previousStatus: 'PASS', newStatus: 'PASS', actor: 'user',
      details: { ...(mirror.details as any), decisionId: forged.decisionId, ledgerEntryId: entry.id, ledgerEntryHash: entry.entryHash },
    });
    const e = await enforced(h);
    assert.equal(e.statusCode, 'bad-decision-row', JSON.stringify(e));
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E20 the memo sees another connection: an UPDATE after a warm evaluation BLOCKs the next one', async () => {
    h = await harness();
    const r = await passed(h);
    assert.equal((await evaluate(h)).status, 'ALLOW');
    assert.equal((await evaluate(h)).status, 'ALLOW', 'memo warm');
    attacker(h.ledger.getLedgerPath(), (db) => db.prepare("UPDATE soa_ledger SET event_type = 'AUDIT_FAIL' WHERE id = ?").run(r.ledgerEntryId));
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E21 an unanchored VETO answers 500, blocks, and is latched for the session until that same row is anchored', async () => {
    h = await harness();
    await passed(h);
    h.env.secrets.rejectStore = (k) => k.startsWith('ledgerAnchor:g:');
    const veto = await decide(h, 'VETO');
    assert.equal(veto.status, 500, veto.detail);
    assert.match(veto.detail, /not yet tamper-evident/);
    assert.equal((await evaluate(h)).status, 'BLOCK');
    // 1a: delete the VETO row and its mirror in the same session; the ledger is intact again, the latch holds.
    attacker(h.ledger.getLedgerPath(), (db) => db.prepare('DELETE FROM soa_ledger WHERE id = ?').run(veto.ledgerEntryId));
    dropMirrorOf(h, veto.ledgerEntryId);
    h.env.secrets.rejectStore = () => false;
    const report = await h.ledger.verifyLedger();
    assert.equal(report.ok, true, JSON.stringify(report.failures));
    assert.equal((await evaluate(h)).status, 'BLOCK', '1a: latched');
    // 1b: a fresh manager appends a row (the writer reuses the deleted id with a new hash) and its anchor store
    // succeeds; the latched row (that id and hash) is gone, so the latch holds.
    h.ledger.close();
    h.ledger = await openLedger(h.env);
    wireLedger(h.svc, h.ledger);
    await h.ledger.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:a', verificationResult: 'FAIL', riskGrade: 'L3', agentTrustAtAction: 0.4 });
    await h.ledger.flushAnchor();
    const after = await h.ledger.verifyLedger();
    assert.ok(after.ok && (after.anchor.headId ?? 0) >= veto.ledgerEntryId, JSON.stringify(after.anchor));
    assert.equal((await evaluate(h)).status, 'BLOCK', '1b: the latch is cleared only by the same row');
    close(h);
    // 2: with the VETO row in place, an anchored append covers it; the VETO still blocks, and a later approval is not held by the latch.
    h = await harness();
    await passed(h);
    h.env.secrets.rejectStore = (k) => k.startsWith('ledgerAnchor:g:');
    const v2 = await decide(h, 'VETO');
    assert.equal(v2.status, 500);
    h.env.secrets.rejectStore = () => false;
    await h.ledger.appendEntry({ eventType: 'AUDIT_FAIL', agentDid: 'did:t:a', verificationResult: 'FAIL', riskGrade: 'L3', agentTrustAtAction: 0.4 });
    await h.ledger.flushAnchor();
    assert.equal((await enforced(h)).status, 'VETO');
    assert.equal((await evaluate(h)).status, 'BLOCK');
    await passed(h);
    assert.equal((await evaluate(h)).status, 'ALLOW', 'a newer approval is not held by the latch');
  });

  test('E21b an unanchored PASS answers 500, its mirror is written, the anchor is live and ok, and the action BLOCKs', async () => {
    h = await harness();
    h.env.secrets.rejectStore = (k) => k.startsWith('ledgerAnchor:g:');
    const before = historyEntries(h.root).length;
    const r = await decide(h, 'PASS');
    assert.equal(r.status, 500, r.detail);
    assert.match(r.detail, /does not count until/);
    assert.equal(historyEntries(h.root).length, before + 1, 'the PASS mirror was written');
    const report = await h.ledger.verifyLedger();
    assert.equal(report.ok, true);
    assert.ok(['verified', 'established-now', 'established-late'].includes(report.anchor.status));
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('E22 index desync: a second connection hides the VETO row from the event_type index; the decision still BLOCKs', async () => {
    h = await harness();
    await passed(h);
    const veto = await vetoed(h);
    dropMirrorOf(h, veto.ledgerEntryId);
    assert.equal((await evaluate(h)).status, 'BLOCK', 'memo warm on the honest ledger');
    attacker(h.ledger.getLedgerPath(), (db) => {
      (db as any).unsafeMode(true);
      const v = db.prepare('SELECT * FROM soa_ledger WHERE id = ?').get(veto.ledgerEntryId) as Record<string, unknown>;
      db.prepare('DELETE FROM soa_ledger WHERE id = ?').run(veto.ledgerEntryId);
      db.pragma('writable_schema = ON');
      const idx = db.prepare("SELECT * FROM sqlite_master WHERE name = 'idx_soa_event_type'").get() as Record<string, unknown>;
      db.prepare("DELETE FROM sqlite_master WHERE name = 'idx_soa_event_type'").run();
      db.pragma('writable_schema = RESET');
      const cols = Object.keys(v);
      db.prepare(`INSERT INTO soa_ledger (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(v);
      db.pragma('writable_schema = ON');
      db.prepare('INSERT INTO sqlite_master (type, name, tbl_name, rootpage, sql) VALUES (@type, @name, @tbl_name, @rootpage, @sql)').run(idx);
      db.pragma('writable_schema = RESET');
    });
    h.ledger.close();
    h.ledger = await openLedger(h.env);
    wireLedger(h.svc, h.ledger);
    const indexed = await h.ledger.getSealedEntriesByType(DECIDED as any);
    assert.ok(!indexed.some((r) => r.row.id === veto.ledgerEntryId), 'precondition: the indexed read omits the VETO row');
    const report = await h.ledger.verifyLedger();
    assert.equal(report.ok, true, `precondition: the table rows verify (${JSON.stringify(report.failures)})`);
    assert.equal((await evaluate(h)).status, 'BLOCK');
    assert.equal((await enforced(h)).status, 'VETO');
  });

  test('E22m a memo hit reruns no table read and decides on the memoised snapshot', async () => {
    h = await harness();
    await passed(h);
    const dec = decisionModule();
    assert.equal(typeof dec.readEffectiveStatus, 'function', 'B340: readEffectiveStatus exists');
    const first = await (h.svc as any).effectiveStatusOf(await h.svc.getActiveIntent());
    const db = h.ledger.getDatabase();
    const original = db.prepare.bind(db);
    const sql: string[] = [];
    (db as any).prepare = (...a: unknown[]) => { sql.push(String(a[0])); return (original as any)(...a); };
    let snapshots = 0;
    const realSnapshot = (h.ledger as any).verifiedSnapshot.bind(h.ledger);
    (h.ledger as any).verifiedSnapshot = (...a: unknown[]) => { snapshots++; return realSnapshot(...a); };
    try {
      const second = await (h.svc as any).effectiveStatusOf(await h.svc.getActiveIntent());
      assert.equal(snapshots, 0, 'no new snapshot on a memo hit');
      assert.ok(!sql.some((s) => /SELECT \* FROM soa_ledger/i.test(s)), `no table read on a memo hit: ${JSON.stringify(sql)}`);
      assert.equal(second.snapshot, first.snapshot, 'the decision used the memoised snapshot');
      assert.equal(second.effective.status, 'PASS');
    } finally {
      (db as any).prepare = original;
      (h.ledger as any).verifiedSnapshot = realSnapshot;
    }
  });

  test('E22s during getEnforcedActiveIntent the only ledger calls are verifiedSnapshot and getDatabase', async () => {
    h = await harness();
    await passed(h);
    const called = new Set<string>();
    const spy = new Proxy(h.ledger, { get: (t, p, r) => { const v = Reflect.get(t, p, r); return typeof v === 'function' ? (...a: unknown[]) => { called.add(String(p)); return v.apply(t, a); } : v; } });
    wireLedger(h.svc, spy);
    assert.equal((await enforced(h)).status, 'PASS');
    assert.deepEqual([...called].sort(), ['getDatabase', 'verifiedSnapshot']);
  });

  test('E23 late re-anchor: deleting the VETO, its mirror and the head-anchor record, then restarting, still BLOCKs', async () => {
    h = await harness();
    await passed(h);
    const veto = await vetoed(h);
    h.ledger.close();
    attacker(h.env.ledgerPath, (db) => db.prepare('DELETE FROM soa_ledger WHERE id = ?').run(veto.ledgerEntryId));
    dropMirrorOf(h, veto.ledgerEntryId);
    for (const k of [...h.env.secrets.map.keys()]) if (k.startsWith('ledgerAnchor:g:')) h.env.secrets.map.delete(k);
    h.ledger = await openLedger(h.env);
    wireLedger(h.svc, h.ledger);
    const report = await h.ledger.verifyLedger();
    assert.equal(report.anchor.status, 'established-late', JSON.stringify(report.anchor));
    assert.equal(report.ok, true);
    assert.equal((await evaluate(h)).status, 'BLOCK');
  });

  test('history helper sanity: the recomputed chain verifies', async () => {
    h = await harness();
    rewriteHistory(h.root, (e: IntentHistoryEntry[]) => e);
    assert.equal((await new IntentHistoryLog(path.join(h.root, '.failsafe', 'manifest')).verifyChainIntegrity()).valid, true);
  });
});
