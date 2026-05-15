// Functional tests for SentinelMonitor.renderSentinel (FX-MONITOR-SENTINEL).
//
// Closes the coherence-via-association gap from the v5.1.0 seal: the cold-load
// + idle-daemon contradiction in sentinel-monitor.js where `state` defaulted to
// 'monitoring' regardless of `status.running`. These cases directly invoke
// `renderSentinel(status, verdicts)` against a captured DOM-shaped mock and
// assert observable element state (className / textContent / classList /
// onclick), per Entry #295/#296 audit chain.
//
// Pattern reference: connection.test.ts:7 (untyped JS module import) and
// monitor-state-coherence.test.ts:48 (mocha TDD `suite`/`test` UI).

import { strict as assert } from 'assert';
// @ts-expect-error untyped JS module
import { SentinelMonitor } from '../../../src/roadmap/ui/modules/sentinel-monitor.js';

interface SentinelAlertMock {
  _classes: Set<string>;
  textContent: string;
  title: string;
  onclick: (() => void) | null;
  classList: {
    add(c: string): void;
    remove(c: string): void;
    contains(c: string): boolean;
  };
}

interface ElementsMock {
  sentinelLabel: { textContent: string };
  sentinelOrb: { className: string };
  queueValue: { textContent: string };
  sentinelAlert: SentinelAlertMock;
}

function buildElementsMock(): ElementsMock {
  const sentinelAlert: SentinelAlertMock = {
    _classes: new Set<string>(),
    textContent: '',
    title: '',
    onclick: null,
    classList: {
      add(c: string) { sentinelAlert._classes.add(c); },
      remove(c: string) { sentinelAlert._classes.delete(c); },
      contains(c: string) { return sentinelAlert._classes.has(c); },
    },
  };
  return {
    sentinelLabel: { textContent: '' },
    sentinelOrb: { className: '' },
    queueValue: { textContent: '' },
    sentinelAlert,
  };
}

suite('Sentinel monitor render (FX-MONITOR-SENTINEL)', () => {
  test('idle daemon, no verdict — state=pending, label=Idle, orb class pending', () => {
    const elements = buildElementsMock();
    const monitor = new SentinelMonitor(elements);
    monitor.renderSentinel({ running: false, queueDepth: 0 }, []);
    assert.equal(elements.sentinelLabel.textContent, 'Idle',
      `label should be 'Idle', got '${elements.sentinelLabel.textContent}'`);
    assert.equal(elements.sentinelOrb.className, 'sentinel-orb pending',
      `orb class should be 'sentinel-orb pending', got '${elements.sentinelOrb.className}'`);
  });

  test('running daemon, no verdict — state=monitoring, label=Monitoring, orb class monitoring', () => {
    const elements = buildElementsMock();
    const monitor = new SentinelMonitor(elements);
    monitor.renderSentinel({ running: true, queueDepth: 0 }, []);
    assert.equal(elements.sentinelLabel.textContent, 'Monitoring',
      `label should be 'Monitoring', got '${elements.sentinelLabel.textContent}'`);
    assert.equal(elements.sentinelOrb.className, 'sentinel-orb monitoring',
      `orb class should be 'sentinel-orb monitoring', got '${elements.sentinelOrb.className}'`);
  });

  test('idle daemon + WARN verdict — verdict precedence, state=warnings, label=Warnings', () => {
    const elements = buildElementsMock();
    const monitor = new SentinelMonitor(elements);
    monitor.renderSentinel(
      { running: false, lastVerdict: { decision: 'WARN' } },
      [{ decision: 'WARN', summary: 'test' }],
    );
    assert.equal(elements.sentinelLabel.textContent, 'Warnings',
      `label should be 'Warnings', got '${elements.sentinelLabel.textContent}'`);
    assert.equal(elements.sentinelOrb.className, 'sentinel-orb warnings',
      `orb class should be 'sentinel-orb warnings', got '${elements.sentinelOrb.className}'`);
  });

  test('running daemon + BLOCK verdict — verdict precedence, state=errors, label=Errors', () => {
    const elements = buildElementsMock();
    const monitor = new SentinelMonitor(elements);
    monitor.renderSentinel(
      { running: true, lastVerdict: { decision: 'BLOCK' } },
      [{ decision: 'BLOCK', summary: 'test' }],
    );
    assert.equal(elements.sentinelLabel.textContent, 'Errors',
      `label should be 'Errors', got '${elements.sentinelLabel.textContent}'`);
    assert.equal(elements.sentinelOrb.className, 'sentinel-orb errors',
      `orb class should be 'sentinel-orb errors', got '${elements.sentinelOrb.className}'`);
  });

  test('empty verdicts array, no alert — sentinelAlert is hidden, empty, no onclick', () => {
    const elements = buildElementsMock();
    const monitor = new SentinelMonitor(elements);
    monitor.renderSentinel({ running: true }, []);
    assert.equal(elements.sentinelAlert.classList.contains('hidden'), true,
      `sentinelAlert should contain 'hidden' class`);
    assert.equal(elements.sentinelAlert.textContent, '',
      `sentinelAlert.textContent should be empty, got '${elements.sentinelAlert.textContent}'`);
    assert.equal(elements.sentinelAlert.onclick, null,
      `sentinelAlert.onclick should be null`);
  });
});
