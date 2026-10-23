import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AudioVaultService, isCanonicalAudioId } from "../../roadmap/services/AudioVaultService";

suite("AudioVaultService security boundary (#465)", () => {
  let workspaceRoot: string;
  let vault: AudioVaultService;

  setup(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-audio-boundary-"));
    vault = new AudioVaultService(workspaceRoot);
    await vault.init();
  });
  teardown(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  test("canonical identifiers only, including missing valid audio", async () => {
    for (const id of ["../file", "%2f", "A".repeat(64), "a".repeat(63),
      "a".repeat(65), "a".repeat(64) + "/other", "\u0000", ""]) {
      assert.equal(isCanonicalAudioId(id), false, JSON.stringify(id));
      assert.equal(await vault.getAudio(id), null, JSON.stringify(id));
    }
    assert.equal(isCanonicalAudioId("b".repeat(64)), true);
    assert.equal(await vault.getAudio("b".repeat(64)), null);
  });

  test("read refuses symlinked assets and keeps the external file unchanged", async () => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-audio-external-"));
    try {
      const external = path.join(externalDir, "private.webm");
      fs.writeFileSync(external, "private contents");
      const linked = path.join(workspaceRoot, ".failsafe", "audio", `${"c".repeat(64)}.webm`);
      try {
        fs.symlinkSync(external, linked, "file");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") return;
        throw error;
      }
      assert.equal(await vault.getAudio("c".repeat(64)), null);
      assert.equal(fs.readFileSync(external, "utf8"), "private contents");
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  });

  test("init rejects a linked .failsafe directory before creating audio outside", async () => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-audio-target-"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-audio-linked-root-"));
    try {
      try {
        fs.symlinkSync(externalDir, path.join(root, ".failsafe"), "dir");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") return;
        throw error;
      }
      await assert.rejects(() => new AudioVaultService(root).init());
      assert.equal(fs.existsSync(path.join(externalDir, "audio")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  });

  test("partially failed sidecar publication rolls back audio and metadata (#465)", async () => {
    const io = fs.promises as unknown as { open: typeof fs.promises.open };
    const originalOpen = io.open;
    let injected = false;
    io.open = (async (filePath: any, flags: any, mode?: any) => {
      const handle = await originalOpen(filePath, flags, mode);
      if (String(filePath).endsWith(".json") && flags === "wx") {
        injected = true;
        const originalWrite = handle.writeFile.bind(handle);
        handle.writeFile = (async () => {
          await originalWrite("{partial", "utf8");
          throw new Error("SIMULATED_SIDECAR_IO_FAILURE");
        }) as typeof handle.writeFile;
      }
      return handle;
    }) as typeof io.open;
    try {
      await assert.rejects(
        () => vault.storeAudio(Buffer.from("captured speech")),
        /SIMULATED_SIDECAR_IO_FAILURE/,
      );
      assert.equal(injected, true, "the sidecar failure was actually exercised");
      assert.deepEqual(fs.readdirSync(path.join(workspaceRoot, ".failsafe", "audio")), []);
    } finally {
      io.open = originalOpen;
    }
  });

  test("per-capture size limit rejects before creating any files", async () => {
    await assert.rejects(
      () => vault.storeAudio(Buffer.alloc(50 * 1024 * 1024 + 1)),
      /AUDIO_VAULT_CAPTURE_TOO_LARGE/,
    );
    assert.deepEqual(fs.readdirSync(path.join(workspaceRoot, ".failsafe", "audio")), []);
  });
});
