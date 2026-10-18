/**
 * #538 lane D (B261): the Voice Pack download follows redirects one hop at a
 * time. Every hop is checked before it is requested, and every response is
 * checked for a redirect the fetch followed by itself. The fetch stub follows
 * redirects the way a platform fetch does unless asked for manual mode, so a
 * hop the old code would have requested shows up in `calls`.
 */

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  installVoicePack, resolveVoicePackUrl,
} from "../../voice-pack/install-handler";
import type { InstallProgressEvent, InstallReport } from "../../voice-pack/types";
import {
  buildFixturePackTar, installFetchStub, makeInstallFixture, sha256OfBytes,
  unstubFetch, type FetchHandler, type FetchStubOptions, type InstallFixture,
} from "./voice-pack-install-test-helpers";

const TARBALL_ON_GITHUB = /^https:\/\/github\.com\/.*failsafe-voice-pack-5\.2\.0\.tar\.gz$/;
const CHECKSUM_ON_GITHUB = /^https:\/\/github\.com\/.*failsafe-voice-pack-5\.2\.0\.tar\.gz\.sha256$/;
const ASSET_HOST = "https://release-assets.githubusercontent.com";
const TARBALL_ASSET = `${ASSET_HOST}/github-production-release-asset/1?X-Amz-Signature=abc`;
const CHECKSUM_ASSET = `${ASSET_HOST}/github-production-release-asset/2?X-Amz-Signature=abc`;

let fixture: InstallFixture;

function bytes(): Uint8Array { return buildFixturePackTar(); }
function checksumBody(digest = sha256OfBytes(bytes())): string {
  return `${digest}  failsafe-voice-pack-5.2.0.tar.gz\n`;
}

/** The chain GitHub serves today: the release URL 302s to the signed asset host. */
function observedChain(digest?: string): FetchHandler[] {
  return [
    { url: CHECKSUM_ON_GITHUB, status: 302, location: CHECKSUM_ASSET },
    { url: TARBALL_ON_GITHUB, status: 302, location: TARBALL_ASSET },
    { url: CHECKSUM_ASSET, body: checksumBody(digest) },
    { url: TARBALL_ASSET, body: bytes() },
  ];
}

function run(handlers: FetchHandler[], options?: FetchStubOptions) {
  const stub = installFetchStub(handlers, options);
  const lines: string[] = [];
  const events: InstallProgressEvent[] = [];
  const result = installVoicePack({
    globalStoragePath: fixture.globalStoragePath, version: "5.2.0",
    output: { appendLine: (m) => { lines.push(m); } },
    onProgress: (e) => { events.push(e); },
  });
  return { calls: stub.calls, lines, events, result };
}

function noPackDir(): void {
  assert.equal(fs.existsSync(path.join(fixture.globalStoragePath, "voice-pack")), false);
}

function callsTo(calls: Array<{ url: string }>, prefix: string): number {
  return calls.filter((c) => c.url.startsWith(prefix)).length;
}

suite("voice-pack controlled redirects (#538)", () => {
  setup(() => { fixture = makeInstallFixture(); });
  teardown(() => {
    fixture.restoreSpawn(); unstubFetch();
    fs.rmSync(fixture.globalStoragePath, { recursive: true, force: true });
  });

  test("V1 the download URL names the current repository", () => {
    assert.equal(resolveVoicePackUrl("5.2.0"),
      "https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download/v5.2.0-voice/failsafe-voice-pack-5.2.0.tar.gz");
  });

  test("V2 the observed GitHub chain is accepted, hop by hop, with provenance and no signed query", async () => {
    const { calls, lines, result } = run(observedChain());
    const report: InstallReport = await result;
    assert.equal(report.ok, true);
    assert.ok(calls.length >= 4);
    for (const c of calls) assert.equal(c.init?.redirect, "manual", `${c.url} must be requested in manual mode`);
    const tarballUrl = resolveVoicePackUrl("5.2.0");
    assert.deepEqual(report.provenance, {
      tarball: { requestedUrl: tarballUrl, finalUrl: `${ASSET_HOST}/github-production-release-asset/1` },
      checksum: { requestedUrl: `${tarballUrl}.sha256`, finalUrl: `${ASSET_HOST}/github-production-release-asset/2` },
      sha256: sha256OfBytes(bytes()),
    });
    const provenanceLines = lines.filter((l) => l.startsWith("[voice-pack] provenance"));
    assert.equal(provenanceLines.length, 2);
    assert.ok(provenanceLines[0].includes(sha256OfBytes(bytes())));
    assert.ok(!lines.join("\n").includes("X-Amz-Signature"));
    assert.ok(!JSON.stringify(report).includes("X-Amz-Signature"));
  });

  test("V3 an off-allowlist intermediate hop is refused before it is requested", async () => {
    const { calls, result } = run([
      { url: TARBALL_ON_GITHUB, status: 302, location: "https://evil.example.com/hop" },
      { url: "https://evil.example.com/hop", status: 302, location: TARBALL_ASSET },
      { url: TARBALL_ASSET, body: bytes() },
    ]);
    await assert.rejects(result, /evil\.example\.com/);
    assert.equal(callsTo(calls, "https://evil.example.com"), 0, "the refused hop must never be requested");
    noPackDir();
  });

  test("V4 a non-https hop is refused with zero requests to it", async () => {
    const { calls, result } = run([
      { url: TARBALL_ON_GITHUB, status: 302, location: "http://release-assets.githubusercontent.com/x" },
      { url: "http://release-assets.githubusercontent.com/x", body: bytes() },
    ]);
    await assert.rejects(result, /https/i);
    assert.equal(callsTo(calls, "http://"), 0);
    noPackDir();
  });

  test("V5 at most five redirects are followed (six requests)", async () => {
    const { calls, result } = run([
      { url: TARBALL_ON_GITHUB, status: 302, location: "https://github.com/loop/next" },
      { url: "https://github.com/loop/next", status: 302, location: "./next" },
    ]);
    await assert.rejects(result, /too many redirects/i);
    assert.equal(calls.length, 6);
    noPackDir();
  });

  test("V6 a redirect with no Location, or a malformed one, is refused under the failure prefix", async () => {
    const missing = run([{ url: TARBALL_ON_GITHUB, status: 302 }]);
    await assert.rejects(missing.result, /^Error: download failed: .*Location/);
    unstubFetch();
    const malformed = run([{ url: TARBALL_ON_GITHUB, status: 302, location: "https://[::1" }]);
    await assert.rejects(malformed.result, (err: Error) => {
      assert.match(err.message, /^download failed: /);
      assert.ok(!err.message.includes("[::1"), "hop text must not be echoed");
      return true;
    });
    noPackDir();
  });

  test("V7 a hop with an explicit port or userinfo is refused with zero requests to it", async () => {
    const port = run([
      { url: TARBALL_ON_GITHUB, status: 302, location: "https://github.com:8443/x" },
      { url: "https://github.com:8443/x", body: bytes() },
    ]);
    await assert.rejects(port.result, /port/i);
    assert.equal(callsTo(port.calls, "https://github.com:8443"), 0);
    unstubFetch();
    const userinfo = run([
      { url: TARBALL_ON_GITHUB, status: 302, location: "https://u:p@github.com/x" },
      { url: /github\.com\/x$/, body: bytes() },
    ]);
    await assert.rejects(userinfo.result, (err: Error) => {
      assert.ok(!err.message.includes("u:p"), "userinfo must not be echoed");
      return true;
    });
    assert.equal(userinfo.calls.filter((c) => /github\.com\/x$/.test(c.url)).length, 0);
    noPackDir();
  });

  test("V8 a checksum mismatch after an accepted chain still aborts before extract", async () => {
    const { result } = run(observedChain("0".repeat(64)));
    await assert.rejects(result, /sha256/i);
    assert.equal(fixture.spawnCount(), 0, "tar must never run");
    noPackDir();
  });

  test("V9 a fetch that follows redirects itself despite manual mode is refused", async () => {
    const { result } = run([
      { url: CHECKSUM_ON_GITHUB, body: checksumBody() },
      { url: TARBALL_ON_GITHUB, status: 302, location: "https://evil.example.com/hop" },
      { url: "https://evil.example.com/hop", status: 302, location: "https://objects.githubusercontent.com/pack" },
      { url: "https://objects.githubusercontent.com/pack", body: bytes() },
    ], { ignoreManual: true });
    await assert.rejects(result, /followed a redirect itself/);
    noPackDir();
  });

  test("V10 an opaque redirect (status 0) is refused", async () => {
    const { result } = run([{ url: TARBALL_ON_GITHUB, status: 0, type: "opaqueredirect" }]);
    await assert.rejects(result, /manual redirects are not supported/);
    noPackDir();
  });

  test("V11 a signed asset URL never reaches an error, a progress event or the log", async () => {
    const secret = `${ASSET_HOST}/github-production-release-asset/1?X-Amz-Signature=SIGSECRET`;
    const tarball = run([
      { url: TARBALL_ON_GITHUB, status: 302, location: secret },
      { url: secret, status: 403 },
    ]);
    await assert.rejects(tarball.result, (err: Error) => {
      assert.match(err.message, /^download failed: HTTP 403 for https:\/\/github\.com\/.*failsafe-voice-pack-5\.2\.0\.tar\.gz$/);
      return true;
    });
    const leakedTarball = JSON.stringify(tarball.events) + tarball.lines.join("\n");
    assert.ok(!/X-Amz-Signature|SIGSECRET/.test(leakedTarball));
    unstubFetch();
    const checksumSecret = `${ASSET_HOST}/github-production-release-asset/2?X-Amz-Signature=SIGSECRET`;
    const checksum = run([
      { url: CHECKSUM_ON_GITHUB, status: 302, location: checksumSecret },
      { url: TARBALL_ON_GITHUB, body: bytes() },
      { url: checksumSecret, status: 403 },
    ]);
    await assert.rejects(checksum.result, (err: Error) => {
      assert.match(err.message, /^checksum fetch failed: /);
      assert.ok(!/X-Amz-Signature|SIGSECRET/.test(err.message));
      return true;
    });
    const errorEvent = checksum.events.find((e) => e.status === "error");
    assert.equal(errorEvent?.phase, "verify");
    assert.ok(!/X-Amz-Signature|SIGSECRET/.test(JSON.stringify(checksum.events) + checksum.lines.join("\n")));
  });

  test("V12 a response with an empty URL is refused", async () => {
    const { result } = run([{ url: TARBALL_ON_GITHUB, body: bytes(), finalUrl: "" }]);
    await assert.rejects(result, /followed a redirect itself/);
    noPackDir();
  });

  test("V13 the error phase follows the failure prefix, never hostname text", async () => {
    const { events, result } = run([
      { url: TARBALL_ON_GITHUB, status: 302, location: "https://sha256.evil.example/pack" },
    ]);
    await assert.rejects(result, /^Error: download failed: .*sha256\.evil\.example/);
    assert.equal(events.find((e) => e.status === "error")?.phase, "download");
  });

  test("V14 a network error carries its code, never a URL", async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND github.com"), { code: "ENOTFOUND" });
    const { result } = run([
      { url: TARBALL_ON_GITHUB, throws: new TypeError("fetch failed", { cause }) },
    ]);
    await assert.rejects(result, (err: Error) => {
      assert.match(err.message, /^download failed: network error \(ENOTFOUND\) for https:\/\/github\.com\//);
      assert.ok(!err.message.includes("getaddrinfo"));
      return true;
    });
  });
});
