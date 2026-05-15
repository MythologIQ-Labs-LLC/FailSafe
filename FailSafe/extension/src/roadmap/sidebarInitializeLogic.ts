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
