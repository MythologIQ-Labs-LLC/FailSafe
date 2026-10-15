/**
 * ISecretStore - Abstracts vscode.ExtensionContext.secrets
 *
 * Provides a platform-agnostic interface for secure secret storage,
 * decoupling services from the VS Code SecretStorage API.
 */

export interface ISecretStore {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    /** Called with the key whenever a secret changes, in this window or another. */
    onDidChange?(listener: (key: string) => void): { dispose(): void };
}
