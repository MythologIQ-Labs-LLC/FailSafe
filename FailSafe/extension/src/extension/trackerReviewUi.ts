/**
 * trackerReviewUi — the VS Code side of the governed Jira/Linear import (#480):
 * an untitled Markdown preview document, a modal approval, a validated purpose
 * box and the enforce-mode plan picker.
 */

import * as vscode from 'vscode';
import {
  DRAFTS_UNAVAILABLE, MAX_PURPOSE, describeEarlierImport, getTrackerIntentDeps, previewMarkdown, reviewAndImport,
  type ImportReviewUi, type TrackerImportResult, type TrackerIssue,
} from '../integrations/tracker-import/tracker-intent-import';

const APPROVE = 'Create intent draft';

/** Input-box validation for the intent purpose (IntentSchema caps it at MAX_PURPOSE). */
export function validatePurpose(v: string): string | undefined {
  if (!v.trim()) return 'A purpose is required.';
  return v.length > MAX_PURPOSE ? `At most ${MAX_PURPOSE} characters.` : undefined;
}

/** The plan picker comes from the installed tracker deps, so it is read at call time. */
function pickPlanId(): Promise<string | undefined> {
  return getTrackerIntentDeps()?.pickPlanId() ?? Promise.resolve(undefined);
}

export function vscodeReviewUi(): ImportReviewUi {
  return {
    showPreview: async (markdown) => {
      const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: markdown });
      await vscode.window.showTextDocument(doc, { preview: true });
    },
    confirmCreate: async (message, detail) =>
      (await vscode.window.showInformationMessage(message, { modal: true, detail }, APPROVE)) === APPROVE,
    editPurpose: async (initial) => vscode.window.showInputBox({
      title: 'Intent purpose',
      prompt: `Why this work is being done (at most ${MAX_PURPOSE} characters)`,
      value: initial,
      ignoreFocusOut: true,
      validateInput: validatePurpose,
    }),
    pickPlanId,
    info: (m) => { void vscode.window.showInformationMessage(m); },
    warn: (m) => { void vscode.window.showWarningMessage(m); },
    error: (m) => { void vscode.window.showErrorMessage(m); },
  };
}

/** The earlier-import note for a key the tracker no longer returns (404). */
export function earlierImportNote(externalRef: string): Promise<string | undefined> {
  const deps = getTrackerIntentDeps();
  return deps ? describeEarlierImport(deps.intents, externalRef) : Promise.resolve(undefined);
}

/** Review a fetched issue; preview-only until governance has installed the intent deps. */
export async function reviewTrackerIssue(issue: TrackerIssue, ui: ImportReviewUi): Promise<TrackerImportResult> {
  const deps = getTrackerIntentDeps();
  if (!deps) {
    await ui.showPreview(previewMarkdown(issue));
    ui.info(`Previewed ${issue.key}. ${DRAFTS_UNAVAILABLE}`);
    return { outcome: 'previewed' };
  }
  return reviewAndImport(issue, { ...deps, ui });
}
