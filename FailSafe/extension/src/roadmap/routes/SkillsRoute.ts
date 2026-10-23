import { Request, Response } from 'express';
import { RouteDeps } from './index';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';
import { renderEmptyState } from '../../genesis/EmptyStates';

export const SkillsRoute = {
  render(req: Request, res: Response, deps: RouteDeps): void {
    const skills = deps.getInstalledSkills();
    if (skills.length === 0) {
      res.send(renderEmptyState('no-skills'));
      return;
    }

    const rows = (skills as Array<{ name: string; version?: string }>).map(s =>
      `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.version ?? '-')}</td></tr>`
    ).join('');

    res.send(`<!DOCTYPE html><html><head><title>Skills</title></head><body>
      <h1>Installed Skills</h1>
      <table><thead><tr><th>Name</th><th>Version</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <a href="/console/home">Back</a>
    </body></html>`);
  },
};
