/**
 * privateNode — a Node executable the trusted resolver accepts on this host
 * (v6.0.8 integration LD23). On macOS and Linux the resolver refuses files
 * whose folders other users can write, and a GitHub-hosted runner's tool cache
 * (where setup-node puts node) is writable by every user. So on POSIX this
 * copies nodeSource() into `<base>/tnode/node` (mode 0o755) and returns the
 * copy; on win32 it returns nodeSource(). The caller removes `base`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * LD23d: the node to copy. Under plain node it is process.execPath. In the VS
 * Code extension host process.execPath is VS Code's Electron binary, which does
 * not start once copied away from its resource files, so the real node on PATH
 * is asked for its own path.
 */
function nodeSource() {
  if (!process.versions.electron) return process.execPath;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync('node', ['-p', 'process.execPath'], { encoding: 'utf8', env, windowsHide: true });
  const found = (r.stdout || '').trim();
  if (r.status !== 0 || !path.isAbsolute(found)) {
    throw new Error(`privateNode: no node on PATH to copy under Electron (status ${r.status}, ${r.error || r.stderr || 'no output'})`);
  }
  return found;
}

function privateNode(base) {
  if (process.platform === 'win32') return nodeSource();
  const dir = path.join(base, 'tnode');
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o755);
  const node = path.join(dir, 'node');
  fs.copyFileSync(nodeSource(), node);
  fs.chmodSync(node, 0o755);
  return node;
}

module.exports = { privateNode, nodeSource };
