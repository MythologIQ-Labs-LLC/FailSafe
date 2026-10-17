/**
 * Containment for the replay-nonce store folder (plan-v608-integration LD11).
 *
 * The store lives at `<root>/.failsafe/security`. A repository can commit
 * `.failsafe` or `.failsafe/security` as a link, which would send nonces.json,
 * its lock, temp and queue files and the consumption markers to a folder
 * outside the workspace. This walks `.failsafe` then `.failsafe/security` the
 * way the risk store's checkRiskDir walks `.failsafe/risks`: each part is made
 * only if it is absent (one level at a time), and its real path must equal the
 * root's real path joined with that part.
 *
 * Unlike checkRiskDir, transient filesystem codes are busy, not unsafe, so a
 * passing EBUSY or EPERM refuses one call and never disables the guard.
 */
import * as fs from "fs";
import * as path from "path";
import { NonceMarkerDirError } from "./nonceMarkers";
import { codeOf, NonceStoreBusyError, TRANSIENT } from "./nonceStore";

const CASE_FOLDING = process.platform === "win32" || process.platform === "darwin";
const PARTS = [".failsafe", "security"];

function samePath(a: string, b: string): boolean {
  return CASE_FOLDING ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function refusal(error: unknown, dir: string): Error {
  return TRANSIENT.has(codeOf(error))
    ? new NonceStoreBusyError("STORE_DIR_BUSY", `The nonce store folder could not be checked just now (${codeOf(error)}).`)
    : new NonceMarkerDirError(dir);
}

/**
 * True when `storeDir` (`<root>/.failsafe/security`) is a real folder inside
 * the root; false when a part is absent and `create` is false. Throws
 * NonceMarkerDirError for a link, a non-folder or a folder that resolves
 * elsewhere, and NonceStoreBusyError for a transient error.
 */
export function checkNonceStoreDir(storeDir: string, create: boolean): boolean {
  const root = path.dirname(path.dirname(storeDir));
  let rootReal: string;
  try { rootReal = fs.realpathSync.native(root); } catch (error) { throw refusal(error, root); }
  let rel = "";
  for (const part of PARTS) {
    rel = path.join(rel, part);
    const dir = path.join(root, rel);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(dir);
    } catch (error) {
      if (codeOf(error) !== "ENOENT") throw refusal(error, dir);
      if (!create) return false;
      try { fs.mkdirSync(dir); } catch (e) { if (codeOf(e) !== "EEXIST") throw refusal(e, dir); }
      try { st = fs.lstatSync(dir); } catch (e) { throw refusal(e, dir); }
    }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new NonceMarkerDirError(dir);
    let real: string;
    try { real = fs.realpathSync.native(dir); } catch (error) { throw refusal(error, dir); }
    if (!samePath(real, path.join(rootReal, rel))) throw new NonceMarkerDirError(dir);
  }
  return true;
}
