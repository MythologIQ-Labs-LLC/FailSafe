/**
 * removeTempTree — delete a test's temp folder without ever following a link
 * (v6.0.8 integration LD20). Some suites link a fixture folder to a real
 * install (Node, Python); every link is unlinked as a link first, then the
 * folder is deleted. A missing folder is not an error.
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
