// #707: shared helpers for the voice-vendor test files.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const extensionRoot = path.join(__dirname, '..', '..', '..');
export const vendorTool = require(path.join(extensionRoot, 'scripts', 'vendor-voice.cjs'));

export function temporary(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-707-voice-'));
  try { run(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
