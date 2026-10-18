/**
 * #538 (plan-538b LD8), #514 residual: how an operator action was authenticated, as it is
 * recorded in the FailSafe ledger. `proves` states what the method shows and, for the
 * modal, what it does not: which local process sent the request.
 */

export type OperatorAuthenticationMethod = "vscode-modal-confirmation" | "vscode-webview" | "unverified-loopback";

export interface OperatorAuthentication {
  method: OperatorAuthenticationMethod;
  /** Where the decision arrived, for example `console:/api/actions/decide-l3`. */
  channel: string;
}

export interface OperatorAuthenticationRecord extends OperatorAuthentication {
  proves: string;
}

const PROVES: Record<OperatorAuthenticationMethod, string> = {
  "vscode-modal-confirmation":
    "A person approved a modal VS Code dialog. This does not identify which local process sent the request.",
  "vscode-webview": "A person clicked Approve or Reject in the FailSafe L3 approval panel inside VS Code.",
  "unverified-loopback": "No human confirmation was recorded for this decision.",
};

/** The ledger form of `auth`; any method not listed above is recorded as `unverified-loopback`. */
export function describeOperatorAuthentication(auth: OperatorAuthentication | undefined): OperatorAuthenticationRecord {
  const method: OperatorAuthenticationMethod =
    auth && Object.prototype.hasOwnProperty.call(PROVES, auth.method) ? auth.method : "unverified-loopback";
  return { method, channel: String(auth?.channel ?? "unknown"), proves: PROVES[method] };
}
