import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const AUDIO_ID = /^[0-9a-f]{64}$/;
const MAX_CAPTURE_BYTES = 50 * 1024 * 1024;

export function isCanonicalAudioId(value: unknown): value is string {
  return typeof value === "string" && AUDIO_ID.test(value);
}

export class AudioVaultService {
  private readonly workspaceRoot: string;
  private readonly vaultPath: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.vaultPath = path.join(this.workspaceRoot, ".failsafe", "audio");
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
    // wx refuses a pre-existing file or attacker-planted symlink.
    await fs.promises.writeFile(webmPath, audioData, { flag: "wx" });
    try {
      await fs.promises.writeFile(sidecarPath, JSON.stringify(metadata, null, 2), { encoding: "utf8", flag: "wx" });
    } catch (error) {
      await fs.promises.unlink(webmPath).catch(() => undefined);
      throw error;
    }
    return hash;
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
