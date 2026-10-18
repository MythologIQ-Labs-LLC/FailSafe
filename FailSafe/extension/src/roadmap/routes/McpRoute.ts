import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { assessCatalog, MCP_CATALOG } from '../../integrations/mcp-catalog/mcp-catalog';
import { mergeMcpConfig } from '../../integrations/mcp-catalog/mcp-installer';
import { consoleRequestGuard } from './consoleRequestGuard';
import { authorizeOperatorAction, authorizationFields, newInstallLimiter, type OperatorActionDeps } from './installAuthorization';

/**
 * McpRoute — backs the Integrations-tab MCP catalog surface (B-INT-13/14).
 *
 *   GET  /api/v1/mcp/catalog   → catalog entries + #108 risk assessment
 *   POST /api/actions/mcp-install { id } → governed write into .mcp.json
 *
 * #538: the install writes only after the operator approves the server-built entry in a
 * modal VS Code dialog (the browser's two clicks are UX, not the control).
 */

export interface McpRouteDeps extends OperatorActionDeps {
  workspaceRoot: string;
  rejectIfRemote: (req: Request, res: Response) => boolean;
}

export const MCP_INSTALL_PATH = '/api/actions/mcp-install';

export const McpRoute = {
  catalog(_req: Request, res: Response): void {
    res.json({
      entries: assessCatalog().map((a) => ({
        id: a.entry.id,
        name: a.entry.name,
        description: a.entry.description,
        install: a.entry.install,
        risk: a.assessment,
      })),
    });
  },

  async install(req: Request, res: Response, deps: McpRouteDeps): Promise<void> {
    const id = (req.body && (req.body as { id?: string }).id) || '';
    const entry = MCP_CATALOG.find((e) => e.id === id);
    if (!entry) {
      res.status(404).json({ error: `unknown MCP catalog id: ${id}` });
      return;
    }
    const approved = await authorizeOperatorAction(deps, res, { kind: 'mcp-install', entry, configFile: '.mcp.json' }, MCP_INSTALL_PATH);
    if (!approved) return;
    const cfgPath = path.join(deps.workspaceRoot, approved.operation.configFile);
    let existing = '';
    try { existing = fs.readFileSync(cfgPath, 'utf-8'); } catch { /* none */ }
    try {
      const merged = mergeMcpConfig(existing, approved.operation.entry);
      if (!merged.ok) {
        res.status(409).json({
          ok: false,
          ...authorizationFields(approved),
          error: 'existing .mcp.json is unparseable — nothing was written; fix or remove it and retry',
        });
        return;
      }
      fs.writeFileSync(cfgPath, merged.text);
      res.json({ ok: true, added: merged.added, id: approved.operation.entry.id, ...authorizationFields(approved) });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e), ...authorizationFields(approved) });
    }
  },
};

/** #538: guard (loopback, Host, Origin, JSON) before the limiter, then the gated install. */
export function setupMcpInstallRoute(
  app: import('express').Application,
  deps: McpRouteDeps,
  limiter = newInstallLimiter(),
): void {
  app.post(MCP_INSTALL_PATH, consoleRequestGuard((req, res) => deps.rejectIfRemote(req, res)), limiter, (req, res) => McpRoute.install(req, res, deps));
}
