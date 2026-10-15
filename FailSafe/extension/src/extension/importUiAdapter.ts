/**
 * importUiAdapter - ImportUi over the VS Code window API (#482).
 */

import * as vscode from 'vscode';
import type { ImportUi } from '../integrations/credentials/importUi';
import { credentialUi } from './credentials-command';

export function vscodeImportUi(): ImportUi {
  return {
    ...credentialUi(),
    error: (message) => { void vscode.window.showErrorMessage(message); },
    info: (message) => { void vscode.window.showInformationMessage(message, { modal: false }); },
    progress: (title, task) => vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task),
  };
}
