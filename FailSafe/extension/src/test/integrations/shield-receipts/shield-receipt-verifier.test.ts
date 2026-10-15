// #476: verifyShieldReceipt / issueShieldReceipt. One row per Neutral or
// Rejected reason; each row changes one input from the all-valid fixture.

import { strict as assert } from 'assert';
import {
  issueShieldReceipt, isVerifiedShieldReceipt, unavailableChainStatus, verifyShieldReceipt,
  type ShieldVerification,
} from '../../../integrations/shield-receipts/shield-receipt-verifier';
import type { ChainState } from '../../../integrations/shield-receipts/shield-evidence';
import { DEFAULT_SHIELD_POLICY } from '../../../integrations/shield-receipts/shield-policy';
import { signShieldReceipt } from '../../../integrations/shield-receipts/shield-receipt';
import {
  BASE_LEDGER, CODE, FIXTURE_ROOT, NOW, OTHER, PARENT, QOR_KEY, RECEIPT_KEY, SEAL, SEAL_HASH, SESSION, sha,
  auditArtifact, baseScenario, chainOf, keysOf, putReceipt, receiptBody, sealBlock, setArtifacts,
  sidecarFor, sourceOf, substantiateArtifact, type Scenario,
} from './fixtures';

interface RunOpts { key?: Buffer | null; chain?: ChainState | 'default'; apiHost?: string; now?: number }
const SEEN: ShieldVerification[] = [];

async function run(s: Scenario, o: RunOpts = {}): Promise<ShieldVerification> {
  const keys = keysOf(o.key === null ? undefined : (o.key ?? RECEIPT_KEY));
  const chain = o.chain === 'default' ? unavailableChainStatus : chainOf(o.chain ?? 'OK');
  const v = await verifyShieldReceipt(sourceOf(s), keys, chain, DEFAULT_SHIELD_POLICY, o.apiHost ?? 'api.github.com', o.now ?? NOW);
  SEEN.push(v);
  return v;
}

async function expectResult(s: Scenario, kind: string, reason: string, o: RunOpts = {}): Promise<void> {
  const v = await run(s, o);
  const got = v.kind === 'verified' ? 'verified' : `${v.kind}:${v.reason}`;
  assert.equal(got, `${kind}:${reason}`, v.kind === 'verified' ? 'unexpectedly verified' : v.detail);
}

/** Scenario edited, then a fresh receipt matching the edited artifacts. */
function withArtifacts(audit: Record<string, unknown>, sub: Record<string, unknown>): Scenario {
  const s = baseScenario();
  setArtifacts(s, auditArtifact(audit), substantiateArtifact(sub));
  putReceipt(s);
  return s;
}

/** HEAD = CODE on top of SEAL, with the given ledger at CODE. */
function onTopOfSeal(ledgerAtCode: string): Scenario {
  const s = baseScenario();
  s.commits.set(CODE, { parents: [SEAL], ledger: ledgerAtCode });
  s.head = CODE;
  return s;
}

const SEAL_LEDGER = BASE_LEDGER + sealBlock(644);

suite('shield-receipt-verifier: receipt and binding (#476)', () => {
  test('all valid at the seal commit -> Verified, and only the minted object is recognized', async () => {
    const v = await run(baseScenario());
    assert.equal(v.kind, 'verified');
    if (v.kind !== 'verified') return;
    assert.equal(v.receipt.commitSha, SEAL);
    assert.equal(v.receipt.merkleSeal, SEAL_HASH);
    assert.equal(isVerifiedShieldReceipt(v.receipt), true);
    assert.equal(isVerifiedShieldReceipt(JSON.parse(JSON.stringify(v.receipt))), false);
    assert.equal(isVerifiedShieldReceipt({ ...v.receipt }), false);
    assert.equal(isVerifiedShieldReceipt({ commitSha: SEAL } as unknown), false);
    assert.ok(Object.isFrozen(v.receipt));
  });

  test('no HEAD, or a non-SHA HEAD -> Neutral no-head', async () => {
    const s = baseScenario(); s.head = undefined;
    await expectResult(s, 'neutral', 'no-head');
    const t = baseScenario(); t.head = 'abc';
    await expectResult(t, 'neutral', 'no-head');
  });

  test('operator selects PASS with no receipt -> Neutral no-receipt', async () => {
    const s = baseScenario(); s.receipts.clear();
    await expectResult(s, 'neutral', 'no-receipt');
  });

  test('a receipt with an extra field -> Rejected malformed', async () => {
    const s = baseScenario();
    s.receipts.set(SEAL, JSON.stringify({ ...JSON.parse(s.receipts.get(SEAL)!), extra: 1 }));
    await expectResult(s, 'rejected', 'malformed');
  });

  test('receipt key unavailable or short -> Neutral', async () => {
    await expectResult(baseScenario(), 'neutral', 'receipt-key-unavailable', { key: null });
    await expectResult(baseScenario(), 'neutral', 'receipt-key-invalid', { key: Buffer.alloc(16, 9) });
  });

  test('signed with another key -> Rejected signature', async () => {
    const s = baseScenario(); putReceipt(s, receiptBody(s), Buffer.alloc(32, 8));
    await expectResult(s, 'rejected', 'signature');
  });

  test('receipt for SHA A while HEAD is B -> Rejected commit-mismatch', async () => {
    const s = baseScenario(); putReceipt(s, receiptBody(s, { commitSha: OTHER }), RECEIPT_KEY, SEAL);
    await expectResult(s, 'rejected', 'commit-mismatch');
  });

  test('repo binding: other repo Rejected, case-insensitive origin Verified, no origin Neutral', async () => {
    const s = baseScenario(); s.remote = 'https://github.com/acme/y.git';
    await expectResult(s, 'rejected', 'repo-mismatch');
    const t = baseScenario(); t.remote = 'git@github.com:ACME/FailSafe.git';
    assert.equal((await run(t)).kind, 'verified');
    const u = baseScenario(); u.remote = undefined;
    await expectResult(u, 'neutral', 'no-remote');
  });

  test('host binding: publishing to another API host -> Rejected host-mismatch; garbage host -> Neutral', async () => {
    await expectResult(baseScenario(), 'rejected', 'host-mismatch', { apiHost: 'ghe.acme.com' });
    await expectResult(baseScenario(), 'neutral', 'invalid-api-host', { apiHost: 'not a host!' });
  });

  test('receipt qorVersion 0.175.0 -> Neutral unsupported-qor-version', async () => {
    const s = baseScenario(); putReceipt(s, receiptBody(s, { qorVersion: '0.175.0' }));
    await expectResult(s, 'neutral', 'unsupported-qor-version');
  });

  test('issuedAt: future, stale, unparseable, non-UTC', async () => {
    const at = (iso: string): Scenario => { const s = baseScenario(); putReceipt(s, receiptBody(s, { issuedAt: iso })); return s; };
    await expectResult(at(new Date(NOW + 10 * 60_000).toISOString()), 'rejected', 'issued-in-future');
    await expectResult(at(new Date(NOW - 15 * 86_400_000).toISOString()), 'rejected', 'stale');
    await expectResult(at('yesterday'), 'rejected', 'malformed-time');
    await expectResult(at('2026-10-15T01:00:00-04:00'), 'rejected', 'malformed-time');
  });
});

suite('shield-receipt-verifier: Qor artifacts (#476)', () => {
  test('substantiate.provenance missing -> Neutral qor-artifact-missing', async () => {
    const s = baseScenario(); s.gates.delete('substantiate.provenance');
    await expectResult(s, 'neutral', 'qor-artifact-missing');
  });

  test('sidecar phase replay -> Rejected qor-sidecar-invalid', async () => {
    const s = baseScenario();
    s.gates.set('audit.provenance', sidecarFor('plan', s.gates.get('audit.json')!, QOR_KEY, { phase: 'plan' }));
    await expectResult(s, 'rejected', 'qor-sidecar-invalid');
  });

  test('hand-edited audit.json saying PASS, sidecar not updated -> Rejected qor-payload', async () => {
    const s = withArtifacts({ verdict: 'VETO' }, {});
    s.gates.set('audit.json', Buffer.from(JSON.stringify(auditArtifact(), null, 2)));
    await expectResult(s, 'rejected', 'qor-payload');
  });

  test('forged sidecar (right digest, other HMAC key): qor-hmac with the key, qor-key-absent without', async () => {
    const forged = (): Scenario => {
      const s = baseScenario();
      s.gates.set('audit.provenance', sidecarFor('audit', s.gates.get('audit.json')!, Buffer.alloc(32, 8)));
      return s;
    };
    await expectResult(forged(), 'rejected', 'qor-hmac');
    const noKey = forged(); noKey.qorKey = undefined;
    await expectResult(noKey, 'neutral', 'qor-key-absent');
  });

  test('an empty or short Qor session key -> Neutral qor-key-absent (never an HMAC with a weak key)', async () => {
    for (const k of [Buffer.alloc(0), Buffer.alloc(16, 7)]) {
      const s = baseScenario(); s.qorKey = k;
      await expectResult(s, 'neutral', 'qor-key-absent');
    }
  });

  test('re-substantiated artifact (valid, newer) -> Neutral receipt-evidence-superseded', async () => {
    const s = baseScenario();
    setArtifacts(s, auditArtifact(), substantiateArtifact({ ts: '2026-10-15T05:30:00Z', disclosures: ['re-run'] }));
    await expectResult(s, 'neutral', 'receipt-evidence-superseded');
  });

  const CONTENT: Array<[string, Record<string, unknown>, Record<string, unknown>, string, string]> = [
    ['substantiate session_id differs', {}, { session_id: 'other-session' }, 'rejected', 'session-mismatch'],
    ['audit VETO', { verdict: 'VETO' }, {}, 'rejected', 'audit-verdict'],
    ['risk grade L4', { risk_grade: 'L4' }, {}, 'rejected', 'risk-grade'],
    ['substantiate VETO', {}, { verdict: 'VETO' }, 'rejected', 'substantiate-verdict'],
    ['reality_matches_promise false', {}, { reality_matches_promise: false }, 'rejected', 'substantiate-verdict'],
    ['audit target differs from plan_path', { target: 'other.md' }, {}, 'rejected', 'target-mismatch'],
    ['audit ai_provenance.version 0.175.0', { ai_provenance: { version: '0.175.0' } }, {}, 'neutral', 'unsupported-qor-version'],
    ['substantiate ts after issuedAt', {}, { ts: '2026-10-15T05:30:00Z' }, 'rejected', 'issued-before-substantiate'],
    ['substantiate ts unparseable', {}, { ts: 'soon' }, 'rejected', 'malformed-time'],
  ];
  for (const [label, audit, sub, kind, reason] of CONTENT) {
    test(`${label} -> ${kind} ${reason}`, async () => {
      await expectResult(withArtifacts(audit, sub), kind, reason);
    });
  }

  test('substantiate ts with an offset is compared as an instant, not a string', async () => {
    // 08:55:47+04:00 is 04:55:47Z, before issuedAt 05:00:00Z; as strings "08" > "05".
    assert.equal((await run(withArtifacts({}, { ts: '2026-10-15T08:55:47+04:00' }))).kind, 'verified');
  });
});

suite('shield-receipt-verifier: receipt agrees with the artifacts (B1, #476)', () => {
  const MISMATCH: Array<[string, Parameters<typeof receiptBody>[1]]> = [
    ['riskGrade', { audit: { ...receiptBody(baseScenario()).audit, riskGrade: 'L2' } }],
    ['audit target', { audit: { ...receiptBody(baseScenario()).audit, target: 'x.md' } }],
    ['audit verdict', { audit: { ...receiptBody(baseScenario()).audit, verdict: 'VETO' } }],
    ['planPath', { substantiate: { ...receiptBody(baseScenario()).substantiate, planPath: 'x.md' } }],
    ['substantiate verdict', { substantiate: { ...receiptBody(baseScenario()).substantiate, verdict: 'VETO' } }],
  ];
  for (const [label, over] of MISMATCH) {
    test(`receipt ${label} differs from the artifact -> Rejected receipt-artifact-mismatch`, async () => {
      const s = baseScenario(); putReceipt(s, receiptBody(s, over));
      await expectResult(s, 'rejected', 'receipt-artifact-mismatch');
    });
  }

  test('B1: new seal header #650 for the same session, receipt signed with the ledger values -> Rejected', async () => {
    const s = onTopOfSeal(SEAL_LEDGER + sealBlock(650, SESSION, 'e'.repeat(64)));
    const base = receiptBody(s);
    putReceipt(s, { ...base, substantiate: { ...base.substantiate, ledgerEntry: 650, merkleSeal: 'e'.repeat(64) } });
    await expectResult(s, 'rejected', 'receipt-artifact-mismatch');
  });

  test('B1: issuance at that commit writes nothing (seal-mismatch)', async () => {
    const s = onTopOfSeal(SEAL_LEDGER + sealBlock(650, SESSION, 'e'.repeat(64))); s.receipts.clear();
    const r = await issueShieldReceipt(sourceOf(s), keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
    assert.equal(r.kind === 'issued' ? 'issued' : `${r.kind}:${r.reason}`, 'rejected:seal-mismatch');
    assert.equal(s.writes.length, 0);
  });

  test('B1-ledgerEntry only: #651 with the real chain hash, receipt carries 651 -> Rejected', async () => {
    const s = onTopOfSeal(SEAL_LEDGER + sealBlock(651, SESSION, SEAL_HASH));
    const base = receiptBody(s);
    putReceipt(s, { ...base, substantiate: { ...base.substantiate, ledgerEntry: 651 } });
    await expectResult(s, 'rejected', 'receipt-artifact-mismatch');
  });

  test('B1-merkleSeal only: #644 sealed with chain X, receipt carries X -> Rejected', async () => {
    const X = 'f'.repeat(64);
    const s = baseScenario();
    s.commits.set(SEAL, { parents: [PARENT], ledger: BASE_LEDGER + sealBlock(644, SESSION, X) });
    const base = receiptBody(s);
    putReceipt(s, { ...base, substantiate: { ...base.substantiate, merkleSeal: X } });
    await expectResult(s, 'rejected', 'receipt-artifact-mismatch');
  });

  test('receipt qorVersion differing from the artifact is Neutral at step 8, not a mismatch', async () => {
    const s = baseScenario(); putReceipt(s, receiptBody(s, { qorVersion: '0.175.0' }));
    await expectResult(s, 'neutral', 'unsupported-qor-version');
  });
});

suite('shield-receipt-verifier: seal commit rule (#476)', () => {
  test('V1: code commit B on top of seal commit A, receipt for B -> Rejected not-seal-commit', async () => {
    const s = onTopOfSeal(SEAL_LEDGER);
    putReceipt(s, receiptBody(s));
    await expectResult(s, 'rejected', 'not-seal-commit');
  });

  test('V1: issuance at B writes nothing', async () => {
    const s = onTopOfSeal(SEAL_LEDGER); s.receipts.clear();
    const r = await issueShieldReceipt(sourceOf(s), keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
    assert.equal(r.kind === 'issued' ? 'issued' : `${r.kind}:${r.reason}`, 'rejected:not-seal-commit');
    assert.equal(s.writes.length, 0);
  });

  test('no seal in the ledger at the commit -> Rejected seal-not-found', async () => {
    const s = baseScenario(); s.commits.set(SEAL, { parents: [PARENT], ledger: BASE_LEDGER });
    await expectResult(s, 'rejected', 'seal-not-found');
  });

  test('seal labels missing -> Rejected seal-unparseable', async () => {
    const s = baseScenario();
    s.commits.set(SEAL, { parents: [PARENT], ledger: SEAL_LEDGER.replace(/\*\*Chain Hash \(Merkle seal\)\*\*.*\n/, '') });
    await expectResult(s, 'rejected', 'seal-unparseable');
  });

  for (const [label, block] of [
    ['entry 645', sealBlock(645)], ['another Session', sealBlock(644, 'other-session')], ['another Chain Hash', sealBlock(644, SESSION, 'e'.repeat(64))],
  ] as Array<[string, string]>) {
    test(`last seal with ${label} -> Rejected seal-mismatch`, async () => {
      const s = baseScenario(); s.commits.set(SEAL, { parents: [PARENT], ledger: BASE_LEDGER + block });
      await expectResult(s, 'rejected', 'seal-mismatch');
    });
  }

  test('merge commit whose first parent lacks the seal -> Rejected merge-commit', async () => {
    const s = baseScenario();
    s.commits.set(OTHER, { parents: [], ledger: BASE_LEDGER });
    s.commits.set(SEAL, { parents: [PARENT, OTHER], ledger: SEAL_LEDGER });
    await expectResult(s, 'rejected', 'merge-commit');
  });

  test('root seal commit in a full repository -> Verified', async () => {
    const s = baseScenario(); s.commits.set(SEAL, { parents: [], ledger: SEAL_LEDGER });
    assert.equal((await run(s)).kind, 'verified');
  });

  test('shallow repository -> Neutral shallow-repository, even when the seal is the shallow root', async () => {
    const s = baseScenario(); s.shallow = true;
    s.commits.set(SEAL, { parents: [], ledger: SEAL_LEDGER });
    await expectResult(s, 'neutral', 'shallow-repository');
  });

  for (const state of ['DAMAGED', 'INCOMPLETE'] as ChainState[]) {
    test(`chain ${state} -> Neutral chain-not-ok`, async () => {
      await expectResult(baseScenario(), 'neutral', 'chain-not-ok', { chain: state });
    });
  }

  test('the default unavailableChainStatus -> Neutral chain-not-ok (success unreachable until F5)', async () => {
    await expectResult(baseScenario(), 'neutral', 'chain-not-ok', { chain: 'default' });
  });

  test('parent ledger unreadable (the read throws) -> anything but Verified', async () => {
    const s = onTopOfSeal(SEAL_LEDGER + '### Entry #645: GATE TRIBUNAL - later\n\n**Session**: `x`\n');
    putReceipt(s, receiptBody(s));
    const src = sourceOf(s);
    const failing = { ...src, showAtCommit: async (c: string, p: string) => { if (c === SEAL) throw new Error('object missing'); return src.showAtCommit(c, p); } };
    const v = await verifyShieldReceipt(failing, keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
    assert.notEqual(v.kind, 'verified');
    assert.equal(v.kind === 'verified' ? '' : v.reason, 'evidence-source-error');
  });

  test('an evidence-source method that throws -> Neutral evidence-source-error', async () => {
    const s = baseScenario(); s.throwOn = 'parents';
    await expectResult(s, 'neutral', 'evidence-source-error');
  });
});

suite('shield-receipt-verifier: first introduction (#476 N1)', () => {
  const Y1 = sha('5');
  const Y2 = sha('6');
  /** A = SEAL adds #644; Y1 drops it (or deletes the ledger); Y2 restores it with code. */
  function reintroduced(y1Ledger: string | undefined): Scenario {
    const s = baseScenario();
    s.commits.set(Y1, { parents: [SEAL], ledger: y1Ledger });
    s.commits.set(Y2, { parents: [Y1], ledger: SEAL_LEDGER });
    s.head = Y2;
    putReceipt(s, receiptBody(s));
    return s;
  }

  test('Y2 restores a seal its history already held -> Rejected seal-reintroduced', async () => {
    await expectResult(reintroduced(BASE_LEDGER), 'rejected', 'seal-reintroduced');
  });

  test('Y1 deleting the ledger file entirely does not help -> Rejected seal-reintroduced', async () => {
    await expectResult(reintroduced(undefined), 'rejected', 'seal-reintroduced');
  });

  test('issuance at Y2 writes nothing', async () => {
    const s = reintroduced(BASE_LEDGER); s.receipts.clear();
    const r = await issueShieldReceipt(sourceOf(s), keysOf(RECEIPT_KEY), chainOf('OK'), DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);
    assert.equal(r.kind === 'issued' ? 'issued' : `${r.kind}:${r.reason}`, 'rejected:seal-reintroduced');
    assert.equal(s.writes.length, 0);
  });

  test('the seal commit itself (first introduction) still verifies', async () => {
    assert.equal((await run(baseScenario())).kind, 'verified');
  });

  test('a genuine re-seal of the same entry number with a new chain hash verifies', async () => {
    const X = 'e'.repeat(64);
    const R1 = sha('7');
    const R2 = sha('8');
    const s = baseScenario();
    s.commits.set(SEAL, { parents: [PARENT], ledger: BASE_LEDGER + sealBlock(644, SESSION, X) });
    s.commits.set(R1, { parents: [SEAL], ledger: BASE_LEDGER });
    s.commits.set(R2, { parents: [R1], ledger: SEAL_LEDGER });
    s.head = R2;
    putReceipt(s, receiptBody(s));
    assert.equal((await run(s)).kind, 'verified');
  });
});

suite('shield-receipt-verifier: issuance (#476)', () => {
  const issue = (s: Scenario, key: Buffer | null = RECEIPT_KEY, chain = chainOf('OK')) =>
    issueShieldReceipt(sourceOf(s), keysOf(key ?? undefined), chain, DEFAULT_SHIELD_POLICY, 'api.github.com', NOW);

  test('issues at the seal commit a receipt the verifier accepts', async () => {
    const s = baseScenario(); s.receipts.clear();
    const r = await issue(s);
    assert.equal(r.kind, 'issued');
    assert.equal(s.writes.length, 1);
    assert.equal(s.writes[0][0], SEAL);
    assert.equal((await run(s)).kind, 'verified');
  });

  test('every receipt field comes from the artifacts, git or the arguments', async () => {
    const s = baseScenario(); s.receipts.clear();
    await issue(s);
    const r = JSON.parse(s.writes[0][1]);
    const want = signShieldReceipt({ ...receiptBody(s), issuedAt: new Date(NOW).toISOString() }, RECEIPT_KEY);
    assert.deepEqual(r, want);
  });

  test('with the default chain status it writes nothing', async () => {
    const s = baseScenario(); s.receipts.clear();
    const r = await issue(s, RECEIPT_KEY, unavailableChainStatus);
    assert.equal(r.kind === 'issued' ? 'issued' : `${r.kind}:${r.reason}`, 'neutral:chain-not-ok');
    assert.equal(s.writes.length, 0);
  });

  test('with no receipt key it returns Neutral receipt-key-unavailable and writes nothing', async () => {
    const s = baseScenario(); s.receipts.clear();
    const r = await issue(s, null);
    assert.equal(r.kind === 'issued' ? 'issued' : `${r.kind}:${r.reason}`, 'neutral:receipt-key-unavailable');
    assert.equal(s.writes.length, 0);
  });
});

suite('shield-receipt-verifier: detail hygiene (#476)', () => {
  test('no detail carries a path, key material or artifact text', () => {
    const banned = [
      FIXTURE_ROOT, QOR_KEY.toString('hex'), RECEIPT_KEY.toString('hex'),
      JSON.stringify(auditArtifact(), null, 2), '"session_id"', '"merkle_seal"', '.qor/',
    ];
    const details = SEEN.flatMap((v) => (v.kind === 'verified' ? [] : [v.detail]));
    assert.ok(details.length >= 40, `saw ${details.length} non-verified results`);
    for (const d of details) for (const b of banned) assert.ok(!d.includes(b), `detail leaks ${b.slice(0, 20)}: ${d}`);
  });
});
