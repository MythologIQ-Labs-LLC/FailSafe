/**
 * privateNode — a Node executable the trusted resolver accepts on this host
 * (v6.0.8 integration LD23). On macOS and Linux the resolver refuses files
 * whose folders other users can write, and a GitHub-hosted runner's tool cache
 * (where setup-node puts node) is writable by every user. So on POSIX this
 * copies process.execPath into `<base>/tnode/node` (mode 0o755) and returns
 * the copy; on win32 it returns process.execPath. The caller removes `base`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function privateNode(base) {
  if (process.platform === 'win32') return process.execPath;
  const dir = path.join(base, 'tnode');
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o755);
  const node = path.join(dir, 'node');
  fs.copyFileSync(process.execPath, node);
  fs.chmodSync(node, 0o755);
  return node;
}

module.exports = { privateNode };
