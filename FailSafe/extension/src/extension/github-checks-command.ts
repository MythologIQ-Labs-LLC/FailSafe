/**
 * github-checks-command — registers `FailSafe: Publish SHIELD Verdict to GitHub
 * Check` (#96). Until native gate attestation is available, this command can
 * publish a NEUTRAL manual advisory only, never an unverified SHIELD PASS (#476).
 * Off-by-default; requires an opt-in token. No secret is logged.
 */

import * as vscode from 'vscode';
import { execFileSync } from 'child_process';
import { publishCheckRunPayload, defaultGitHubPost, defaultGitHubGet, type GitContext } from '../integrations/github-checks/github-checks-client';
import { publishLinkageCheck } from '../integrations/github-checks/pr-linkage-publish';
import { buildManualAdvisoryPayload, parseRepoSlug } from '../integrations/github-checks/github-checks-map';

function git(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 }).trim() || undefined;
  } catch { return undefined; }
}

/** Best-effort PR number for HEAD via the gh CLI (read-only). Undefined if no PR. */
function resolvePrNumber(cwd: string): number | undefined {
  try {
    const out = execFileSync('gh', ['pr', 'view', '--json', 'number', '-q', '.number'], { cwd, encoding: 'utf8', timeout: 8000 }).trim();
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

export function registerGitHubChecksCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.github.publishCheck', async () => {
      const cfg = vscode.workspace.getConfiguration('failsafe');
      const enabled = cfg.get<boolean>('integrations.github.enabled', false);
      const token = cfg.get<string>('integrations.github.token', '');
      if (!enabled || !token) {
        vscode.window.showWarningMessage(
          'GitHub Checks publishing is disabled. Enable `failsafe.integrations.github.enabled` and set a `failsafe.integrations.github.token` (App installation token or a PAT with checks:write).',
        );
        return;
      }
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

      const apiBaseUrl = cfg.get<string>('integrations.github.apiBaseUrl', '') || undefined;
      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Publishing manual GitHub advisory…' },
        () => publishCheckRunPayload(
          buildManualAdvisoryPayload(ctx.headSha!),
          ctx,
          { enabled, token, apiBaseUrl },
          defaultGitHubPost,
        ),
      );

      if (result.localOnly) {
        vscode.window.showWarningMessage(`No GitHub advisory was published (${result.error ?? 'unavailable'}).`);
      } else if (result.ok) {
        vscode.window.showInformationMessage(`Published neutral manual advisory (not a verified SHIELD PASS)${result.checkRunId ? ` (run #${result.checkRunId})` : ''}.`);
      } else {
        vscode.window.showErrorMessage(`GitHub advisory publish failed: ${result.error ?? 'unknown error'}`);
      }

      // #154: also publish the PR↔issue linkage check when HEAD has a PR — the
      // `Closes #1, #2` footgun guard, beside the SHIELD verdict.
      const slug = parseRepoSlug(ctx.remoteUrl || '');
      const prNumber = resolvePrNumber(root);
      if (slug && prNumber) {
        const linkage = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Publishing PR-linkage check…' },
          () => publishLinkageCheck({
            ctx, opts: { enabled, token, apiBaseUrl }, owner: slug.owner, repo: slug.repo,
            prNumber, get: defaultGitHubGet, post: defaultGitHubPost,
          }),
        );
        if (!linkage.localOnly && linkage.ok) {
          vscode.window.showInformationMessage(`Published PR-linkage check to GitHub${linkage.checkRunId ? ` (run #${linkage.checkRunId})` : ''}.`);
        } else if (!linkage.ok) {
          vscode.window.showWarningMessage(`PR-linkage check skipped: ${linkage.error ?? 'unknown error'}.`);
        }
      }
    }),
  );
}
