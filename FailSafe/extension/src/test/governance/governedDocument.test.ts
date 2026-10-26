// FX948 (#504): editor-save governance evaluates only workspace files. User-profile
// documents (settings.json is `vscode-userdata:`), untitled buffers, and files outside
// every workspace folder must not reach GovernanceRouter.handleFileOperation.
import { strict as assert } from "assert";
import { describe, it } from "mocha";
import { isGovernedSave, shouldShowEditorSaveLimitation, EDITOR_SAVE_LIMITATION_NOTICE } from "../../governance/governedDocument";

const insideWorkspace = (uri: { fsPath: string }) => uri.fsPath.startsWith("/repo/");

describe("isGovernedSave (FX948)", () => {
  it("governs a file-scheme document inside a workspace folder", () => {
    assert.equal(isGovernedSave({ scheme: "file", fsPath: "/repo/src/index.ts" }, insideWorkspace), true);
  });

  it("does not govern the user settings document (vscode-userdata scheme)", () => {
    const settings = { scheme: "vscode-userdata", fsPath: "/repo/User/settings.json" };
    assert.equal(isGovernedSave(settings, () => true), false, "scheme alone excludes it, even if a folder claims it");
  });

  it("does not govern a file-scheme document outside every workspace folder", () => {
    assert.equal(isGovernedSave({ scheme: "file", fsPath: "/home/me/notes.md" }, insideWorkspace), false);
  });

  it("does not govern an untitled buffer", () => {
    assert.equal(isGovernedSave({ scheme: "untitled", fsPath: "Untitled-1" }, () => true), false);
  });
});

describe("Editor-save enforcement limitation (#505)", () => {
  it("discloses capability limitation in unacknowledged Enforce mode", () => {
    assert.equal(shouldShowEditorSaveLimitation("enforce", false), true);
  });
  it("does not repeat an acknowledged disclosure", () => {
    assert.equal(shouldShowEditorSaveLimitation("enforce", true), false);
  });
  it("does not surface as an Enforce notice in Observe or Assist", () => {
    for (const mode of ["observe", "assist", "unknown"]) {
      assert.equal(shouldShowEditorSaveLimitation(mode, false), false);
    }
  });
  it("does not falsely promise ordinary editor save blocking", () => {
    assert.match(EDITOR_SAVE_LIMITATION_NOTICE, /cannot block ordinary VS Code editor saves/);
    assert.match(EDITOR_SAVE_LIMITATION_NOTICE, /may still be written to disk/);
    assert.doesNotMatch(EDITOR_SAVE_LIMITATION_NOTICE, /save was blocked|write prevented/i);
  });
});
