import * as vscode from "vscode";
import type { ConsoleTheme, ConsoleThemeStore } from "../roadmap/services/ConsoleThemeAuthority";

/**
 * #601: the `failsafe.console.theme` setting as the persistent store behind the Console theme
 * authority. The setting is application-scoped, so it lives only in user settings: one value
 * for every window and workspace, kept across reloads and restarts, and changes made in the
 * Settings UI or another window reach every open Console and Monitor.
 */
const SECTION = "failsafe";
const KEY = "console.theme";

export function consoleThemeSettingStore(): ConsoleThemeStore {
  return {
    read() {
      const info = vscode.workspace.getConfiguration(SECTION).inspect<string>(KEY);
      const explicit = info?.globalValue !== undefined;
      return { value: explicit ? info?.globalValue : info?.defaultValue, explicit };
    },
    async write(theme: ConsoleTheme) {
      await vscode.workspace.getConfiguration(SECTION).update(KEY, theme, vscode.ConfigurationTarget.Global);
    },
    onExternalChange(listener) {
      return vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${SECTION}.${KEY}`)) listener();
      });
    },
  };
}
