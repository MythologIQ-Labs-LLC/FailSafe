/**
 * #538 lane B (plan-538b LD8): an Approve or Reject click in the L3 approval
 * webview panel records the `vscode-webview` authentication method.
 */
import { strict as assert } from 'assert';
import { L3ApprovalPanel } from '../../genesis/panels/L3ApprovalPanel';
import { EventBus } from '../../shared/EventBus';

function fakePanel(): { panel: unknown; send: (m: unknown) => Promise<void> } {
  let handler: (m: unknown) => Promise<void> = async () => undefined;
  const panel = {
    webview: {
      html: '', cspSource: 'vscode-resource:',
      onDidReceiveMessage: (cb: (m: unknown) => Promise<void>) => { handler = cb; return { dispose() {} }; },
    },
    onDidDispose: () => ({ dispose() {} }),
    reveal: () => undefined,
    dispose: () => undefined,
  };
  return { panel, send: (m) => handler(m) };
}

suite('#538 L3ApprovalPanel records vscode-webview authentication', () => {
  for (const [command, decision] of [['approve', 'APPROVED'], ['reject', 'REJECTED']] as const) {
    test(`${command} passes ${decision} with the webview descriptor`, async () => {
      const calls: unknown[][] = [];
      const qorelogic = {
        getL3Queue: () => [],
        processL3Decision: async (...args: unknown[]) => { calls.push(args); },
      };
      const { panel, send } = fakePanel();
      const Ctor = L3ApprovalPanel as unknown as new (p: unknown, q: unknown, b: EventBus) => L3ApprovalPanel;
      new Ctor(panel, qorelogic, new EventBus());
      await send({ command, id: 'l3-1' });
      assert.deepEqual(calls, [['l3-1', decision, { method: 'vscode-webview', channel: 'vscode:l3-approval-panel' }]]);
    });
  }
});
