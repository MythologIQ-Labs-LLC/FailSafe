import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AudioVaultService } from "../../roadmap/services/AudioVaultService";

suite("Audio-vault aggregate quota and writer coordination (#465)", () => {
  let root: string;
  let directory: string;
  let vault: AudioVaultService;

  setup(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-audio-quota-"));
    directory = path.join(root, ".failsafe", "audio");
    vault = new AudioVaultService(root);
    await vault.init();
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  const files = (directory: string) => fs.readdirSync(directory).sort();
  const bytesUsed = (directory: string) => files(directory).reduce((sum, name) =>
    sum + fs.lstatSync(path.join(directory, name)).size, 0);

  test("counts audio, sidecar and existing files; refuses quota without writing anything", async () => {
    const keep = await vault.storeAudio(Buffer.from("first"));
    const before = files(directory);
    const currentUsage = bytesUsed(directory);
    const limited = new AudioVaultService(root, currentUsage + 4);
    await assert.rejects(
      () => limited.storeAudio(Buffer.from("another file cannot fit")),
      /AUDIO_VAULT_QUOTA_EXCEEDED/,
    );
    assert.deepEqual(files(directory), before, "quota failure must leave existing files untouched");
    assert.equal((await limited.getAudio(keep))?.toString(), "first");
  });

  test("a single capture cannot exceed an aggregate quota even if vault was empty", async () => {
    const tiny = new AudioVaultService(root, 32);
    await assert.rejects(
      () => tiny.storeAudio(Buffer.from("raw")),
      /AUDIO_VAULT_QUOTA_EXCEEDED/,
    );
    assert.deepEqual(files(directory), []);
  });

  test("same-service concurrent captures are serialized across quota admission", async () => {
    const small = new AudioVaultService(root, 600);
    const responses = await Promise.allSettled([
      small.storeAudio(Buffer.alloc(200, 65)),
      small.storeAudio(Buffer.alloc(200, 66)),
    ]);
    assert.equal(responses.filter(x => x.status === "fulfilled").length, 1);
    const refused = responses.filter(x => x.status === "rejected");
    assert.equal(refused.length, 1);
    assert.match(String((refused[0] as PromiseRejectedResult).reason), /AUDIO_VAULT_QUOTA_EXCEEDED/);
    assert.ok(bytesUsed(directory) <= 600);
    assert.equal(files(directory).length, 2, "one audio file and one metadata file only");
  });

  test("cross-service lock refuses a second writer without removing another lock", async () => {
    const lockPath = path.join(directory, ".capture-write.lock");
    fs.writeFileSync(lockPath, "another writer");
    const snapshot = files(directory);
    await assert.rejects(() => vault.storeAudio(Buffer.from("speech")), /AUDIO_VAULT_WRITE_BUSY/);
    assert.deepEqual(files(directory), snapshot);
    assert.equal(fs.readFileSync(lockPath, "utf8"), "another writer");
  });

  test("unexpected linked content is a fail-closed quota decision", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-external-audio-"));
    try {
      const file = path.join(outside, "private");
      fs.writeFileSync(file, "private");
      try { fs.symlinkSync(file, path.join(directory, "suspicious.webm"), "file"); }
      catch (error) {
        if (["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
        throw error;
      }
      await assert.rejects(() => vault.storeAudio(Buffer.from("speech")), /AUDIO_VAULT_UNTRUSTED_CONTENT/);
      assert.equal(fs.readFileSync(file, "utf8"), "private");
      assert.deepEqual(files(directory), ["suspicious.webm"]);
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  });

  test("invalid quota configuration is rejected before any file operation", () => {
    for (const value of [0, -1, Infinity, 1.5, Number.NaN]) {
      assert.throws(() => new AudioVaultService(root, value), /AUDIO_VAULT_INVALID_QUOTA/);
    }
  });
});
