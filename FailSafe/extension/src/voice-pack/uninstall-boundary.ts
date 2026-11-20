/** #710: only manifest-owned, known Voice Pack files may be recursively uninstalled.
 * A corrupted/missing browser asset is removable; foreign files and linked
 * directories are never deliberately deleted by this command. Same-user
 * concurrent filesystem mutation is outside this preflight guarantee.
 */
import * as fs from 'fs';
import * as path from 'path';
import { VOICE_ASSETS } from './safe-archive';

const REFUSE = 'voice pack uninstall refused: ';
const EXPECTED = [...VOICE_ASSETS].sort();

function requireOwnedManifest(folder: string): void {
  const name = path.join(folder, 'voice-pack.manifest.json');
  let stat: fs.Stats;
  try { stat = fs.lstatSync(name); }
  catch { throw new Error(REFUSE + 'missing ownership manifest'); }
  if (!stat.isFile() || stat.isSymbolicLink() ||
      stat.size === 0 || stat.size > 64 * 1024) {
    throw new Error(REFUSE + 'invalid ownership manifest');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(name, 'utf8')); }
  catch { throw new Error(REFUSE + 'invalid ownership manifest'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(REFUSE + 'invalid ownership manifest');
  }
  const m = parsed as Record<string, unknown>;
  const hashes = m.sha256;
  if (JSON.stringify(Object.keys(m).sort()) !==
      JSON.stringify(['builtAt', 'expectedFiles', 'sha256', 'version']) ||
      typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version) ||
      typeof m.builtAt !== 'string' || !Array.isArray(m.expectedFiles) ||
      JSON.stringify([...m.expectedFiles].sort()) !== JSON.stringify(EXPECTED) ||
      !hashes || typeof hashes !== 'object' || Array.isArray(hashes) ||
      JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify(EXPECTED) ||
      Object.values(hashes).some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
    throw new Error(REFUSE + 'invalid ownership manifest');
  }
}

function requireKnownEntries(folder: string): void {
  const approved = new Set(['voice-pack.manifest.json', 'piper', 'whisper']);
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!approved.has(entry.name)) throw new Error(REFUSE + 'unrecognized pack entry');
  }
  for (const group of ['piper', 'whisper']) {
    const dir = path.join(folder, group);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(dir); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw e;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(REFUSE + 'linked pack directory');
    }
    const allowed = new Set(VOICE_ASSETS.filter(item => item.startsWith(group + '/'))
      .map(item => path.basename(item)));
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!item.isFile() || item.isSymbolicLink() || !allowed.has(item.name)) {
        throw new Error(REFUSE + 'unrecognized pack entry');
      }
    }
  }
}

/** Validate entire tree before removing anything; do not require intact payload hashes. */
export function assertRemovableVoicePack(folder: string): void {
  requireKnownEntries(folder);
  requireOwnedManifest(folder);
}
