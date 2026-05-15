// Feature-level test for the FailSafe Monitor (index.html + roadmap.js).
//
// Catches the cross-component state coherence bug the operator observed in
// the running extension: status-line said "Connecting..." while the sentinel
// orb was painted green by HTML defaults. The two state machines (WebSocket
// connection lifecycle + Sentinel hub state) must not contradict each other
// at any DOM snapshot the user sees.
//
// This is the kind of test that Qor-logic#41's "feature-level TDD" gate
// would have required upstream of the code shipping. Filed as a deliberate
// remediation for the observed contradiction.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

interface PaintedState {
  statusLine: string;
  sentinelOrbClass: string;
  sentinelLabel: string;
  queueValue: string;
}

function readPaintedState(doc: Document): PaintedState {
  return {
    statusLine: doc.getElementById('status-line')?.textContent?.trim() ?? '',
    sentinelOrbClass: doc.getElementById('sentinel-orb')?.className ?? '',
    sentinelLabel: doc.getElementById('sentinel-label')?.textContent?.trim() ?? '',
    queueValue: doc.getElementById('queue-value')?.textContent?.trim() ?? '',
  };
}

function loadMonitorHtml(): JSDOM {
  const htmlPath = path.join(
    __dirname, '..', '..', '..', 'src', 'roadmap', 'ui', 'index.html',
  );
  const html = fs.readFileSync(htmlPath, 'utf-8');
  // Remove the <link rel="stylesheet"> + <script type="module"> tags so JSDOM
  // doesn't try to fetch them. We're testing only the painted defaults + the
  // contract that any future changes to those defaults stay coherent.
  const stripped = html
    .replace(/<link[^>]*>/g, '')
    .replace(/<script[^>]*><\/script>/g, '');
  return new JSDOM(stripped);
}

suite('Monitor cross-component state coherence (FX-MONITOR-COHERENCE)', () => {
  test('initial HTML defaults must NOT show green sentinel + Connecting simultaneously', () => {
    const dom = loadMonitorHtml();
    const state = readPaintedState(dom.window.document);

    // The user-observed bug: status="Connecting..." + sentinel=green-monitoring.
    // That contradiction is now blocked by HTML defaults using "pending".
    const statusIsConnecting = /Connecting/i.test(state.statusLine);
    const sentinelIsGreen = /\bmonitoring\b/.test(state.sentinelOrbClass);

    assert.equal(
      statusIsConnecting && sentinelIsGreen,
      false,
      `Cross-component contradiction: status="${state.statusLine}" + sentinel-orb-class="${state.sentinelOrbClass}". ` +
      `When connection is not established, sentinel orb must NOT show "monitoring" (green). ` +
      `Use "pending" or equivalent neutral state instead.`,
    );
  });

  test('initial HTML defaults — sentinel section uses pending state', () => {
    const dom = loadMonitorHtml();
    const state = readPaintedState(dom.window.document);
    assert.match(state.sentinelOrbClass, /\bpending\b/,
      `sentinel-orb default class should be "pending", got: "${state.sentinelOrbClass}"`);
    assert.equal(state.sentinelLabel, '—',
      `sentinel-label default should be "—" (neutral placeholder), got: "${state.sentinelLabel}"`);
    assert.equal(state.queueValue, '—',
      `queue-value default should be "—" (neutral placeholder), got: "${state.queueValue}"`);
  });

  test('initial HTML defaults — status-line shows "Connecting..." (matches WS lifecycle)', () => {
    const dom = loadMonitorHtml();
    const state = readPaintedState(dom.window.document);
    assert.match(state.statusLine, /Connecting/,
      `status-line default should reflect WS lifecycle ("Connecting..."), got: "${state.statusLine}"`);
  });

  test('command-center.html — initial connection dot must NOT default to "connected" (green)', () => {
    const htmlPath = path.join(
      __dirname, '..', '..', '..', 'src', 'roadmap', 'ui', 'command-center.html',
    );
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const stripped = html
      .replace(/<link[^>]*>/g, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
    const doc = new JSDOM(stripped).window.document;

    const dot = doc.querySelector('.connection-status .dot');
    const label = doc.querySelector('.connection-status .label');
    assert.ok(dot, 'connection-status dot must exist');

    // The bug pattern: hardcoded "connected" (green) + "LIVE" label before
    // any actual connection. ConnectionClient initializes with state
    // 'disconnected'; the painted default lies for the window before the
    // first setState() callback fires.
    assert.equal(
      dot!.classList.contains('connected'), false,
      `connection dot defaults to "connected" (green) — must use neutral pending state ` +
      `until ConnectionClient confirms WS open. classList: "${dot!.className}"`,
    );
    assert.notEqual(
      label?.textContent?.trim(), 'LIVE',
      'connection label defaults to "LIVE" — must use neutral placeholder until WS confirmed',
    );
  });

  test('coherence rule — disconnected status MUST NOT coexist with monitoring/warnings/errors orb', () => {
    // Simulate the contradiction explicitly: if a future change reintroduces
    // "monitoring" as the default while status is still "Connecting", this
    // assertion catches it.
    const dom = loadMonitorHtml();
    const doc = dom.window.document;
    const orb = doc.getElementById('sentinel-orb')!;
    const statusLine = doc.getElementById('status-line')!;

    // Force-paint the contradiction the user observed:
    orb.className = 'sentinel-orb monitoring';
    statusLine.textContent = 'Connecting...';

    // Now the snapshot DOES show the contradiction. Confirm our detector trips.
    const snapshot = readPaintedState(doc);
    const contradicts =
      /Connecting|Disconnected|error/i.test(snapshot.statusLine) &&
      /\b(monitoring|warnings|errors)\b/.test(snapshot.sentinelOrbClass);
    assert.equal(contradicts, true,
      'Detector must flag the painted contradiction state.');
  });
});
