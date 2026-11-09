// Test-host home guard (#591 follow-up, v6.0.12). Required IN-PROCESS by
// @vscode/test-cli's runner before any test file loads (mochaOpts.require).
//
// .vscode-test.mjs gives each configuration a disposable home through the
// USERPROFILE/HOME env, because the Console server registration and the
// lifecycle tests write ~/.failsafe/servers.json under os.homedir(). On
// 2026-11-09 one full Windows run still wrote that file into the real profile
// (servers.json with test-workspace and failsafe-lifecycle-e2e-* entries), so the
// env alone is not a sufficient control. os.homedir() re-reads USERPROFILE/HOME
// on every call, so redirecting them here, before the tests run, keeps every
// later registry write in this process inside a disposable folder whatever the
// launch path. The guard records when it had to act, and
// src/test/shared/testHomeIsolation.test.ts fails the run in that case, so the
// isolation gap is reported instead of silently absorbed.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ISOLATED = /^failsafe-vscode-test-(arch-)?home-/;
const FIRED_ENV = 'FAILSAFE_TEST_HOME_GUARD_FIRED';

function isIsolatedHome(home, tmp) {
  const rel = path.relative(fs.realpathSync.native(tmp), home);
  return ISOLATED.test(path.basename(home)) && rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function guardTestHome(env = process.env) {
  let home;
  try { home = fs.realpathSync.native(os.homedir()); } catch { home = os.homedir(); }
  if (isIsolatedHome(home, os.tmpdir())) return { fired: false, home };
  const guarded = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-vscode-test-home-guard-')));
  env.USERPROFILE = guarded;
  env.HOME = guarded;
  env[FIRED_ENV] = '1';
  console.warn(`[test-home-guard] test host started without an isolated home; redirected os.homedir() to ${guarded}`);
  return { fired: true, home: guarded };
}

// Acts only inside the VS Code (Electron) test host; node unit tests can require it.
if (process.versions.electron) guardTestHome();

module.exports = { guardTestHome, isIsolatedHome, FIRED_ENV, ISOLATED };
