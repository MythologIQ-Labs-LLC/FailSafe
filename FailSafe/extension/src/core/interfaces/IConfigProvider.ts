/**
 * IConfigProvider - Abstracts vscode.workspace.getConfiguration
 *
 * Provides a platform-agnostic interface for configuration access,
 * decoupling services from the VS Code configuration API and
 * sentinel.yaml file reading.
 */

import { FailSafeConfig } from '../../shared/types';

export interface IConfigProvider {
    getConfig(): FailSafeConfig;
    getWorkspaceRoot(): string | undefined;
    getFailSafeDir(): string;
    getLedgerPath(): string;
    getFeedbackDir(): string;
    getSentinelConfigPath(): string;
    onConfigChange(callback: (config: FailSafeConfig) => void): () => void;
    /**
     * Whether `governance.mode` was explicitly set by the user (VS Code
     * setting at any scope, or sentinel.yaml) rather than resolved from the
     * package.json schema default. `getConfig().governance.mode` always
     * returns a concrete mode string — VS Code's `get()` cannot distinguish
     * "user chose enforce" from "schema default is enforce" — so callers
     * that need that distinction (e.g. the upgrade-default notice) must use
     * this instead of inferring it from the resolved value.
     *
     * Optional: providers that cannot determine explicitness (e.g. the ACP
     * proxy's file-backed mirror) omit it; callers must treat an absent
     * implementation as "cannot determine" rather than assuming either way.
     */
    isGovernanceModeExplicit?(): boolean;
}
