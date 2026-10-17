// LD23d: privateNode() copies nodeSource() into a folder of its own, so the
// source must be a node that still runs once copied away from its folder, also
// inside the VS Code extension host. There process.execPath is VS Code's
// Electron binary: it answers --version like node in place (the host sets
// ELECTRON_RUN_AS_NODE), but a copy without its resource files does not start.
// The row copies the source the way privateNode() does and runs the copy with
// the inherited environment, as install-detector's version probe does.

import { strict as assert } from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { nodeSource } = require('../../../src/test/shared/privateNode.cjs') as { nodeSource: () => string };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

suite('privateNode (LD23d)', () => {
  test('nodeSource is a node that answers --version as node, in place and copied, also in the extension host', () => {
    const source = nodeSource();
    const electron = process.versions.electron ?? 'none';
    const inPlace = spawnSync(source, ['--version'], { encoding: 'utf8', windowsHide: true });
    assert.match(inPlace.stdout || '', /^v\d+\.\d+\.\d+/, `${source} answered ${JSON.stringify(inPlace.stdout)} (electron ${electron})`);
    const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-privnode-')));
    try {
      const copy = path.join(base, path.basename(source));
      fs.copyFileSync(source, copy);
      if (process.platform !== 'win32') fs.chmodSync(copy, 0o755);
      const copied = spawnSync(copy, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      assert.match(copied.stdout || '', /^v\d+\.\d+\.\d+/, `a copy of ${source} answered ${JSON.stringify(copied.stdout)}, status ${copied.status}, error ${copied.error} (electron ${electron})`);
    } finally {
      removeTempTree(base);
    }
  });
});
