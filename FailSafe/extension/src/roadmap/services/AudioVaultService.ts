import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const AUDIO_ID = /^[0-9a-f]{64}$/;
const MAX_CAPTURE_BYTES = 50 * 1024 * 1024;
const DEFAULT_VAULT_QUOTA_BYTES = 256 * 1024 * 1024;
const VAULT_WRITE_LOCK = ".capture-write.lock";
const MAX_VAULT_ENTRIES = 10_000;

export function isCanonicalAudioId(value: unknown): value is string {
  return typeof value === "string" && AUDIO_ID.test(value);
}

export class AudioVaultService {
  private readonly workspaceRoot: string;
  private readonly vaultPath: string;
  private readonly maxVaultBytes: number;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(workspaceRoot: string, maxVaultBytes = DEFAULT_VAULT_QUOTA_BYTES) {
    if (!Number.isSafeInteger(maxVaultBytes) || maxVaultBytes < 1) {
      throw new RangeError("AUDIO_VAULT_INVALID_QUOTA");
    }
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.vaultPath = path.join(this.workspaceRoot, ".failsafe", "audio");
    this.maxVaultBytes = maxVaultBytes;
  }

  private async trustedVault(): Promise<string> {
    const metadataDir = path.join(this.workspaceRoot, ".failsafe");
    for (const directory of [metadataDir, this.vaultPath]) {
      const stat = await fs.promises.lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error("AUDIO_VAULT_UNTRUSTED_DIRECTORY");
      }
    }
    const workspace = await fs.promises.realpath(this.workspaceRoot);
    const actual = await fs.promises.realpath(this.vaultPath);
    const relative = path.relative(workspace, actual);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("AUDIO_VAULT_OUTSIDE_WORKSPACE");
    }
    return actual;
  }

  async init(): Promise<void> {
    const metadataDir = path.join(this.workspaceRoot, ".failsafe");
    await fs.promises.mkdir(metadataDir, { recursive: true });
    const metadata = await fs.promises.lstat(metadataDir);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("AUDIO_VAULT_UNTRUSTED_DIRECTORY");
    }
    await fs.promises.mkdir(this.vaultPath, { recursive: true });
    await this.trustedVault();
  }

  /**
   * Count everything stored in the private vault, including sidecars, orphans
   * and unknown regular files. Never silently undercount a link or unreadable
   * directory entry. The lock is excluded because this operation owns it.
   */
  private async assertWithinQuota(root: string, upcomingBytes: number): Promise<void> {
    let total = 0;
    let entries = 0;
    const directory = await fs.promises.opendir(root);
    for await (const entry of directory) {
      if (++entries > MAX_VAULT_ENTRIES) throw new Error("AUDIO_VAULT_TOO_MANY_ENTRIES");
      if (entry.name === VAULT_WRITE_LOCK) continue;
      const stat = await fs.promises.lstat(path.join(root, entry.name));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error("AUDIO_VAULT_UNTRUSTED_CONTENT");
      }
      total += stat.size;
      if (total > this.maxVaultBytes) throw new Error("AUDIO_VAULT_QUOTA_EXCEEDED");
    }
    if (total + upcomingBytes > this.maxVaultBytes) throw new Error("AUDIO_VAULT_QUOTA_EXCEEDED");
  }

  /** Serialize captures here, then take a cross-process exclusive create lock. */
  private async captureExclusive<T>(root: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.writeTail;
    let release!: () => void;
    this.writeTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const lockPath = path.join(root, VAULT_WRITE_LOCK);
    let lock: fs.promises.FileHandle | undefined;
    try {
      try {
        lock = await fs.promises.open(lockPath, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error("AUDIO_VAULT_WRITE_BUSY");
        }
        throw error;
      }
      const owned = await lock.stat();
      try {
        return await operation();
      } finally {
        await lock.close();
        const actual = await fs.promises.lstat(lockPath);
        if (!actual.isFile() || actual.isSymbolicLink() ||
            actual.dev !== owned.dev || actual.ino !== owned.ino) {
          throw new Error("AUDIO_VAULT_WRITE_LOCK_CHANGED");
        }
        await fs.promises.unlink(lockPath);
      }
    } finally {
      release();
    }
  }

  async storeAudio(audioData: Buffer, transcript: string = ""): Promise<string> {
    if (audioData.length > MAX_CAPTURE_BYTES) {
      throw new RangeError("AUDIO_VAULT_CAPTURE_TOO_LARGE");
    }
    const root = await this.trustedVault();
    const hash = crypto.createHash("sha256").update(audioData)
      .update(Date.now().toString()).update(crypto.randomBytes(16)).digest("hex");
    const webmPath = path.join(root, `${hash}.webm`);
    const sidecarPath = path.join(root, `${hash}.json`);
    const metadata = {
      id: hash, timestamp: new Date().toISOString(), transcriptSnippet: transcript.slice(0, 100),
    };
    const json = JSON.stringify(metadata, null, 2);
    return this.captureExclusive(root, async () => {
      await this.trustedVault();
      await this.assertWithinQuota(root, audioData.length + Buffer.byteLength(json, "utf8"));
      // Exclusive creation refuses collisions and planted symlinks.
      await fs.promises.writeFile(webmPath, audioData, { flag: "wx", mode: 0o600 });
      await this.writeSidecarOrRollback(sidecarPath, webmPath, json);
      return hash;
    });
  }

  /** A partially written sidecar must never remain as apparent evidence. */
  private async writeSidecarOrRollback(sidecar: string, audio: string, contents: string): Promise<void> {
    let file: fs.promises.FileHandle | undefined;
    let created = false;
    try {
      file = await fs.promises.open(sidecar, "wx", 0o600);
      created = true;
      await file.writeFile(contents, "utf8");
      await file.close();
      file = undefined;
    } catch (failure) {
      const errors: unknown[] = [failure];
      if (file) try { await file.close(); } catch (e) { errors.push(e); }
      // Never unlink a pre-existing sidecar on EEXIST; we did not create it.
      if (created) try { await fs.promises.unlink(sidecar); } catch (e) { errors.push(e); }
      try { await fs.promises.unlink(audio); } catch (e) { errors.push(e); }
      if (errors.length > 1) throw new AggregateError(errors, "AUDIO_VAULT_ROLLBACK_INCOMPLETE");
      throw failure;
    }
  }

  /**
   * Only the first 100 regular recordings are returned. The listing exposes no
   * transcript, sidecar contents or links to files outside the audio vault.
   */
  async listAudio(): Promise<Array<{ id: string; bytes: number; modifiedAt: string }>> {
    const root = await this.trustedVault();
    const result: Array<{ id: string; bytes: number; modifiedAt: string }> = [];
    const directory = await fs.promises.opendir(root);
    for await (const entry of directory) {
      if (result.length >= 100) break;
      if (!entry.isFile() || !/^[0-9a-f]{64}\.webm$/.test(entry.name)) continue;
      try {
        const stat = await fs.promises.lstat(path.join(root, entry.name));
        if (stat.isSymbolicLink() || !stat.isFile()) continue;
        result.push({ id: entry.name.slice(0, 64), bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
      } catch { /* removed concurrently: don't expose */ }
    }
    return result.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  /**
   * Snapshot the two files before a destructive approval. Never trust metadata
   * from an HTTP request to decide which path is safe to delete.
   */
  async inspectDeletion(id: string): Promise<{ id: string; bytes: number; audioDev: number; audioIno: number; audioMtimeMs: number; audioCtimeMs: number; sidecarDev: number | null; sidecarIno: number | null; sidecarMtimeMs: number | null } | null> {
    if (!isCanonicalAudioId(id)) return null;
    const root = await this.trustedVault();
    const audio = await fs.promises.lstat(path.join(root, `${id}.webm`)).catch(() => null);
    if (!audio || !audio.isFile() || audio.isSymbolicLink()) return null;
    const sidecar = await fs.promises.lstat(path.join(root, `${id}.json`)).catch(() => null);
    if (sidecar && (!sidecar.isFile() || sidecar.isSymbolicLink())) return null;
    return { id, bytes: audio.size, audioDev: audio.dev, audioIno: audio.ino,
      audioMtimeMs: audio.mtimeMs, audioCtimeMs: audio.ctimeMs,
      sidecarDev: sidecar?.dev ?? null, sidecarIno: sidecar?.ino ?? null,
      sidecarMtimeMs: sidecar?.mtimeMs ?? null };
  }

  /** Delete an explicitly approved, unchanged capture; audio is removed first. */
  async deleteAudio(expected: NonNullable<Awaited<ReturnType<AudioVaultService["inspectDeletion"]>>>): Promise<"deleted" | "stale" | "partial"> {
    const actual = await this.inspectDeletion(expected.id);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) return "stale";
    const root = await this.trustedVault();
    // A second lstat narrows the mutation window. Full race-free pathname
    // unlink needs OS-level directory handles and remains host qualification.
    const latest = await this.inspectDeletion(expected.id);
    if (!latest || JSON.stringify(latest) !== JSON.stringify(expected)) return "stale";
    const audio = path.join(root, `${expected.id}.webm`);
    const metadata = path.join(root, `${expected.id}.json`);
    await fs.promises.unlink(audio);
    try {
      if (expected.sidecarDev !== null) await fs.promises.unlink(metadata);
    } catch {
      // Audio is gone but its sidecar remains: explicit failure, not success.
      return "partial";
    }
    return "deleted";
  }

  async getAudio(hash: string): Promise<Buffer | null> {
    // Check before constructing any caller-controlled filename.
    if (!isCanonicalAudioId(hash)) return null;
    try {
      const root = await this.trustedVault();
      const audioPath = path.join(root, `${hash}.webm`);
      const before = await fs.promises.lstat(audioPath);
      if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_CAPTURE_BYTES) return null;
      const fd = await fs.promises.open(audioPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await fd.stat();
        if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) return null;
        return await fd.readFile();
      } finally {
        await fd.close();
      }
    } catch {
      return null;
    }
  }
}
