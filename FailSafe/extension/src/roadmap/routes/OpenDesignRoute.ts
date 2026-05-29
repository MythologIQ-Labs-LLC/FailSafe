/**
 * OpenDesignRoute — HTTP surface for governed Open Design write tools (B-OD-8).
 *
 * v1.2 conservative scope: the single non-destructive write tool
 * `create_artifact` is admitted ONLY through L3 approval. This route NEVER
 * invokes the Open Design client directly — it enqueues an L3 approval item
 * carrying the buffered call (`kind:'open-design-create-artifact'`,
 * `meta:{tool, args}`) and returns 409 pending. The actual execution happens
 * in OpenDesignL3Executor after an APPROVED l3Decided event (Buffer &
 * auto-execute). The 3 destructive tools have no route — they remain rejected
 * at the client gate.
 */

import type { Application, Request, Response } from 'express';
import type { OpenDesignMcpClient } from '../../integrations/open-design/OpenDesignMcpClient';
import type { L3ApprovalRequest } from '../../shared/types/l3-approval';
import { OPEN_DESIGN_CREATE_ARTIFACT_KIND } from '../../integrations/open-design/OpenDesignMcpAllowlist';

export { OPEN_DESIGN_CREATE_ARTIFACT_KIND };

export interface OpenDesignRouteDeps {
  rejectIfRemote: (req: Request, res: Response) => boolean;
  broadcast?: (data: Record<string, unknown>) => void;
  getOpenDesignClient: () => OpenDesignMcpClient | null;
  /** Mirrors L3ApprovalService.queueL3Approval (via QorLogicManager). */
  queueL3Approval: (
    request: Omit<L3ApprovalRequest, 'id' | 'state' | 'queuedAt' | 'slaDeadline'>,
  ) => Promise<string>;
}

export function setupOpenDesignRoutes(app: Application, deps: OpenDesignRouteDeps): void {
  // B-OD-8: request an Open Design create_artifact. Enqueues an L3 item and
  // returns 409 pending; never executes the call here.
  app.post(
    '/api/actions/open-design-create-artifact',
    async (req: Request, res: Response) => {
      if (deps.rejectIfRemote(req, res)) return;

      const args = req.body?.args;
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        res.status(400).json({ ok: false, error: 'args (object) required' });
        return;
      }

      // Surface daemon-not-connected early so the operator isn't told a call is
      // pending when the executor could never run it.
      if (!deps.getOpenDesignClient()) {
        res.status(503).json({ ok: false, error: 'Open Design MCP client not connected' });
        return;
      }

      const filePath =
        typeof (args as { path?: unknown }).path === 'string'
          ? (args as { path: string }).path
          : 'open-design:create_artifact';

      const approvalId = await deps.queueL3Approval({
        filePath,
        riskGrade: 'L3',
        agentDid: 'did:failsafe:agent:mcp',
        agentTrust: 0,
        sentinelSummary: 'Open Design create_artifact pending L3 approval (B-OD-8)',
        flags: ['open-design-write'],
        kind: OPEN_DESIGN_CREATE_ARTIFACT_KIND,
        meta: { tool: 'create_artifact', args },
      });

      deps.broadcast?.({
        type: 'open-design.create_artifact.pending',
        payload: { approvalId },
      });
      res.status(409).json({ ok: false, pending: true, approvalId });
    },
  );
}
