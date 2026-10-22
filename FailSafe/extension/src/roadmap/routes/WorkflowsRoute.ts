import { Request, Response } from 'express';
import { RouteDeps } from './index';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';
import { renderEmptyState } from '../../genesis/EmptyStates';

export const WorkflowsRoute = {
  render(req: Request, res: Response, deps: RouteDeps): void {
    const plans = deps.planManager.getAllPlans();
    if (plans.length === 0) {
      res.send(renderEmptyState('no-runs'));
      return;
    }

    const rows = plans.map(p =>
      `<tr><td><a href="/console/run/${escapeHtml(encodeURIComponent(p.id))}">${escapeHtml(p.id)}</a></td><td>${escapeHtml(p.title)}</td></tr>`
    ).join('');

    res.send(`<!DOCTYPE html><html><head><title>Workflows</title></head><body>
      <h1>All Plans</h1>
      <table><thead><tr><th>Plan ID</th><th>Title</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <a href="/console/home">Back</a>
    </body></html>`);
  },
};
