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
