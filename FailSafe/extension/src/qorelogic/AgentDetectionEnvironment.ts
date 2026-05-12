/**
 * AgentDetectionEnvironment - probes for runtime detection signals.
 *
 * Abstracts the host (VS Code) so weighted detection can be unit-tested with
 * a fake. Production code uses VsCodeDetectionEnvironment.
 */

import * as vscode from "vscode";

export interface DetectionEnvironment {
  /** True when an extension with exactly this id is installed. */
  hasExtensionId(id: string): boolean;
  /** True when an installed extension's metadata contains this keyword. */
  matchesExtensionKeyword(keyword: string): boolean;
  /** True when the host application name contains this substring. */
  matchesHostAppName(name: string): boolean;
}

export class VsCodeDetectionEnvironment implements DetectionEnvironment {
  hasExtensionId(id: string): boolean {
    const wanted = id.toLowerCase();
    return vscode.extensions.all.some((ext) => ext.id.toLowerCase() === wanted);
  }

  matchesExtensionKeyword(keyword: string): boolean {
    const needle = keyword.toLowerCase();
    return vscode.extensions.all.some((ext) => {
      const name = (ext.packageJSON.name ?? "").toLowerCase();
      const displayName = (ext.packageJSON.displayName ?? "").toLowerCase();
      const description = (ext.packageJSON.description ?? "").toLowerCase();
      return (
        name.includes(needle) ||
        displayName.includes(needle) ||
        description.includes(needle)
      );
    });
  }

  matchesHostAppName(name: string): boolean {
    return vscode.env.appName.toLowerCase().includes(name.toLowerCase());
  }
}
