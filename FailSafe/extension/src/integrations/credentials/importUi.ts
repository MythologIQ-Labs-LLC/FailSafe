/**
 * importUi - the window surface the import commands need, injectable so the
 * credential paths are testable without VS Code (#482, FX965).
 */

import type { CredentialUi } from './credentialGates';

export interface ImportUi extends CredentialUi {
  error(message: string): void;
  info(message: string): void;
  progress<T>(title: string, task: () => Promise<T>): PromiseLike<T>;
}
