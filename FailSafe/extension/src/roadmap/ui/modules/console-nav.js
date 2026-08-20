// ConsoleNav — Monitor→Console navigation that survives the sidebar webview
// sandbox (FX916). Embedded in the sidebar's iframe (window.parent !== window)
// the compact UI cannot open popups, so window.open is a silent no-op; instead
// the sidebar chrome relays a failsafe.openConsole message to the extension
// host (FailSafeSidebarProvider), which opens the Console externally via
// vscode.env.openExternal. Browser-served, plain window.open still works.
import { navigationHash } from './command-center-deeplink.js';

export function openConsole(route, win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return;
  if (win.parent && win.parent !== win) {
    try {
      win.parent.postMessage({ type: 'failsafe.openConsole', route: String(route) }, '*');
      return;
    } catch { /* cross-origin parent — fall through to direct open */ }
  }
  win.open(`/command-center.html${navigationHash(route)}`, '_blank');
}
