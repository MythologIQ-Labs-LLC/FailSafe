/** File primitives for AudioVaultService (#465): the capture lock and capture rollback. */
import * as fs from "fs";

/** An existing lock is another writer: report busy, never wait on or remove it. */
export async function openCaptureLock(lockPath: string): Promise<fs.promises.FileHandle> {
  try {
    return await fs.promises.open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("AUDIO_VAULT_WRITE_BUSY");
    throw error;
  }
}

async function attemptCleanup(errors: unknown[], step: () => Promise<void>): Promise<void> {
  try { await step(); } catch (error) { errors.push(error); }
}

/** Undo a failed capture: close the sidecar, remove what this writer created, then the audio. */
export async function rollbackCapture(
  failure: unknown, file: fs.promises.FileHandle | undefined, createdSidecar: string | undefined, audio: string,
): Promise<never> {
  const errors: unknown[] = [failure];
  const handle = file;
  if (handle) await attemptCleanup(errors, () => handle.close());
  if (createdSidecar) await attemptCleanup(errors, () => fs.promises.unlink(createdSidecar));
  await attemptCleanup(errors, () => fs.promises.unlink(audio));
  if (errors.length > 1) throw new AggregateError(errors, "AUDIO_VAULT_ROLLBACK_INCOMPLETE");
  throw failure;
}
