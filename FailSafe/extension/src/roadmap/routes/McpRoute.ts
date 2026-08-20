import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { assessCatalog, MCP_CATALOG } from '../../integrations/mcp-catalog/mcp-catalog';
import { mergeMcpConfig } from '../../integrations/mcp-catalog/mcp-installer';

/**
 * McpRoute — backs the Integrations-tab MCP catalog surface (B-INT-13/14).
 *
 *   GET  /api/v1/mcp/catalog   → catalog entries + #108 risk assessment
 *   POST /api/actions/mcp-install { id } → governed write into .mcp.json
 *
 * The browser button shows the risk + requires a confirm click before POSTing,
 * so the install stays operator-confirmed (no-ship rule) even from the console.
 */

export interface McpRouteDeps { workspaceRoot: string }

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

  install(req: Request, res: Response, deps: McpRouteDeps): void {
    const id = (req.body && (req.body as { id?: string }).id) || '';
    const entry = MCP_CATALOG.find((e) => e.id === id);
    if (!entry) {
      res.status(404).json({ error: `unknown MCP catalog id: ${id}` });
      return;
    }
    const cfgPath = path.join(deps.workspaceRoot, '.mcp.json');
    let existing = '';
    try { existing = fs.readFileSync(cfgPath, 'utf-8'); } catch { /* none */ }
    try {
      const merged = mergeMcpConfig(existing, entry);
      if (!merged.ok) {
        res.status(409).json({
          ok: false,
          error: 'existing .mcp.json is unparseable — nothing was written; fix or remove it and retry',
        });
        return;
      }
      fs.writeFileSync(cfgPath, merged.text);
      res.json({ ok: true, added: merged.added, id });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  },
};
