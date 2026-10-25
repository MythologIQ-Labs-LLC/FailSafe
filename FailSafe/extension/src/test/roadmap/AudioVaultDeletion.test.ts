import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AudioVaultService } from "../../roadmap/services/AudioVaultService";

suite("Audio Vault list and deletion boundary (#465)", () => {
  let root: string;
  let vault: AudioVaultService;
  let directory: string;
  setup(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-vault-delete-"));
    vault = new AudioVaultService(root);
    await vault.init();
    directory = path.join(root, ".failsafe", "audio");
  });
  teardown(() => fs.rmSync(root, { recursive: true, force: true }));

  test("listing reveals only vault audio, deletion removes audio and sidecar", async () => {
    const id = await vault.storeAudio(Buffer.from("persisted private audio"));
    const entries = await vault.listAudio();
    assert.deepEqual(entries.map(x => x.id), [id]);
    assert.equal(entries[0].bytes, Buffer.byteLength("persisted private audio"));
    const state = await vault.inspectDeletion(id);
    assert.ok(state, "valid audio+metadata are available for confirmation");
    assert.equal(await vault.deleteAudio(state), "deleted");
    assert.deepEqual(await vault.listAudio(), []);
    assert.equal(fs.existsSync(path.join(directory, `${id}.webm`)), false);
    assert.equal(fs.existsSync(path.join(directory, `${id}.json`)), false);
  });

  test("reject traversal, invalid ids and absent recordings without mutation", async () => {
    await vault.storeAudio(Buffer.from("keep"));
    const initial = fs.readdirSync(directory).sort();
    for (const id of ["../outside", "%2f", "A".repeat(64), "", "a".repeat(63)]) {
      assert.equal(await vault.inspectDeletion(id), null);
    }
    assert.equal(await vault.inspectDeletion("c".repeat(64)), null);
    assert.deepEqual(fs.readdirSync(directory).sort(), initial);
  });

  test("recording replaced after approval preview fails closed", async () => {
    const id = await vault.storeAudio(Buffer.from("first"));
    const snapshot = await vault.inspectDeletion(id);
    assert.ok(snapshot);
    const file = path.join(directory, `${id}.webm`);
    fs.unlinkSync(file);
    fs.writeFileSync(file, "replacement has different identity");
    assert.equal(await vault.deleteAudio(snapshot), "stale");
    assert.equal(fs.readFileSync(file, "utf8"), "replacement has different identity");
  });

  test("same-size in-place audio changes invalidate an earlier deletion preview", async () => {
    const id = await vault.storeAudio(Buffer.from("before"));
    const preview = await vault.inspectDeletion(id);
    assert.ok(preview);
    const file = path.join(directory, `${id}.webm`);
    await new Promise(resolve => setTimeout(resolve, 20));
    fs.writeFileSync(file, "after!");
    assert.equal(await vault.deleteAudio(preview), "stale");
    assert.equal(fs.readFileSync(file, "utf8"), "after!");
  });

  test("linked recording is omitted and cannot be deleted", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-audio-not-owned-"));
    try {
      const external = path.join(outside, "private.webm");
      fs.writeFileSync(external, "private");
      const linked = path.join(directory, `${"d".repeat(64)}.webm`);
      try { fs.symlinkSync(external, linked, "file"); }
      catch (error) {
        if (["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code || "")) return;
        throw error;
      }
      assert.equal(await vault.inspectDeletion("d".repeat(64)), null);
      assert.deepEqual(await vault.listAudio(), []);
      assert.equal(fs.readFileSync(external, "utf8"), "private");
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  });

  test("linked sidecar blocks deletion of otherwise valid audio", async () => {
    const id = await vault.storeAudio(Buffer.from("private"));
    const sidecar = path.join(directory, `${id}.json`);
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-metadata-out-"));
    try {
      const target = path.join(elsewhere, "private.json");
      fs.writeFileSync(target, "{\"private\":true}");
      fs.unlinkSync(sidecar);
      try { fs.symlinkSync(target, sidecar, "file"); }
      catch (error) {
        if (["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code || "")) return;
        throw error;
      }
      assert.equal(await vault.inspectDeletion(id), null);
      assert.equal(fs.readFileSync(path.join(directory, `${id}.webm`), "utf8"), "private");
      assert.equal(fs.readFileSync(target, "utf8"), "{\"private\":true}");
    } finally { fs.rmSync(elsewhere, { recursive: true, force: true }); }
  });

  test("sidecar unlink failure reports partial, never falsely reports success", async () => {
    const id = await vault.storeAudio(Buffer.from("private"));
    const snapshot = await vault.inspectDeletion(id);
    assert.ok(snapshot);
    const original = fs.promises.unlink;
    fs.promises.unlink = (async (file: any) => {
      if (String(file).endsWith(".json")) throw Object.assign(new Error("read-only metadata"), { code: "EACCES" });
      return original(file);
    }) as typeof fs.promises.unlink;
    try { assert.equal(await vault.deleteAudio(snapshot), "partial"); }
    finally { fs.promises.unlink = original; }
    assert.equal(fs.existsSync(path.join(directory, `${id}.webm`)), false);
    assert.equal(fs.existsSync(path.join(directory, `${id}.json`)), true);
  });
});
