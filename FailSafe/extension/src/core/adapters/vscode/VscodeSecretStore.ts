/**
 * VscodeSecretStore - VS Code adapter for ISecretStore
 *
 * Wraps vscode.ExtensionContext.secrets to provide secure
 * secret storage through the platform-agnostic ISecretStore interface.
 */

import * as vscode from 'vscode';
import { ISecretStore } from '../../interfaces';

export class VscodeSecretStore implements ISecretStore {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async get(key: string): Promise<string | undefined> {
        return this.context.secrets.get(key);
    }

    async store(key: string, value: string): Promise<void> {
        await this.context.secrets.store(key, value);
    }

    async delete(key: string): Promise<void> {
        await this.context.secrets.delete(key);
    }

    onDidChange(listener: (key: string) => void): { dispose(): void } {
        return this.context.secrets.onDidChange((e) => listener(e.key));
    }
}
