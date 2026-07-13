import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { installVoicePack } from "../../voice-pack/install-handler";
import {
  buildFixturePackTar, installFetchStub, makeInstallFixture, sha256OfBytes,
  unstubFetch, type InstallFixture,
} from "./voice-pack-install-test-helpers";

let fixture: InstallFixture;

function registerVoicePackInstallHooks(): void {
  setup(() => { fixture = makeInstallFixture(); });
  teardown(() => {
    fixture.restoreSpawn();
    unstubFetch();
    fs.rmSync(fixture.globalStoragePath, { recursive: true, force: true });
  });

}

suite("voice-pack install-handler — installVoicePack", () => {
  registerVoicePackInstallHooks();
  test("SHA256 mismatch aborts before extract", async () => {
    const bytes = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes },
      { url: /\.sha256$/, body: `${"0".repeat(64)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
    ]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath: fixture.globalStoragePath, version: "5.2.0" }),
      /sha256|checksum|integrity/i,
    );
    assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, "voice-pack")), false);
  });

  test("extract failure preserves the prior pack", async () => {
    const finalDir = path.join(fixture.globalStoragePath, "voice-pack");
    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, "sentinel.txt"), "PRIOR PACK");
    const bytes = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes },
      { url: /\.sha256$/, body: `${sha256OfBytes(bytes)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
    ]);
    fixture.extractControl.shouldFail = true;
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: "5.2.0",
    }));
    assert.equal(fs.readFileSync(path.join(finalDir, "sentinel.txt"), "utf8"), "PRIOR PACK");
  });
});

suite("voice-pack install-handler — installVoicePack", () => {
  registerVoicePackInstallHooks();
  test("success atomically installs the verified staging pack", async () => {
    const bytes = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes },
      { url: /\.sha256$/, body: `${sha256OfBytes(bytes)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
    ]);
    const result = await installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: "5.2.0",
    });
    assert.equal(result.ok, true);
    assert.ok(fs.existsSync(path.join(
      fixture.globalStoragePath, "voice-pack", "voice-pack.manifest.json",
    )));
  });
});
