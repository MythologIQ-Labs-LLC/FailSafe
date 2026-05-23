// Shared jsdom setup for the Learn-tab test suites. Lives outside the
// `.test.ts` discovery glob so mocha does not try to execute it as a suite.
// Split from `learn-tab.test.ts` when the trigger-integration suite (FX610)
// was extracted into its own sibling file to hold the Section 4 razor.

import { JSDOM } from "jsdom";

export interface LearnTabTestEnv {
  dom: JSDOM;
  restore: () => void;
}

// `active = true` simulates the case where Learn is the currently-visible
// tab (`command-center.js` adds `.active` to the panel on click). The host
// fan-out routes every hub tick to every renderer regardless of visibility,
// so `LearnRenderer` only consumes the per-session nudge budget on the
// active panel — see the FX610 hidden-tab budget-preservation test.
export function setupDom(active: boolean = true): LearnTabTestEnv {
  const activeClass = active ? ' class="active"' : '';
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><div id="learn"${activeClass}></div></body></html>`,
    { url: "http://localhost:9999" },
  );
  const prev = {
    window: (global as any).window,
    document: (global as any).document,
    localStorage: (global as any).localStorage,
    sessionStorage: (global as any).sessionStorage,
  };
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  // learn.js + learn-essay-list.js use sessionStorage (the per-session
  // namespace for nudge counts / dismissals / session-start). education-
  // lesson.js still uses localStorage for v1 governance-moment dismiss.
  // Expose both as true globals; clear so each test starts fresh.
  (global as any).localStorage = dom.window.localStorage;
  (global as any).sessionStorage = dom.window.sessionStorage;
  try { dom.window.localStorage.clear(); } catch (_e) { /* ignore */ }
  try { dom.window.sessionStorage.clear(); } catch (_e) { /* ignore */ }
  return {
    dom,
    restore: () => {
      (global as any).window = prev.window;
      (global as any).document = prev.document;
      (global as any).localStorage = prev.localStorage;
      (global as any).sessionStorage = prev.sessionStorage;
    },
  };
}
