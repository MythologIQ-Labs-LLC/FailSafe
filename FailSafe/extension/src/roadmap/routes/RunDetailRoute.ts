import { Request, Response } from 'express';
import { RouteDeps } from './index';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';

export const RunDetailRoute = {
  render(req: Request, res: Response, deps: RouteDeps): void {
    const runId = String(req.params.runId);
    const plan = deps.planManager.getPlan(runId);
    if (!plan) {
      res.status(404).send('Plan not found');
      return;
    }
    const progress = deps.planManager.getPlanProgress(runId);

    res.send(`<!DOCTYPE html><html><head><title>Run Detail</title></head><body>
      <h1>Plan: ${escapeHtml(plan.id)}</h1>
      <p>Title: ${escapeHtml(plan.title)}</p>
      <h2>Progress</h2>
      <p>Completed: ${progress.completed} / ${progress.total} | Blocked: ${progress.blocked}</p>
      <a href="/console/home">Back to Dashboard</a>
    </body></html>`);
  },
};
