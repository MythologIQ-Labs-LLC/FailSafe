// FX948 (#504): editor-save governance evaluates only workspace files. User-profile
// documents (settings.json is `vscode-userdata:`), untitled buffers, and files outside
// every workspace folder must not reach GovernanceRouter.handleFileOperation.
import { strict as assert } from "assert";
import { describe, it } from "mocha";
import { isGovernedSave } from "../../governance/governedDocument";

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
