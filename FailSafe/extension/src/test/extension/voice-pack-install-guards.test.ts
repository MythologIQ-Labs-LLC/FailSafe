import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  installVoicePack, resolveVoicePackUrl, uninstallVoicePack,
} from "../../voice-pack/install-handler";
import {
  buildFixturePackTar, installFetchStub, makeInstallFixture,
  unstubFetch, type InstallFixture,
} from "./voice-pack-install-test-helpers";

suite("voice-pack install guards", () => {
  let fixture: InstallFixture;
  setup(() => { fixture = makeInstallFixture(); });
  teardown(() => {
    fixture.restoreSpawn(); unstubFetch();
    fs.rmSync(fixture.globalStoragePath, { recursive: true, force: true });
  });

  test("fetch follows redirects while retaining a bounded final host", async () => {
    const bytes = buildFixturePackTar();
    const { calls } = installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes,
        finalUrl: "https://evil.example.com/pack.tar.gz" },
    ]);
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: "5.2.0",
    }), /redirect|host|allowlist|not allowed/i);
    assert.equal(calls[0].init?.redirect, "follow");
    assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, "voice-pack")), false);
  });

  test("version-derived URL rejects command-shaped input", () => {
    assert.throws(() => resolveVoicePackUrl("not-a-semver"), /version|semver/i);
    assert.throws(() => resolveVoicePackUrl("5.2.0; rm -rf /"), /version|semver/i);
    assert.match(resolveVoicePackUrl("5.2.0"), /^https:\/\/github\.com\/MythologIQ\/FailSafe\//);
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
