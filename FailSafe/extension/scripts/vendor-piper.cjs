#!/usr/bin/env node
// Backward-compatible explicit Piper re-vendoring entrypoint (#707).
// The pinned package tarball is verified by vendor-voice.cjs; there is no
// dependency on a root node_modules/piper-tts-web installation.
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const result = spawnSync(process.execPath, [path.join(__dirname, 'vendor-voice.cjs'), '--piper-only'], {
  cwd: path.resolve(__dirname, '..'),
  shell: false,
  stdio: 'inherit',
});
if (result.error) {
  console.error('[vendor:piper] unable to launch pinned vendoring: ' + result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status === null ? 1 : result.status;
}
