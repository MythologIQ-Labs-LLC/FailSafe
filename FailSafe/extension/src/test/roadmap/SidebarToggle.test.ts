import { describe, it } from 'mocha';
import { strict as assert } from 'assert';

// Access private getHtml() via cast for structural verification
import { FailSafeSidebarProvider } from '../../roadmap/FailSafeSidebarProvider';

function getSidebarHtml(): string {
  const provider = new FailSafeSidebarProvider(9376);
  // Inject a minimal view stub so getHtml() can interpolate cspSource
  (provider as any).view = { webview: { cspSource: 'vscode-webview:' } };
  return (provider as any).getHtml();
}

describe('FailSafeSidebarProvider — SRE toggle', () => {
  it('contains #btn-monitor with aria-selected="true"', () => {
    const html = getSidebarHtml();
    assert.ok(html.includes('id="btn-monitor"'), '#btn-monitor missing');
    assert.ok(html.includes('aria-selected="true"'), 'btn-monitor aria-selected="true" missing');
  });

  it('contains #btn-sre with aria-selected="false"', () => {
    const html = getSidebarHtml();
    assert.ok(html.includes('id="btn-sre"'), '#btn-sre missing');
    assert.ok(html.includes('aria-selected="false"'), 'btn-sre aria-selected="false" missing');
  });

  it('contains #main-frame iframe', () => {
    const html = getSidebarHtml();
    assert.ok(html.includes('id="main-frame"'), '#main-frame iframe missing');
  });

  it('toggle JS is in existing script block (no second acquireVsCodeApi call)', () => {
    const html = getSidebarHtml();
    const count = (html.match(/acquireVsCodeApi/g) || []).length;
    assert.strictEqual(count, 1, `Expected 1 acquireVsCodeApi call, got ${count}`);
  });

  it('switchView function is present in script block', () => {
    const html = getSidebarHtml();
    assert.ok(html.includes('function switchView'), 'switchView function missing');
  });

  it('initBtn state write spreads existing state', () => {
    const html = getSidebarHtml();
    assert.ok(
      html.includes('...vscode.getState(), initDone: true'),
      'initBtn state write does not spread — sreMode will be clobbered',
    );
  });

  // FX916: the chrome's message listener forwards failsafe.openConsole from the
  // Monitor iframe to the host. The inline nonce'd script is not executable in
  // any harness (see plan-monitor-alert-console-deeplink.md boundaries), so
  // this structural pin is the strongest in-repo guard for the forwarding seam;
  // the two executable ends are pinned by console-nav.test.ts (iframe emission)
  // and sidebarInitializeLogic.test.ts + commands-dispatch.test.ts (host path).
  it('FX916 chrome forwards failsafe.openConsole only from the Monitor iframe', () => {
    const html = getSidebarHtml();
    assert.ok(html.includes("data.type === 'failsafe.openConsole'"),
      'openConsole message type check missing from chrome listener');
    assert.ok(html.includes("vscode.postMessage({ command: 'openConsole', route: data.route })"),
      'openConsole forward to host missing');
    assert.ok(html.includes('event.source === mainFrame.contentWindow'),
      'event.source guard missing — any embedded frame could drive the relay');
  });
});
