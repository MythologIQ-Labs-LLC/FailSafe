import { Request, Response } from 'express';
import { RouteDeps } from './index';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';

export const ReportsRoute = {
  async render(req: Request, res: Response, deps: RouteDeps): Promise<void> {
    const entries = await deps.ledgerManager.getRecentEntries(200);
    const passCount = entries.filter(e => e.eventType === 'AUDIT_PASS').length;
    const failCount = entries.filter(e => e.eventType === 'AUDIT_FAIL').length;

    const rows = entries.map(e =>
      `<tr><td>${escapeHtml(e.timestamp)}</td><td>${escapeHtml(e.eventType)}</td><td>${escapeHtml(e.agentDid)}</td></tr>`
    ).join('');

    res.send(`<!DOCTYPE html><html><head><title>Reports</title></head><body>
      <h1>Governance Reports</h1>
      <p>PASS: ${passCount} | FAIL: ${failCount} | Total: ${entries.length}</p>
      <table><thead><tr><th>Time</th><th>Event</th><th>Agent</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <a href="/console/home">Back</a>
    </body></html>`);
  },
};
