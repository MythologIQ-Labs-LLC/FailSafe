import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { installVoicePack } from '../../voice-pack/install-handler';
import * as publisher from '../../voice-pack/publisher-auth';
import { buildFixturePackTar, installFetchStub, makeInstallFixture,
  sha256OfBytes, unstubFetch, type InstallFixture } from './voice-pack-install-test-helpers';

suite('voice-pack publisher authentication #732', () => {
  let fixture: InstallFixture;
  setup(() => { fixture = makeInstallFixture(); });
  teardown(() => {
    fixture.restoreSpawn();
    unstubFetch();
    fs.rmSync(fixture.globalStoragePath, { recursive: true, force: true });
  });

  test('missing approved root refuses before network transfer or storage mutation', async () => {
    const orig = publisher.loadPinnedVoicePublisherKey;
    (publisher as { loadPinnedVoicePublisherKey: () => string })
      .loadPinnedVoicePublisherKey = () => { throw Error('publisher authentication refused: no owner key'); };
    const { calls } = installFetchStub([]);
    try {
      await assert.rejects(() => installVoicePack({
        globalStoragePath: fixture.globalStoragePath, version: '5.2.0',
      }), /publisher authentication refused: no owner key/);
      assert.equal(calls.length, 0);
      assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, 'voice-pack')), false);
    } finally {
      (publisher as { loadPinnedVoicePublisherKey: () => string })
        .loadPinnedVoicePublisherKey = orig;
    }
  });

  test('invalid publisher signature preserves prior installed data', async () => {
    const prior = path.join(fixture.globalStoragePath, 'voice-pack');
    fs.mkdirSync(prior);
    fs.writeFileSync(path.join(prior, 'sentinel.txt'), 'KEEP');
    const archive = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: archive },
      { url: /\.sha256$/, body: `${sha256OfBytes(archive)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
      { url: /voice-pack-release\.json\.sig$/, body: Buffer.alloc(64).toString('base64') + '\n' },
    ]);
    const events: Array<{ phase: string; status: string }> = [];
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: '5.2.0',
      onProgress: e => events.push(e),
    }), /publisher authentication refused: Ed25519 signature mismatch/);
    assert.equal(fs.readFileSync(path.join(prior, 'sentinel.txt'), 'utf8'), 'KEEP');
    assert.deepEqual(events.at(-1), { phase: 'verify', status: 'error' });
  });

  test('signed manifest content mismatch refuses before replacing prior pack', async () => {
    const archive = buildFixturePackTar();
    const prior = path.join(fixture.globalStoragePath, 'voice-pack');
    fs.mkdirSync(prior);
    fs.writeFileSync(path.join(prior, 'sentinel.txt'), 'KEEP');
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: archive },
      { url: /\.sha256$/, body: `${sha256OfBytes(archive)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
      { url: /voice-pack-release\.json$/, body: '{}' },
    ]);
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: '5.2.0',
    }), /publisher authentication refused: unexpected signed record fields/);
    assert.equal(fs.readFileSync(path.join(prior, 'sentinel.txt'), 'utf8'), 'KEEP');
  });

  test('missing attestation produces a real refusal instead of checksum-only success', async () => {
    const archive = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: archive },
      { url: /\.sha256$/, body: `${sha256OfBytes(archive)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
      { url: /voice-pack-release\.json$/, status: 404 },
    ]);
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: '5.2.0',
    }), /publisher authentication refused: HTTP 404/);
    assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, 'voice-pack')), false);
  });

  test('release attestation redirect to non-GitHub host is never requested', async () => {
    const archive = buildFixturePackTar();
    const { calls } = installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: archive },
      { url: /\.sha256$/, body: `${sha256OfBytes(archive)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
      { url: /voice-pack-release\.json$/, status: 302, location: 'https://evil.example.com/signed' },
    ]);
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: '5.2.0',
    }), /publisher authentication refused: redirect target rejected: host/);
    assert.equal(calls.some(c => c.url.includes('evil.example.com')), false);
  });
});
