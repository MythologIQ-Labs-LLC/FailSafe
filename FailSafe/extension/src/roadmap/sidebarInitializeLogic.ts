// Host-side decision function for the FailSafe sidebar button (Initialize <-> Organize toggle).
// Pure TypeScript with no vscode import — the unit-under-test is the actual deployed code path.
// Webview JS sends `{ command: "sidebar.click", currentLabel }`; host invokes this function
// and acts on the returned discriminated union.

export type ButtonUpdate = {
  type: "failsafe.button.update";
  text: string;
  title: string;
  persistState: boolean;
};

export type SidebarClickDecision =
  | { kind: "run-organize" }
  | { kind: "run-bootstrap"; postUpdate: ButtonUpdate }
  | { kind: "bootstrap-not-ready" };

export function decideSidebarClick(
  currentLabel: string,
  registeredCommands: ReadonlySet<string>,
): SidebarClickDecision {
  if (currentLabel === "Organize") return { kind: "run-organize" };
  if (registeredCommands.has("failsafe.bootstrap")) {
    return {
      kind: "run-bootstrap",
      postUpdate: {
        type: "failsafe.button.update",
        text: "Organize",
        title: "Organize Workspace Structure",
        persistState: true,
      },
    };
  }
  return { kind: "bootstrap-not-ready" };
}

// Console hash-routes relayed from the Monitor iframe (FX916). The route only
// ever becomes a URL fragment on the fixed localhost Console base, but it
// crosses the webview→host boundary, so it gets an allowlist: tab/subview
// segment plus an optional query of the same safe characters. No slashes, no
// whitespace, no '#' — a route can never smuggle a URL, scheme, or script.
const CONSOLE_ROUTE_RE = /^[A-Za-z0-9:._-]+(\?[A-Za-z0-9:._&=%-]*)?$/;

export function sanitizeConsoleRoute(route: unknown): string | null {
  if (typeof route !== "string") return null;
  if (route.length === 0 || route.length > 256) return null;
  return CONSOLE_ROUTE_RE.test(route) ? route : null;
}
