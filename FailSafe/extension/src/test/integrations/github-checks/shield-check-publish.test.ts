// #476: the verified SHIELD publisher. Fake transports throughout; no network.

import { strict as assert } from 'assert';
import { publishVerifiedShieldCheck, type ShieldPublication, type ShieldPublishArgs } from '../../../integrations/github-checks/shield-check-publish';
import type { GitHubPostFn } from '../../../integrations/github-checks/github-checks-client';
import type { ShieldEvidenceSource } from '../../../integrations/shield-receipts/shield-evidence';
import { verifyShieldReceipt } from '../../../integrations/shield-receipts/shield-receipt-verifier';
import {
  BASE_LEDGER, CODE, NOW, OTHER, RECEIPT_KEY, SEAL, baseScenario, chainOf, keysOf, putReceipt, receiptBody,
  sealBlock, sourceOf, type Scenario,
} from '../shield-receipts/fixtures';
import { referencesTo } from './source-scan';

interface Posted { url: string; body: Record<string, unknown> }

function echoPost(posts: Posted[], over: (b: Record<string, unknown>) => Record<string, unknown> = (b) => b): GitHubPostFn {
  return async (url, _h, body) => {
    const b = JSON.parse(body);
    posts.push({ url, body: b });
    return { status: 201, body: JSON.stringify({ id: 77, ...over({ head_sha: b.head_sha, name: b.name, conclusion: b.conclusion }) }) };
  };
}

function args(s: Scenario, posts: Posted[], over: Partial<ShieldPublishArgs> = {}): ShieldPublishArgs {
  return {
    ctx: { remoteUrl: s.remote, headSha: s.head },
    opts: { enabled: true, token: 't' },
    post: echoPost(posts),
    src: sourceOf(s),
    keys: keysOf(RECEIPT_KEY),
    chain: chainOf('OK'),
    now: () => NOW,
    ...over,
  };
}

/** A source whose headSha() answers from a sequence (the last value repeats). */
function headSequence(src: ShieldEvidenceSource, seq: string[]): ShieldEvidenceSource {
  let i = 0;
  return { ...src, headSha: async () => seq[Math.min(i++, seq.length - 1)] };
}

suite('shield-check-publish (#476)', () => {
  test('Verified -> one SHIELD success POST for the receipt commit, with provenance in the summary', async () => {
    const posts: Posted[] = [];
    const recorded: ShieldPublication[] = [];
    const r = await publishVerifiedShieldCheck(args(baseScenario(), posts, { recordPublication: (p) => { recorded.push(p); } }));
    assert.equal(r.published, true);
    assert.equal(posts.length, 1);
    const b = posts[0].body;
    assert.equal(b.name, 'FailSafe SHIELD');
    assert.equal(b.conclusion, 'success');
    assert.equal(b.head_sha, SEAL);
    assert.match(posts[0].url, /\/repos\/acme\/failsafe\/check-runs$/);
    const summary = (b.output as { summary: string }).summary;
    assert.match(summary, /not CI-attested/);
    if (!r.published) return;
    assert.equal(r.checkRunId, 77);
    assert.ok(r.receiptDigest && summary.includes(r.receiptDigest), 'summary carries the receipt digest');
    assert.deepEqual(recorded, [{ checkRunId: 77, commitSha: SEAL, conclusion: 'success', receiptDigest: r.receiptDigest }]);
  });

  test('Rejected (not-seal-commit) -> one SHIELD failure POST naming the reason', async () => {
    const s = baseScenario();
    s.commits.set(CODE, { parents: [SEAL], ledger: BASE_LEDGER + sealBlock(644) });
    s.head = CODE;
    putReceipt(s, receiptBody(s));
    const posts: Posted[] = [];
    const r = await publishVerifiedShieldCheck(args(s, posts));
    assert.equal(r.published, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.conclusion, 'failure');
    assert.equal(posts[0].body.head_sha, CODE);
    assert.match((posts[0].body.output as { summary: string }).summary, /not-seal-commit/);
  });

  test('Neutral (no receipt) -> nothing posted', async () => {
    const s = baseScenario(); s.receipts.clear();
    const posts: Posted[] = [];
    const r = await publishVerifiedShieldCheck(args(s, posts));
    assert.deepEqual([r.published, r.published ? '' : r.reason, posts.length], [false, 'no-receipt', 0]);
  });

  test('Neutral (default chain status) -> nothing posted', async () => {
    const posts: Posted[] = [];
    const r = await publishVerifiedShieldCheck(args(baseScenario(), posts, { chain: undefined }));
    assert.deepEqual([r.published, r.published ? '' : r.reason, posts.length], [false, 'chain-not-ok', 0]);
  });

  test('HEAD moves between verification and the POST -> head-moved, nothing posted', async () => {
    const s = baseScenario();
    const posts: Posted[] = [];
    const r = await publishVerifiedShieldCheck(args(s, posts, { src: headSequence(sourceOf(s), [SEAL, SEAL, OTHER]) }));
    assert.deepEqual([r.published, r.published ? '' : r.reason, posts.length], [false, 'head-moved', 0]);
  });

  test('ctx disagreeing with the evidence source -> context-mismatch, nothing posted', async () => {
    for (const ctx of [{ remoteUrl: 'https://github.com/acme/failsafe.git', headSha: OTHER }, { remoteUrl: 'https://github.com/acme/y.git', headSha: SEAL }]) {
      const posts: Posted[] = [];
      const r = await publishVerifiedShieldCheck(args(baseScenario(), posts, { ctx }));
      assert.deepEqual([r.published, r.published ? '' : r.reason, posts.length], [false, 'context-mismatch', 0]);
    }
  });

  test('an injected verify returning a look-alike receipt is refused by the transport', async () => {
    const s = baseScenario();
    const real = await verifyShieldReceipt(sourceOf(s), keysOf(RECEIPT_KEY), chainOf('OK'), undefined, 'api.github.com', NOW);
    assert.equal(real.kind, 'verified');
    const lookAlike = real.kind === 'verified' ? { ...real.receipt } : {};
    const verify = (async () => ({ kind: 'verified', receipt: lookAlike })) as unknown as ShieldPublishArgs['verify'];
    const posts: Posted[] = [];
    const r = await publishVerifiedShieldCheck(args(s, posts, { verify }));
    assert.equal(r.published, false);
    assert.equal(posts.length, 0);
  });

  for (const [label, over] of [
    ['another head_sha', (b: Record<string, unknown>) => ({ ...b, head_sha: OTHER })],
    ['another name', (b: Record<string, unknown>) => ({ ...b, name: 'FailSafe Manual Advisory' })],
    ['another conclusion', (b: Record<string, unknown>) => ({ ...b, conclusion: 'neutral' })],
  ] as Array<[string, (b: Record<string, unknown>) => Record<string, unknown>]>) {
    test(`a 201 echoing ${label} is unconfirmed`, async () => {
      const posts: Posted[] = [];
      const recorded: ShieldPublication[] = [];
      const r = await publishVerifiedShieldCheck(args(baseScenario(), posts, { post: echoPost(posts, over), recordPublication: (p) => { recorded.push(p); } }));
      assert.deepEqual([r.published, r.published ? '' : r.reason], [false, 'unconfirmed-response']);
      assert.equal(recorded.length, 0);
    });
  }

  for (const [label, post] of [
    ['401', async () => ({ status: 401, body: '' })],
    ['403', async () => ({ status: 403, body: '{"message":"Resource not accessible by integration"}' })],
    ['422', async () => ({ status: 422, body: '{"message":"No commit found for SHA"}' })],
    ['timeout', async () => { throw new Error('timeout'); }],
  ] as Array<[string, GitHubPostFn]>) {
    test(`${label} -> not published, nothing recorded`, async () => {
      const recorded: ShieldPublication[] = [];
      const r = await publishVerifiedShieldCheck(args(baseScenario(), [], { post, recordPublication: (p) => { recorded.push(p); } }));
      assert.equal(r.published, false);
      assert.equal(recorded.length, 0);
    });
  }

  test('disabled, no token, fork or malformed apiBaseUrl -> nothing posted and no evidence read', async () => {
    const cases: Array<Partial<ShieldPublishArgs>> = [
      { opts: { enabled: false, token: 't' } },
      { opts: { enabled: true, token: '' } },
      { ctx: { remoteUrl: 'https://github.com/acme/failsafe.git', headSha: SEAL, isFork: true } },
      { opts: { enabled: true, token: 't', apiBaseUrl: 'not a url' } },
    ];
    for (const over of cases) {
      const s = baseScenario();
      const posts: Posted[] = [];
      const r = await publishVerifiedShieldCheck(args(s, posts, over));
      assert.equal(r.published, false);
      assert.equal(posts.length, 0);
      assert.equal(s.reads, 0, JSON.stringify(over));
    }
  });
});

suite('shield-check-publish production importer pin (#476)', () => {
  test('only the publisher and the transport reference the verifier', () => {
    const refs = referencesTo('shield-receipt-verifier');
    const allowed = ['integrations/github-checks/shield-check-publish.ts', 'integrations/github-checks/check-run-transport.ts'];
    const bad = refs.filter((r) => !allowed.includes(r.file) && !(r.file === 'integrations/shield-receipts/workspace-evidence-source.ts' && r.typeOnly));
    assert.deepEqual(bad, []);
    assert.ok(refs.some((r) => r.file === 'integrations/github-checks/shield-check-publish.ts'), 'scan found the known importer');
  });

  test('no production file references the publisher yet (F1 wires it)', () => {
    assert.deepEqual(referencesTo('shield-check-publish'), []);
  });
});

