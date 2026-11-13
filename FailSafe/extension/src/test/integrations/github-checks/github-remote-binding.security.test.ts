// #476 / GRB-01..07: prospective falsification suite, NOT a passing security fix.
// These intentionally expose source defects on main. This test-only draft must
// not merge before an independent L3 native audit and actual runtime remediation.
import { strict as assert } from 'assert';
import { parseRepoSlug, buildManualAdvisoryPayload } from '../../../integrations/github-checks/github-checks-map';
import {
  createPullRequest, publishCheckRunPayload, type GitHubPostFn,
} from '../../../integrations/github-checks/github-checks-client';
import { publishVerifiedShieldCheck } from '../../../integrations/github-checks/shield-check-publish';
import { publishLinkageCheck } from '../../../integrations/github-checks/pr-linkage-publish';
import {
  NOW, RECEIPT_KEY, baseScenario, chainOf, keysOf, sourceOf,
} from '../shield-receipts/fixtures';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const GOOD = 'https://github.com/acme/failsafe.git';
const FOREIGN = 'https://github.com.evil.example/acme/failsafe.git';
const OPTS = { enabled: true, token: 'ghs_test_not_real' };

function posts() {
  const urls: string[] = [];
  const post: GitHubPostFn = async (url) => {
    urls.push(url);
    return { status: 201, body: JSON.stringify({ id: 41 }) };
  };
  return { urls, post };
}

suite('GRB security characterization: GitHub repository identity (#476)', () => {
  test('GRB-01 accepted exact public GitHub and custom enterprise forms', () => {
    const expected = { owner: 'acme', repo: 'failsafe' };
    for (const remote of [GOOD, 'git@github.com:acme/failsafe.git',
      'ssh://git@github.com/acme/failsafe.git',
      'https://ghe.example/acme/failsafe.git']) {
      assert.deepEqual(parseRepoSlug(remote), expected, remote);
    }
  });

  test('GRB-02 file scheme, extra path, query and fragment do not parse as a GitHub repo', () => {
    const invalid = [
      'file:///tmp/acme/failsafe.git',
      'https://github.com/unrelated/path/acme/failsafe.git',
      'https://github.com/acme/failsafe?another=repository',
      'https://github.com/acme/failsafe.git#untrusted',
    ];
    for (const remote of invalid) assert.equal(parseRepoSlug(remote), null, remote);
  });

  test('GRB-03 public GitHub API refuses an unrelated remote host before publishing an advisory', async () => {
    const c = posts();
    const res = await publishCheckRunPayload(
      buildManualAdvisoryPayload(SHA_A), { remoteUrl: FOREIGN, headSha: SHA_A }, OPTS, c.post,
    );
    assert.equal(res.ok && !res.localOnly, false, 'foreign host did not authorize publishing');
    assert.deepEqual(c.urls, [], 'no network POST to an unrelated repository');
  });

  test('GRB-03b public GitHub API refuses a PR create from unrelated remote', async () => {
    const c = posts();
    const res = await createPullRequest({
      token: OPTS.token, remoteUrl: FOREIGN,
      head: 'fix/x', base: 'main', title: 'test', body: '',
    }, c.post);
    assert.equal(res.ok && !res.localOnly, false, 'foreign host did not authorize PR creation');
    assert.deepEqual(c.urls, []);
  });

  test('GRB-04 explicit GHES host/API pair works, but foreign host cannot reuse its API token', async () => {
    const c = posts();
    const options = { ...OPTS, apiBaseUrl: 'https://ghe.example/api/v3' };
    const good = await publishCheckRunPayload(buildManualAdvisoryPayload(SHA_A), {
      remoteUrl: 'https://ghe.example/acme/failsafe.git', headSha: SHA_A,
    }, options, c.post);
    assert.equal(good.ok, true, 'existing supported GHES path works');
    assert.equal(c.urls.length, 1);
    const wrong = await publishCheckRunPayload(buildManualAdvisoryPayload(SHA_A), {
      remoteUrl: 'https://unrelated.example/acme/failsafe.git', headSha: SHA_A,
    }, options, c.post);
    assert.equal(wrong.ok && !wrong.localOnly, false);
    assert.equal(c.urls.length, 1, 'foreign GHES host made no second POST');
  });

  test('GRB-05 generic advisory cannot be published for a different HEAD', async () => {
    const c = posts();
    const res = await publishCheckRunPayload(
      buildManualAdvisoryPayload(SHA_B),
      { remoteUrl: GOOD, headSha: SHA_A }, OPTS, c.post,
    );
    assert.equal(res.ok, false, 'wire SHA must match the authorized HEAD');
    assert.deepEqual(c.urls, []);
  });

  test('GRB-07 PR linkage cannot audit a foreign repository and publish green on the current one', async () => {
    const reads: string[] = [];
    const c = posts();
    const get = async (url: string) => {
      reads.push(url);
      if (url.endsWith('/pulls/9')) return { status: 200, body: JSON.stringify({ body: 'Closes #3' }) };
      return { status: 200, body: JSON.stringify([{ number: 3, state: 'open' }]) };
    };
    const res = await publishLinkageCheck({
      ctx: { remoteUrl: GOOD, headSha: SHA_A },
      opts: OPTS,
      owner: 'foreign', repo: 'other-repository', prNumber: 9,
      get, post: c.post,
    });
    assert.equal(res.ok && !res.localOnly, false, 'foreign PR results cannot be attested on this repository');
    assert.deepEqual(reads, [], 'refuse before reading the unrelated PR/issue set');
    assert.deepEqual(c.urls, [], 'no green linkage result on the authorized target');
  });

  test('GRB-06 SHIELD context host cannot differ from evidence origin with same owner/repo', async () => {
    const s = baseScenario();
    const c = posts();
    const res = await publishVerifiedShieldCheck({
      ctx: { remoteUrl: FOREIGN, headSha: s.head },
      opts: OPTS,
      post: c.post,
      src: sourceOf(s),
      keys: keysOf(RECEIPT_KEY),
      chain: chainOf('OK'),
      now: () => NOW,
    });
    assert.equal(res.published, false, 'the trust-root repository host must match');
    assert.deepEqual(c.urls, [], 'no SHIELD success posted for an unbound remote host');
  });
});
