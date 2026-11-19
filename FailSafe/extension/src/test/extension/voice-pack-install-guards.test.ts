import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  installVoicePack, resolveVoicePackUrl, uninstallVoicePack,
} from "../../voice-pack/install-handler";
import {
  buildFixturePackTar, installFetchStub, makeInstallFixture, originalFetch, sha256OfBytes,
  unstubFetch, type InstallFixture,
} from "./voice-pack-install-test-helpers";

suite("voice-pack install guards", () => {
  let fixture: InstallFixture;
  setup(() => { fixture = makeInstallFixture(); });
  teardown(() => {
    fixture.restoreSpawn(); unstubFetch();
    fs.rmSync(fixture.globalStoragePath, { recursive: true, force: true });
  });

  test("a 200 whose response.url names evil.example.com is refused; no voice-pack dir", async () => {
    const bytes = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes,
        finalUrl: "https://evil.example.com/pack.tar.gz" },
    ]);
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: "5.2.0",
    }), /redirect|host|allowlist|not allowed/i);
    assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, "voice-pack")), false);
  });

  test("declared over-budget archive fails before extraction", async () => {
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: buildFixturePackTar(),
        contentLength: 96 * 1024 * 1024 + 1 },
    ]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath: fixture.globalStoragePath, version: "5.2.0" }),
      /download failed: compressed voice pack exceeds size budget/,
    );
    assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, "voice-pack")), false);
  });

  test("oversized checksum response is bounded and leaves prior pack untouched", async () => {
    const bytes = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes },
      { url: /\.sha256$/, body: "x".repeat(8193) },
    ]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath: fixture.globalStoragePath, version: "5.2.0" }),
      /checksum fetch failed: response exceeds budget/,
    );
    assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, "voice-pack")), false);
  });

  test("checksum must name exactly this archive, with no additional records", async () => {
    const prior = path.join(fixture.globalStoragePath, "voice-pack");
    fs.mkdirSync(prior);
    fs.writeFileSync(path.join(prior, "sentinel.txt"), "unchanged");
    const tar = buildFixturePackTar();
    const sha = sha256OfBytes(tar);
    for (const checksum of [
      `${sha}  other-asset.tar.gz\n`,
      `${sha}  failsafe-voice-pack-5.2.0.tar.gz\n${sha}  second-asset\n`,
      `${sha} *failsafe-voice-pack-5.2.0.tar.gz\n`,
    ]) {
      installFetchStub([
        { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: tar },
        { url: /\.sha256$/, body: checksum },
      ]);
      await assert.rejects(
        () => installVoicePack({ globalStoragePath: fixture.globalStoragePath, version: "5.2.0" }),
        /checksum fetch failed: malformed or mismatched archive filename/,
      );
      assert.equal(fs.readFileSync(path.join(prior, "sentinel.txt"), "utf8"), "unchanged");
      unstubFetch();
    }
  });

  test("version-derived URL rejects command-shaped input", () => {
    assert.throws(() => resolveVoicePackUrl("not-a-semver"), /version|semver/i);
    assert.throws(() => resolveVoicePackUrl("5.2.0; rm -rf /"), /version|semver/i);
    assert.match(resolveVoicePackUrl("5.2.0"), /^https:\/\/github\.com\/MythologIQ-Labs-LLC\/FailSafe\//);
  });

  test("unstubFetch restores the platform fetch instead of deleting it (#538)", () => {
    installFetchStub([]);
    unstubFetch();
    assert.equal((globalThis as { fetch?: unknown }).fetch, originalFetch());
    assert.equal(typeof (globalThis as { fetch?: unknown }).fetch, "function");
  });

  test("uninstall removes only the voice-pack directory", () => {
    const pack = path.join(fixture.globalStoragePath, "voice-pack");
    const sibling = path.join(fixture.globalStoragePath, "other-data.json");
    fs.mkdirSync(pack, { recursive: true });
    fs.writeFileSync(path.join(pack, "piper.min.js"), "piper");
    fs.writeFileSync(sibling, "{}");
    uninstallVoicePack(fixture.globalStoragePath);
    assert.equal(fs.existsSync(pack), false);
    assert.equal(fs.existsSync(sibling), true);
  });
});
