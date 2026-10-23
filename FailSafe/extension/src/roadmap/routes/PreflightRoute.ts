import { Request, Response } from 'express';
import { PermissionScopeManager } from '../../governance/PermissionScopeManager';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';

interface PreflightDeps {
  permissionManager: PermissionScopeManager;
}

export const PreflightRoute = {
  render(req: Request, res: Response, deps: PreflightDeps): void {
    const scopes = deps.permissionManager.getAllRequestedScopes();

    const rows = scopes.map(s =>
      `<tr>
        <td>${escapeHtml(s.id)}</td>
        <td>${s.active ? 'Granted' : 'Denied'}</td>
        <td>${escapeHtml(s.grantedAt)}</td>
        <td>
          <form method="POST" action="/console/preflight/grant" style="display:inline">
            <input type="hidden" name="scopeId" value="${escapeHtml(s.id)}"/>
            <button type="submit">Grant</button>
          </form>
          <form method="POST" action="/console/preflight/deny" style="display:inline">
            <input type="hidden" name="scopeId" value="${escapeHtml(s.id)}"/>
            <button type="submit">Deny</button>
          </form>
        </td>
      </tr>`
    ).join('');

    res.send(`<!DOCTYPE html><html><head><title>Permission Preflight</title></head><body>
      <h1>Permission Preflight</h1>
      <table>
        <thead><tr><th>Scope</th><th>Status</th><th>Granted At</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <a href="/console/home">Back</a>
    </body></html>`);
  },

  handleGrant(req: Request, res: Response, deps: PreflightDeps): void {
    const scopeId = req.body?.scopeId;
    if (!scopeId || typeof scopeId !== 'string') {
      res.status(400).send('Missing scopeId');
      return;
    }
    deps.permissionManager.grant(scopeId);
    res.redirect('/console/preflight');
  },

  handleDeny(req: Request, res: Response, deps: PreflightDeps): void {
    const scopeId = req.body?.scopeId;
    if (!scopeId || typeof scopeId !== 'string') {
      res.status(400).send('Missing scopeId');
      return;
    }
    deps.permissionManager.deny(scopeId);
    res.redirect('/console/preflight');
  },
};
