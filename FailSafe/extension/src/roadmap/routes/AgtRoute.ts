import { Request, Response } from 'express';
import * as fs from 'fs';
import { AGT_MODULES, detectEnvironment, agtPreviewNotice } from '../../integrations/agt/agt-catalog';

/**
 * AgtRoute — backs the Integrations-tab Agent Governance Toolkit surface (B-INT-16).
 *
 *   GET  /api/v1/agt/modules            → modules + detected workspace environment
 *   POST /api/actions/agt-install { id } → run the verified install command in an
 *                                          integrated terminal (pre-filled; the
 *                                          operator presses enter — no silent run)
 *
 * The terminal bridge is an injected dep (`runInTerminal`) wired by the host to
 * vscode.window.createTerminal(...).sendText(cmd, /*addNewLine*\/ false); 503
 * when unwired. Copy-only modules (Claude Code slash commands) are 400 here —
 * the UI copies them instead of running them.
 */

export interface AgtRouteDeps {
  workspaceRoot: string;
  /** Pre-fill an integrated terminal with `command` (NOT auto-executed). */
  runInTerminal?: (name: string, command: string) => void;
}

function listRootEntries(workspaceRoot: string): string[] {
  try {
    return fs.readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export const AgtRoute = {
  modules(_req: Request, res: Response, deps: AgtRouteDeps): void {
    const detected = detectEnvironment(listRootEntries(deps.workspaceRoot));
    const detectedSet = new Set(detected);
    res.json({
      preview: agtPreviewNotice(),
      detected,
      modules: AGT_MODULES.map((m) => ({
        id: m.id,
        label: m.label,
        env: m.env,
        kind: m.kind,
        command: m.command,
        registry: m.registry,
        runnable: m.runnable,
        status: m.status,
        note: m.note,
        recommended: detectedSet.has(m.id),
      })),
    });
  },

  install(req: Request, res: Response, deps: AgtRouteDeps): void {
    const id = (req.body && (req.body as { id?: string }).id) || '';
    const mod = AGT_MODULES.find((m) => m.id === id);
    if (!mod) {
      res.status(404).json({ ok: false, error: `unknown AGT module id: ${id}` });
      return;
    }
    if (!mod.runnable) {
      res.status(400).json({ ok: false, error: `${mod.label} installs via slash commands inside the agent, not a terminal — copy the command instead.` });
      return;
    }
    if (!deps.runInTerminal) {
      res.status(503).json({ ok: false, error: 'runInTerminal not wired' });
      return;
    }
    try {
      deps.runInTerminal(`AGT: ${mod.label}`, mod.command);
      res.json({ ok: true, id, ran: mod.command });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
};
