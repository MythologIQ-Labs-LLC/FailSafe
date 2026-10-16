/**
 * github-checks-command — registers `FailSafe: Publish SHIELD Verdict to GitHub
 * Check` (#96). Until native gate attestation is available, this command can
 * publish a NEUTRAL manual advisory only, never an unverified SHIELD PASS (#476).
 * Off-by-default; requires an opt-in token stored in Secure Storage (#482).
 * The token is never read from settings, never logged, and never sent to an
 * API base URL that workspace settings chose under a user-level token.
 */

import * as vscode from 'vscode';
import { execFileSync } from 'child_process';
import { publishCheckRunPayload, defaultGitHubPost, defaultGitHubGet, type GitContext } from '../integrations/github-checks/github-checks-client';
import { publishLinkageCheck } from '../integrations/github-checks/pr-linkage-publish';
import { buildManualAdvisoryPayload, parseRepoSlug } from '../integrations/github-checks/github-checks-map';
import { providerMessage, type IntegrationCredentials } from '../integrations/credentials/IntegrationCredentials';
import {
  disabledMessage, providerConnection, setCommandHint, type CredentialUi, type EndpointReader,
} from '../integrations/credentials/credentialGates';
import { credentialUi } from './credentials-command';
import { trustedGitPath } from '../shared/git/trustedGit';
import { GH, trustedExecutablePath } from '../shared/exec/trustedExecutable';

function git(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync(trustedGitPath(cwd), args, { cwd, encoding: 'utf8', timeout: 5000 }).trim() || undefined;
  } catch { return undefined; }
}

/** Best-effort PR number for HEAD via the gh CLI (read-only). Undefined if no PR or no trusted gh (B211). */
export function resolvePrNumber(cwd: string): number | undefined {
  try {
    const out = execFileSync(trustedExecutablePath(GH, cwd), ['pr', 'view', '--json', 'number', '-q', '.number'], { cwd, encoding: 'utf8', timeout: 8000 }).trim(); // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- the trusted resolver's validated absolute gh path, argv array, no shell
    const n = parseInt(out, 10);
    return Number.isFinite(n) ? n : undefined;
  } catch { return undefined; }
}

function readGitContext(cwd: string): GitContext {
  return {
    remoteUrl: git(['remote', 'get-url', 'origin'], cwd),
    headSha: git(['rev-parse', 'HEAD'], cwd),
  };
}

export interface GitHubAdvisoryOptions { enabled: boolean; token: string; apiBaseUrl?: string }

export interface GitHubAdvisoryDeps {
  creds: IntegrationCredentials;
  endpoints: EndpointReader;
  enabled: boolean;
  ui: CredentialUi;
  /** Everything after the credential check: git context, consent, the posts. */
  publish(opts: GitHubAdvisoryOptions): Promise<void>;
}

/** Check enablement and the token/endpoint pair, then hand off to publish. */
export async function runGitHubAdvisory(deps: GitHubAdvisoryDeps): Promise<void> {
  if (!deps.enabled) {
    deps.ui.warn(disabledMessage('GitHub Checks publishing', 'failsafe.integrations.github.enabled', 'GitHub token (App installation token or a PAT with checks:write)'));
    return;
  }
  const notConfigured = `GitHub Checks publishing has no token. ${setCommandHint('GitHub token (App installation token or a PAT with checks:write)')}`;
  const conn = providerConnection(deps.creds, deps.endpoints, 'github', deps.ui, notConfigured);
  if (!conn) return;
  await deps.publish({ enabled: true, token: conn.credential, apiBaseUrl: conn.endpoint });
}

async function publishAdvisory(opts: GitHubAdvisoryOptions, creds: IntegrationCredentials): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { vscode.window.showWarningMessage('No workspace folder open.'); return; }

  const ctx = readGitContext(root);
  if (!ctx.remoteUrl || !ctx.headSha) {
    vscode.window.showWarningMessage('Could not resolve the git origin remote and HEAD — publishing a check requires both.');
    return;
  }

  // A human selection is NOT an independently verified Qor gate. Offer a
  // neutral advisory only; the SHIELD check name remains reserved for a
  // future publisher that validates an exact native receipt (#476).
  const consent = await vscode.window.showWarningMessage(
    'No verified SHIELD audit receipt is available. Only a neutral, non-authoritative manual advisory can be published.',
    { modal: true },
    'Publish advisory',
  );
  if (consent !== 'Publish advisory') return;

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Publishing manual GitHub advisory…' },
    () => publishCheckRunPayload(buildManualAdvisoryPayload(ctx.headSha!), ctx, opts, defaultGitHubPost),
  );
  const error = (e: string | undefined): string => providerMessage(e ?? 'unknown error', creds);

  if (result.localOnly) {
    vscode.window.showWarningMessage(`No GitHub advisory was published (${providerMessage(result.error ?? 'unavailable', creds)}).`);
  } else if (result.ok) {
    vscode.window.showInformationMessage(`Published neutral manual advisory (not a verified SHIELD PASS)${result.checkRunId ? ` (run #${result.checkRunId})` : ''}.`);
  } else {
    vscode.window.showErrorMessage(`GitHub advisory publish failed: ${error(result.error)}`);
  }

  // #154: also publish the PR↔issue linkage check when HEAD has a PR — the
  // `Closes #1, #2` footgun guard, beside the SHIELD verdict.
  const slug = parseRepoSlug(ctx.remoteUrl || '');
  const prNumber = resolvePrNumber(root);
  if (slug && prNumber) {
    const linkage = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Publishing PR-linkage check…' },
      () => publishLinkageCheck({
        ctx, opts, owner: slug.owner, repo: slug.repo,
        prNumber, get: defaultGitHubGet, post: defaultGitHubPost,
      }),
    );
    if (!linkage.localOnly && linkage.ok) {
      vscode.window.showInformationMessage(`Published PR-linkage check to GitHub${linkage.checkRunId ? ` (run #${linkage.checkRunId})` : ''}.`);
    } else if (!linkage.ok) {
      vscode.window.showWarningMessage(`PR-linkage check skipped: ${error(linkage.error)}.`);
    }
  }
}

export function registerGitHubChecksCommand(
  context: vscode.ExtensionContext, creds: IntegrationCredentials, endpoints: EndpointReader,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.github.publishCheck', () => runGitHubAdvisory({
      creds, endpoints,
      enabled: vscode.workspace.getConfiguration('failsafe').get<boolean>('integrations.github.enabled', false),
      ui: credentialUi(),
      publish: (opts) => publishAdvisory(opts, creds),
    })),
  );
}
