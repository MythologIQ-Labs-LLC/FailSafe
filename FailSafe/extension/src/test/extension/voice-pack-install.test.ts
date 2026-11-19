import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { installVoicePack, uninstallVoicePack } from "../../voice-pack/install-handler";
import {
  buildFixturePackEntries, buildFixturePackTar, buildFixtureTar, installFetchStub, makeInstallFixture, sha256OfBytes,
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
    const bytes = Buffer.from('not a gzip archive');
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes },
      { url: /\.sha256$/, body: `${sha256OfBytes(bytes)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
    ]);
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: "5.2.0",
    }));
    assert.equal(fs.readFileSync(path.join(finalDir, "sentinel.txt"), "utf8"), "PRIOR PACK");
  });
});

suite("voice-pack install-handler — installVoicePack", () => {
  registerVoicePackInstallHooks();
  test("adversarial tar member is refused before replacing prior installed pack", async () => {
    const finalDir = path.join(fixture.globalStoragePath, "voice-pack");
    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, "sentinel.txt"), "PRESERVED");
    const bytes = buildFixtureTar([...buildFixturePackEntries(), {
      name: "../outside", body: "malicious",
    }]);
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes },
      { url: /\.sha256$/, body: `${sha256OfBytes(bytes)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
    ]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath: fixture.globalStoragePath, version: "5.2.0" }),
      /tar extract refused/,
    );
    assert.equal(fs.readFileSync(path.join(finalDir, "sentinel.txt"), "utf8"), "PRESERVED");
  });

  test("success recoverably installs the verified staging pack", async () => {
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

suite("voice-pack install-handler — storage boundary (#710)", () => {
  registerVoicePackInstallHooks();

  test("a symlinked storage root refuses installation before any network request", async () => {
    if (process.platform === "win32") return; // symlink privilege varies
    const outside = path.join(fixture.globalStoragePath, "outside-storage");
    const linked = path.join(fixture.globalStoragePath, "linked-storage");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "sentinel.txt"), "UNTOUCHED");
    fs.symlinkSync(outside, linked, "dir");
    const { calls } = installFetchStub([]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath: linked, version: "5.2.0" }),
      /storage root must be a real directory/,
    );
    assert.equal(calls.length, 0, "untrusted storage must be refused before downloading");
    assert.equal(fs.readFileSync(path.join(outside, "sentinel.txt"), "utf8"), "UNTOUCHED");
    assert.throws(() => uninstallVoicePack(linked), /storage root must be a real directory/);
    assert.equal(fs.readFileSync(path.join(outside, "sentinel.txt"), "utf8"), "UNTOUCHED");
  });

  test("uninstall refuses a linked voice-pack destination and preserves its target", () => {
    if (process.platform === "win32") return; // symlink privilege varies
    const outside = path.join(fixture.globalStoragePath, "other-data");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "sentinel.txt"), "KEEP");
    const linked = path.join(fixture.globalStoragePath, "voice-pack");
    fs.symlinkSync(outside, linked, "dir");
    assert.throws(() => uninstallVoicePack(fixture.globalStoragePath), /destination is not a real directory/);
    assert.equal(fs.lstatSync(linked).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(path.join(outside, "sentinel.txt"), "utf8"), "KEEP");
  });

  test("uninstall removes an owned real voice-pack directory, remains idempotent", () => {
    const dir = path.join(fixture.globalStoragePath, "voice-pack");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "sentinel.txt"), "OWNED");
    uninstallVoicePack(fixture.globalStoragePath);
    assert.equal(fs.existsSync(dir), false);
    uninstallVoicePack(fixture.globalStoragePath);
    assert.equal(fs.existsSync(dir), false);
  });

  test("storage file or nonabsolute path is refused before network download", async () => {
    const file = path.join(fixture.globalStoragePath, "not-a-directory");
    fs.writeFileSync(file, "OUTSIDE");
    const { calls } = installFetchStub([]);
    await assert.rejects(
      () => installVoicePack({ globalStoragePath: file, version: "5.2.0" }),
      /storage root must be a real directory/,
    );
    await assert.rejects(
      () => installVoicePack({ globalStoragePath: "relative/not-allowed", version: "5.2.0" }),
      /storage root must be absolute/,
    );
    assert.equal(calls.length, 0);
    assert.equal(fs.readFileSync(file, "utf8"), "OUTSIDE");
  });

  test("promotion failure reports install rather than a false download failure", async () => {
    const finalDir = path.join(fixture.globalStoragePath, "voice-pack");
    fs.writeFileSync(finalDir, "EXISTING UNRELATED FILE");
    const bytes = buildFixturePackTar();
    installFetchStub([
      { url: /failsafe-voice-pack-5\.2\.0\.tar\.gz$/, body: bytes },
      { url: /\.sha256$/, body: `${sha256OfBytes(bytes)}  failsafe-voice-pack-5.2.0.tar.gz\n` },
    ]);
    const phases: Array<{ phase: string; status: string; error?: string }> = [];
    await assert.rejects(() => installVoicePack({
      globalStoragePath: fixture.globalStoragePath, version: "5.2.0",
      onProgress: event => { phases.push(event); },
    }), /destination must be a real directory/);
    const failure = phases[phases.length - 1];
    assert.equal(failure.phase, "install");
    assert.equal(failure.status, "error");
    assert.match(failure.error || "", /destination must be a real directory/);
    assert.equal(fs.readFileSync(finalDir, "utf8"), "EXISTING UNRELATED FILE");
    assert.ok(phases.some(e => e.phase === "verify" && e.status === "success"));
  });
});
