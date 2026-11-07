/**
 * removeTempTree — delete a test's temp folder without ever following a link
 * (v6.0.8 integration LD20). Some suites link a fixture folder to a real
 * install (Node, Python); every link is unlinked as a link first, then the
 * folder is deleted. A missing folder is not an error.
 *
 * Windows: read-only files (git writes its objects read-only) are made writable
 * before the delete. Node 24.21+ (Electron 43, VS Code 1.141 and later) makes
 * `rmSync({ recursive, force })` fail with EPERM on a read-only file on win32,
 * where Node 22 removed it; every temp-repository teardown then failed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function unlinkLinks(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const name of names) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) fs.unlinkSync(p);
    else if (st.isDirectory()) unlinkLinks(p);
    // nlink 1 only: a hard link shares its mode with a file outside the tree.
    else if (process.platform === 'win32' && st.isFile() && st.nlink === 1 && (st.mode & 0o200) === 0) fs.chmodSync(p, 0o666);
  }
}

function removeTempTree(dir) {
  let st;
  try { st = fs.lstatSync(dir); } catch { return; }
  if (st.isSymbolicLink()) { fs.unlinkSync(dir); return; }
  unlinkLinks(dir);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}

module.exports = { removeTempTree };
