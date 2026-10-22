import { Request, Response } from 'express';
import { RouteDeps } from './index';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';

interface ModeView { mode: string; defaulted: boolean; }

function readModeState(engine: any): ModeView {
  if (engine && typeof engine.getGovernanceModeState === 'function') {
    const s = engine.getGovernanceModeState();
    return { mode: String(s?.mode ?? 'enforce'), defaulted: Boolean(s?.defaulted) };
  }
  const legacy = engine?.getGovernanceMode?.() ?? 'enforce';
  return { mode: String(legacy), defaulted: false };
}

export const SettingsRoute = {
  render(req: Request, res: Response, deps: RouteDeps): void {
    const settings = deps.configProfile.getAll();
    const state = readModeState(deps.enforcementEngine);
    const defaultedTag = state.defaulted ? ' <em>(default)</em>' : '';

    const rows = settings.map(s =>
      `<tr><td>${escapeHtml(s.key)}</td><td>${escapeHtml(String(s.value))}</td><td>${escapeHtml(s.source)}</td></tr>`
    ).join('');

    res.send(`<!DOCTYPE html><html><head><title>Settings</title></head><body>
      <h1>Configuration</h1>
      <p>Governance Mode: <strong>${escapeHtml(state.mode)}</strong>${defaultedTag}</p>
      <table><thead><tr><th>Key</th><th>Value</th><th>Source</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <a href="/console/home">Back</a>
    </body></html>`);
  },
};
