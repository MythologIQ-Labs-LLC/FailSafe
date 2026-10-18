import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  installVoicePack, resolveVoicePackUrl, uninstallVoicePack,
} from "../../voice-pack/install-handler";
import {
  buildFixturePackTar, installFetchStub, makeInstallFixture, originalFetch,
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
