// FX948 (#504): which saved documents editor-save governance evaluates.
// Only real files inside a workspace folder are governed. The user settings
// document (`vscode-userdata:`), untitled buffers, and files outside every
// folder are outside the governance boundary.

export interface SavedDocumentUri {
  scheme: string;
  fsPath: string;
}

export function isGovernedSave<T extends SavedDocumentUri>(
  uri: T,
  isInWorkspace: (uri: T) => boolean,
): boolean {
  return uri.scheme === "file" && isInWorkspace(uri);
}

/**
 * #505: VS Code's file-scheme save notification cannot veto disk writes.
 * Keep the capability disclosure separate from policy verdicts.
 */
export const EDITOR_SAVE_LIMITATION_NOTICE =
  "FailSafe Enforce mode cannot block ordinary VS Code editor saves. A policy denial is reported, but the file may still be written to disk. Use governed write/commit workflows for enforceable controls.";

export function shouldShowEditorSaveLimitation(
  mode: string,
  alreadyAcknowledged: boolean,
): boolean {
  return mode === "enforce" && !alreadyAcknowledged;
}
