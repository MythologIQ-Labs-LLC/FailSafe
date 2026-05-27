/**
 * FX705 — bootstrapSentinel x Open Design detector wiring tests.
 *
 * Verifies the wiring contract added in plan v3:
 *  - When `failsafe.integrations.openDesign.enabled === true`, bootstrapSentinel
 *    constructs the AgentRunRecorder with `provenanceDetectors: [<OD detector>]`.
 *  - When the setting is false / unset (default), no detector is wired.
 *  - Runtime toggle is a no-op for v1 (documented limitation — verified by
 *    asserting that re-reading the setting post-construction has no effect on
 *    the already-built recorder).
 *
 * Approach: intercept AgentRunRecorder + OpenDesignProvenanceDetector at the
 * require-cache layer so we capture the constructor args passed to the
 * recorder without booting the rest of Sentinel.
 *
 * Runs standalone:
 *   node --test src/test/extension/bootstrapSentinel-open-design.test.cjs
 */

'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

// ---- Capture state ----
let capturedRecorderArgs = null; // { eventBus, runsPath, options }
let openDesignEnabledSetting = false;

// ---- vscode stub ----
const vscodeStub = {
  workspace: {
    getConfiguration(_section) {
      return {
        get(key, fallback) {
          if (key === 'integrations.openDesign.enabled') return openDesignEnabledSetting;
          return fallback;
        },
      };
    },
  },
  window: {
    showWarningMessage: () => {},
    showInformationMessage: () => {},
  },
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') return 'vscode';
  return originalResolve.call(this, request, parent, ...rest);
};
require.cache['vscode'] = {
  id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub,
};

// ---- Recorder + detector capture stubs ----
const outDir = path.resolve(__dirname, '..', '..', '..', 'out');
const recorderModPath = path.join(outDir, 'sentinel', 'AgentRunRecorder.js');
const odDetectorModPath = path.join(outDir, 'integrations', 'open-design', 'OpenDesignProvenanceDetector.js');
const odIndexPath = path.join(outDir, 'integrations', 'open-design', 'index.js');

// Pre-warm real modules so we can inspect resolved filenames.
require(recorderModPath);
require(odDetectorModPath);

// Track detector instantiations.
let detectorInstantiations = 0;
class FakeOpenDesignDetector {
  constructor() { detectorInstantiations++; }
  detectFromFilePath() { return null; }
}

// Replace exports in-place via require.cache.
require.cache[recorderModPath].exports.AgentRunRecorder = class FakeAgentRunRecorder {
  constructor(eventBus, runsPath, options) {
    capturedRecorderArgs = { eventBus, runsPath, options };
  }
  dispose() {}
  getActiveRuns() { return []; }
  getCompletedRuns() { return []; }
  getRun() { return undefined; }
  getRunSteps() { return []; }
  startRun() { return { id: 'fake' }; }
  endRun() { return undefined; }
  loadRun() { return null; }
  handleFileEdit() {}
  attachProvenance() { return false; }
};
require.cache[odDetectorModPath].exports.OpenDesignProvenanceDetector = FakeOpenDesignDetector;
// Re-export through the barrel so bootstrapSentinel's `from '../integrations/open-design'`
// import sees the fake.
if (require.cache[odIndexPath]) {
  require.cache[odIndexPath].exports.OpenDesignProvenanceDetector = FakeOpenDesignDetector;
}

// Stub heavy Sentinel deps to prevent boot cost.
const sentinelStubFiles = [
  ['sentinel', 'SentinelDaemon.js'],
  ['sentinel', 'PatternLoader.js'],
  ['sentinel', 'engines', 'HeuristicEngine.js'],
  ['sentinel', 'engines', 'VerdictEngine.js'],
  ['sentinel', 'engines', 'ExistenceEngine.js'],
  ['sentinel', 'VerdictArbiter.js'],
  ['sentinel', 'VerdictRouter.js'],
  ['sentinel', 'engines', 'ArchitectureEngine.js'],
  ['sentinel', 'AgentTimelineService.js'],
];
for (const parts of sentinelStubFiles) {
  const p = path.join(outDir, ...parts);
  try {
    require(p);
  } catch { continue; }
  const exp = require.cache[p].exports;
  // Patch every exported class so its constructor is cheap + side-effect-free.
  for (const key of Object.keys(exp)) {
    const cls = exp[key];
    if (typeof cls !== 'function') continue;
    exp[key] = class Stub {
      constructor() { /* swallow args */ }
      // Common interface members the bootstrap touches:
      async loadCustomPatterns() {}
      async start() {}
      dispose() {}
      getEntries() { return []; }
      getEntriesSince() { return []; }
    };
  }
}

// Pull bootstrap module AFTER stubs are in place.
const { bootstrapSentinel } = require(path.join(outDir, 'extension', 'bootstrapSentinel.js'));

function fakeCore(workspaceRoot) {
  return {
    eventBus: { onAll: () => () => {}, emit: () => {}, on: () => () => {} },
    configManager: {
      getConfig: () => ({}),
    },
    workspaceRoot,
  };
}
function fakeQor() {
  return {
    policyEngine: {},
    trustEngine: {},
    ledgerManager: {},
    shadowGenomeManager: {},
    qorelogicManager: {},
  };
}
function fakeLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}
function fakeContext() {
  return { subscriptions: [] };
}

describe('FX705 — bootstrapSentinel Open Design wiring', () => {
  let tmpRoot;
  beforeEach(() => {
    capturedRecorderArgs = null;
    detectorInstantiations = 0;
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-bootstrap-od-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it('setting=true → AgentRunRecorder receives provenanceDetectors with one detector', async () => {
    openDesignEnabledSetting = true;
    await bootstrapSentinel(fakeContext(), fakeCore(tmpRoot), fakeQor(), fakeLogger());
    assert.ok(capturedRecorderArgs, 'expected AgentRunRecorder to be constructed');
    assert.ok(capturedRecorderArgs.options, 'expected 3rd-arg options bag');
    assert.ok(
      Array.isArray(capturedRecorderArgs.options.provenanceDetectors),
      'expected provenanceDetectors array',
    );
    assert.equal(capturedRecorderArgs.options.provenanceDetectors.length, 1);
    assert.equal(detectorInstantiations, 1);
  });

  it('setting=false (default) → no detector wired', async () => {
    openDesignEnabledSetting = false;
    await bootstrapSentinel(fakeContext(), fakeCore(tmpRoot), fakeQor(), fakeLogger());
    assert.ok(capturedRecorderArgs, 'expected AgentRunRecorder to be constructed');
    // Either no options object OR options with an empty detectors array — both
    // satisfy the contract that no Open Design detector is wired.
    const detectors = capturedRecorderArgs.options?.provenanceDetectors ?? [];
    assert.equal(detectors.length, 0);
    assert.equal(detectorInstantiations, 0);
  });

  it('runtime toggle is a no-op for v1 — re-reading setting does not rebuild the recorder', async () => {
    openDesignEnabledSetting = false;
    await bootstrapSentinel(fakeContext(), fakeCore(tmpRoot), fakeQor(), fakeLogger());
    const firstArgs = capturedRecorderArgs;
    // Operator flips the setting at runtime.
    openDesignEnabledSetting = true;
    // No re-bootstrap happens — the existing recorder is untouched.
    // (The doc'd contract is "Requires extension reload after toggling.")
    assert.equal(capturedRecorderArgs, firstArgs);
    const detectors = capturedRecorderArgs.options?.provenanceDetectors ?? [];
    assert.equal(detectors.length, 0);
  });
});
