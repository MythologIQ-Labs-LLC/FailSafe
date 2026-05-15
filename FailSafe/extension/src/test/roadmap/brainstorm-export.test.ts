import * as assert from "assert";
// @ts-expect-error JS module import in TS test context
import { exportBrainstormJSON, buildExportFilename } from "../../../src/roadmap/ui/modules/brainstorm-export.js";

interface DocStub {
  createCalls: number;
  lastAnchor: { href: string; download: string; clickCalls: number } | null;
}

function setupDom(): {
  origFetch: any;
  origCreateObjectURL: any;
  origRevokeObjectURL: any;
  origCreateElement: any;
  origConsoleError: any;
  origBlob: any;
  doc: DocStub;
  consoleErrorCalls: { count: number; lastArgs: unknown[] };
} {
  const origFetch = (globalThis as any).fetch;
  const origCreateObjectURL = (globalThis as any).URL?.createObjectURL;
  const origRevokeObjectURL = (globalThis as any).URL?.revokeObjectURL;
  const origCreateElement = (globalThis as any).document?.createElement;
  const origBlob = (globalThis as any).Blob;
  const origConsoleError = console.error;
  const consoleErrorCalls = { count: 0, lastArgs: [] as unknown[] };
  console.error = (...args: unknown[]) => {
    consoleErrorCalls.count += 1;
    consoleErrorCalls.lastArgs = args;
  };

  if (!(globalThis as any).URL) (globalThis as any).URL = {} as any;
  (globalThis as any).URL.createObjectURL = (_b: any) => 'blob:fake';
  (globalThis as any).URL.revokeObjectURL = (_u: any) => undefined;
  (globalThis as any).Blob = function (this: any, _parts: any[], _opts: any) { this._parts = _parts; } as any;

  const doc: DocStub = { createCalls: 0, lastAnchor: null };
  if (!(globalThis as any).document) (globalThis as any).document = {} as any;
  (globalThis as any).document.createElement = (_tag: string) => {
    doc.createCalls += 1;
    const a: any = { href: '', download: '', clickCalls: 0 };
    a.click = () => { a.clickCalls += 1; };
    doc.lastAnchor = a;
    return a;
  };

  return { origFetch, origCreateObjectURL, origRevokeObjectURL, origCreateElement, origConsoleError, origBlob, doc, consoleErrorCalls };
}

function teardownDom(s: ReturnType<typeof setupDom>) {
  (globalThis as any).fetch = s.origFetch;
  if ((globalThis as any).URL) {
    (globalThis as any).URL.createObjectURL = s.origCreateObjectURL;
    (globalThis as any).URL.revokeObjectURL = s.origRevokeObjectURL;
  }
  if ((globalThis as any).document) (globalThis as any).document.createElement = s.origCreateElement;
  (globalThis as any).Blob = s.origBlob;
  console.error = s.origConsoleError;
}

function makeStore(values: Record<string, string | null | undefined> = {}) {
  return { get: (k: string) => (k in values ? values[k] : null) } as any;
}

function makeShowStatusRecorder() {
  const calls: Array<{ text: string; color: string }> = [];
  const fn = (text: string, color: string) => { calls.push({ text, color }); };
  return { calls, fn };
}

suite("brainstorm-export", () => {
  test("buildExportFilename produces YYYY-MM-DD-HH-MM-SS-±OOOO with the supplied date components", () => {
    const d = new Date(2026, 4, 6, 14, 30, 15); // local: 2026-05-06 14:30:15
    const filename = buildExportFilename(d);
    assert.match(filename, /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}[+-]\d{4}$/);
    // Verify each date/time component regardless of TZ offset.
    assert.ok(filename.startsWith('2026-05-06-14-30-15'), `expected date+time prefix '2026-05-06-14-30-15', got ${filename}`);
    const tail = filename.slice('2026-05-06-14-30-15'.length);
    assert.match(tail, /^[+-]\d{4}$/);
  });

  test("exportBrainstormJSON: fetch throws → showStatus called once with 'Export failed'", async () => {
    const s = setupDom();
    try {
      (globalThis as any).fetch = async () => { throw new Error('network down'); };
      const { calls, fn } = makeShowStatusRecorder();
      const store = makeStore();

      await exportBrainstormJSON(fn, store);

      // showStatus invocation proves the catch block ran. (console.error is also
      // invoked but cannot be reliably observed from a CJS test against an ESM
      // module loaded into a separate realm in the vscode-test runner.)
      assert.strictEqual(calls.length, 1, 'showStatus called exactly once');
      assert.match(calls[0].text, /Export failed/);
      assert.strictEqual(calls[0].color, 'var(--accent-red)');
    } finally { teardownDom(s); }
  });

  test("exportBrainstormJSON: severity gating disables error toast when notifications-error-toasts='false'", async () => {
    const s = setupDom();
    try {
      (globalThis as any).fetch = async () => { throw new Error('network down'); };
      const { calls, fn } = makeShowStatusRecorder();
      const store = makeStore({ 'notifications-error-toasts': 'false' });

      await exportBrainstormJSON(fn, store);

      assert.strictEqual(calls.length, 0, 'showStatus must NOT be called when error toasts disabled');
    } finally { teardownDom(s); }
  });

  test("exportBrainstormJSON: happy path creates <a> element with download filename matching the export regex", async () => {
    const s = setupDom();
    try {
      (globalThis as any).fetch = async () => ({
        ok: true,
        json: async () => ({ nodes: [], edges: [] }),
      });
      const { calls, fn } = makeShowStatusRecorder();
      const store = makeStore();

      await exportBrainstormJSON(fn, store);

      assert.strictEqual(s.doc.createCalls, 1, 'document.createElement called exactly once');
      assert.ok(s.doc.lastAnchor, 'an anchor element was created');
      assert.match(s.doc.lastAnchor!.download, /^brainstorm-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}[+-]\d{4}\.json$/);
      assert.strictEqual(s.doc.lastAnchor!.clickCalls, 1, 'anchor.click() invoked exactly once');
      assert.strictEqual(calls.length, 0, 'no toast on happy path');
    } finally { teardownDom(s); }
  });
});
