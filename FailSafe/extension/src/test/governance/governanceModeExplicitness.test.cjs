/**
 * FailSafe#243 Tranche B (upgrade/migration audit) — regression coverage for
 * a defaulted-vs-explicit governance.mode detection bug found during the
 * audit.
 *
 * `EnforcementEngine.getGovernanceModeState()` is supposed to report
 * `defaulted: true` when an install never explicitly chose a governance
 * mode, so `modeDefaultNotice.maybeShowModeDefaultNotice()` can warn
 * existing users that the 2026-08-19 default flip (observe -> enforce)
 * silently changed their behavior on upgrade. Before this fix, `defaulted`
 * was derived only from "is the resolved mode a valid string" — and
 * `ConfigManager.getConfig()` always resolves `governance.mode` to a valid
 * string (the package.json schema default is "enforce"), so `defaulted`
 * was always `false` through the real production wiring. The upgrade
 * notice could never fire for any real install.
 *
 * Runs standalone: node --test src/test/governance/governanceModeExplicitness.test.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { EnforcementEngine } = require(
  path.resolve(__dirname, '..', '..', '..', 'out', 'governance', 'EnforcementEngine.js'),
);
const { maybeShowModeDefaultNotice, MODE_DEFAULT_NOTICE_KEY } = require(
  path.resolve(__dirname, '..', '..', '..', 'out', 'extension', 'modeDefaultNotice.js'),
);

const noopIntentProvider = {
  getActiveIntent: async () => null,
  createIntent: async () => { throw new Error('not used'); },
};
const noopNotifications = {
  showInfo: async () => undefined,
  showWarning: async () => undefined,
  showError: async () => undefined,
};

/** Mirrors ConfigManager.getConfig()'s shape for governance.mode: always a
 *  concrete, valid mode string, whether or not the user ever configured it —
 *  this is the real production behavior (package.json declares
 *  "default": "enforce" for failsafe.governance.mode). */
function makeConfigProvider(mode, isGovernanceModeExplicit) {
  const provider = {
    getConfig: () => ({ governance: { mode, overseerId: 'did:myth:overseer:local' } }),
    getWorkspaceRoot: () => '/workspace',
    getFailSafeDir: () => '/workspace/.failsafe',
    getLedgerPath: () => '/workspace/.failsafe/ledger/soa_ledger.db',
    getFeedbackDir: () => '/workspace/.failsafe/feedback',
    getSentinelConfigPath: () => '/workspace/.failsafe/config/sentinel.yaml',
    onConfigChange: () => () => {},
  };
  if (isGovernanceModeExplicit !== undefined) {
    provider.isGovernanceModeExplicit = () => isGovernanceModeExplicit;
  }
  return provider;
}

function makeEngine(configProvider) {
  return new EnforcementEngine(noopIntentProvider, '/workspace', configProvider, noopNotifications);
}

describe('EnforcementEngine.getGovernanceModeState — defaulted detection', () => {
  it('reports defaulted:true for a pristine install (isGovernanceModeExplicit -> false)', () => {
    // The real ConfigManager path for a never-configured install: getConfig()
    // resolves the schema default ("enforce"), but isGovernanceModeExplicit()
    // correctly reports false via vscode's inspect().
    const engine = makeEngine(makeConfigProvider('enforce', false));
    const state = engine.getGovernanceModeState();
    assert.equal(state.mode, 'enforce');
    assert.equal(state.defaulted, true, 'a resolvable schema-default value must still be reported as defaulted when the provider says so');
  });

  it('reports defaulted:false when the user explicitly chose the same value as the default', () => {
    const engine = makeEngine(makeConfigProvider('enforce', true));
    const state = engine.getGovernanceModeState();
    assert.equal(state.mode, 'enforce');
    assert.equal(state.defaulted, false);
  });

  it('reports defaulted:false for an explicit non-default choice', () => {
    const engine = makeEngine(makeConfigProvider('observe', true));
    const state = engine.getGovernanceModeState();
    assert.equal(state.mode, 'observe');
    assert.equal(state.defaulted, false);
  });

  it('preserves prior behavior (defaulted:false) when the provider cannot determine explicitness', () => {
    // No isGovernanceModeExplicit implementation at all (e.g. FileConfigProvider).
    const engine = makeEngine(makeConfigProvider('enforce', undefined));
    const state = engine.getGovernanceModeState();
    assert.equal(state.mode, 'enforce');
    assert.equal(state.defaulted, false);
  });

  it('still reports defaulted:true for an unresolvable/invalid mode regardless of explicitness', () => {
    const engine = makeEngine(makeConfigProvider('totally-invalid-mode', true));
    const state = engine.getGovernanceModeState();
    assert.equal(state.mode, 'enforce');
    assert.equal(state.defaulted, true);
  });
});

// maybeShowModeDefaultNotice()'s own show/suppress/idempotency behavior is
// already covered in isolation by src/test/extension/mode-default-notice.test.ts
// (FX902). What was never covered end-to-end is whether the `defaulted` flag
// it's fed actually reflects a real install — this test closes that gap by
// wiring the two real production units together.
describe('EnforcementEngine -> maybeShowModeDefaultNotice — end-to-end pipeline', () => {
  it('a pristine (never-configured) install now surfaces the upgrade notice', async () => {
    const engine = makeEngine(makeConfigProvider('enforce', false));
    const globalState = {};
    let notified = 0;
    const fired = await maybeShowModeDefaultNotice({
      getModeState: () => engine.getGovernanceModeState(),
      getGlobalState: (key) => globalState[key],
      setGlobalState: (key, value) => { globalState[key] = value; },
      notifications: { showInfo: async () => { notified++; return undefined; } },
      executeCommand: () => {},
    });
    assert.equal(fired, true, 'a pristine install must see the one-time notice');
    assert.equal(notified, 1);
    assert.equal(globalState[MODE_DEFAULT_NOTICE_KEY], true);
  });

  it('an explicitly-configured install never sees the notice', async () => {
    const engine = makeEngine(makeConfigProvider('enforce', true));
    let notified = 0;
    const fired = await maybeShowModeDefaultNotice({
      getModeState: () => engine.getGovernanceModeState(),
      getGlobalState: () => undefined,
      setGlobalState: () => {},
      notifications: { showInfo: async () => { notified++; return undefined; } },
      executeCommand: () => {},
    });
    assert.equal(fired, false);
    assert.equal(notified, 0);
  });
});
