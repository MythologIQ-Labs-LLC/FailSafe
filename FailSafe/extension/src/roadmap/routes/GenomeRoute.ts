import { Request, Response } from 'express';
import { RouteDeps } from './index';
import { renderEmptyState } from '../../genesis/EmptyStates';

export const GenomeRoute = {
  async render(req: Request, res: Response, deps: RouteDeps): Promise<void> {
    const availability = deps.shadowGenomeManager.getAvailability();
    if (!availability.available) {
      res.send(renderEmptyState('shadow-genome-unavailable', availability.message));
      return;
    }

    const patterns = await deps.shadowGenomeManager.analyzeFailurePatterns();
    const unresolved = await deps.shadowGenomeManager.getUnresolvedEntries(50);

    if (patterns.length === 0 && unresolved.length === 0) {
      res.send(renderEmptyState('no-failures'));
      return;
    }

    const patternRows = patterns.map(p =>
      `<tr><td>${p.failureMode}</td><td>${p.count}</td></tr>`
    ).join('');

    const unresolvedRows = unresolved.map(u =>
      `<tr><td>${u.id}</td><td>${u.failureMode}</td><td>${u.remediationStatus}</td></tr>`
    ).join('');

    res.send(`<!DOCTYPE html><html><head><title>Shadow Genome</title></head><body>
      <h1>Failure Pattern Archive</h1>
      <table><thead><tr><th>Mode</th><th>Count</th></tr></thead><tbody>${patternRows}</tbody></table>
      <h2>Unresolved Entries</h2>
      <table><thead><tr><th>ID</th><th>Mode</th><th>Status</th></tr></thead><tbody>${unresolvedRows}</tbody></table>
      <a href="/console/home">Back</a>
    </body></html>`);
  },
};
