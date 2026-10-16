/**
 * failsafe.bootstrap.autoInstallGit is the user's choice only (v6.0.8 lane A,
 * B214, plan T10a and T10b).
 *
 * Runs standalone after `npm run compile`: node --test src/test/shared/exec/autoInstallGitScope.test.cjs
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '..', '..', '..', '..');
const OUT = path.join(EXT, 'out');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

test('T10a: the setting declares machine scope', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXT, 'package.json'), 'utf8'));
  const props = Object.assign({}, ...[].concat(pkg.contributes.configuration).map((c) => c.properties || {}));
  const s = props['failsafe.bootstrap.autoInstallGit'];
  assert.ok(s, 'the setting exists');
  assert.equal(s.scope, 'machine');
});

test('T10b: autoInstallGitEnabled is true only for a user-level true', () => {
  const { autoInstallGitEnabled } = require(path.join(OUT, 'shared', 'gitBootstrap.js'));
  assert.equal(typeof autoInstallGitEnabled, 'function', 'the helper exists');
  assert.equal(autoInstallGitEnabled({ workspaceValue: true }), false);
  assert.equal(autoInstallGitEnabled({ workspaceFolderValue: true }), false);
  assert.equal(autoInstallGitEnabled({ globalValue: false, workspaceValue: true }), false);
  assert.equal(autoInstallGitEnabled(undefined), false);
  assert.equal(autoInstallGitEnabled({ defaultValue: true }), false);
  assert.equal(autoInstallGitEnabled({ globalValue: true }), true);
});

test('T10b source: bootstrapCore reads the setting through inspect and the helper, never through .get', () => {
  const src = stripComments(fs.readFileSync(path.join(EXT, 'src', 'extension', 'bootstrapCore.ts'), 'utf8'));
  assert.match(src, /autoInstallGitEnabled\(\s*vscode\.workspace\s*\.getConfiguration\("failsafe"\)\s*\.inspect<boolean>\("bootstrap\.autoInstallGit"\)\s*,?\s*\)/);
  assert.doesNotMatch(src, /\.get<boolean>\("bootstrap\.autoInstallGit"/);
});
