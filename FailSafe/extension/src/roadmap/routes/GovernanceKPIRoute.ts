import { Request, Response } from 'express';
import { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';

interface KPIDeps {
  ledgerManager: LedgerManager;
}

export const GovernanceKPIRoute = {
  async render(req: Request, res: Response, deps: KPIDeps): Promise<void> {
    const entries = await deps.ledgerManager.getRecentEntries(500);

    const passCount = entries.filter(e => e.eventType === 'AUDIT_PASS').length;
    const failCount = entries.filter(e => e.eventType === 'AUDIT_FAIL').length;
    const totalAudits = passCount + failCount;
    const passRate = totalAudits > 0 ? ((passCount / totalAudits) * 100).toFixed(1) : '0.0';

    const quarantines = entries.filter(e => e.eventType === 'QUARANTINE_START').length;
    const releases = entries.filter(e => e.eventType === 'RELEASE_PUBLISHED').length;

    const riskDistribution: Record<string, number> = {};
    for (const entry of entries) {
      const grade = (entry as unknown as { riskGrade?: string }).riskGrade ?? 'unknown';
      riskDistribution[grade] = (riskDistribution[grade] ?? 0) + 1;
    }

    const riskRows = Object.entries(riskDistribution)
      .map(([grade, count]) => `<tr><td>${escapeHtml(grade)}</td><td>${count}</td></tr>`)
      .join('');

    res.send(`<!DOCTYPE html><html><head><title>Governance KPIs</title></head><body>
      <h1>Governance KPIs</h1>
      <ul>
        <li>Audit Pass Rate: ${passRate}%</li>
        <li>Total Audits: ${totalAudits}</li>
        <li>Quarantine Events: ${quarantines}</li>
        <li>Releases Published: ${releases}</li>
      </ul>
      <h2>Risk Distribution</h2>
      <table><thead><tr><th>Grade</th><th>Count</th></tr></thead>
      <tbody>${riskRows}</tbody></table>
      <a href="/console/home">Back</a>
    </body></html>`);
  },
};
