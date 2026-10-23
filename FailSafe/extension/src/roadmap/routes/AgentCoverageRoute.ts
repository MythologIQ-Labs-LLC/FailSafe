import { Request, Response } from 'express';
import { SystemRegistry, AgentLandscape } from '../../qorelogic/SystemRegistry';
import { escapeHtml } from '../../shared/utils/htmlSanitizer';

interface AgentCoverageDeps {
  systemRegistry: SystemRegistry;
}

async function renderLandscape(landscape: AgentLandscape, registry: SystemRegistry): Promise<string> {
  const systemRows: string[] = [];
  for (const system of landscape.registeredSystems) {
    const manifest = system.getManifest();
    const detection = await registry.detect(system);
    const governed = registry.hasGovernance(system);
    systemRows.push(
      `<tr><td>${escapeHtml(manifest.name)}</td><td>${detection.detected ? 'Yes' : 'No'}</td><td>${governed ? 'Yes' : 'No'}</td></tr>`,
    );
  }

  const terminalRows = landscape.activeTerminals
    .map((t) => `<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.agentType)}</td><td>${t.terminalIndex}</td></tr>`)
    .join('');

  const teamsStatus = landscape.agentTeams.enabled ? 'Enabled' : 'Disabled';

  return `<!DOCTYPE html><html><head><title>Agent Coverage</title></head><body>
    <h1>Agent Coverage</h1>
    <h2>Registered Systems</h2>
    <table><thead><tr><th>Name</th><th>Installed</th><th>Governed</th></tr></thead>
    <tbody>${systemRows.join('')}</tbody></table>
    <h2>Active Terminals</h2>
    <table><thead><tr><th>Name</th><th>Type</th><th>Index</th></tr></thead>
    <tbody>${terminalRows}</tbody></table>
    <h2>Agent Teams</h2>
    <p>Status: ${teamsStatus}</p>
    <p>Settings: ${escapeHtml(landscape.agentTeams.settingsPath)}</p>
    <a href="/console/home">Back</a>
  </body></html>`;
}

export const AgentCoverageRoute = {
  async render(req: Request, res: Response, deps: AgentCoverageDeps): Promise<void> {
    const landscape = await deps.systemRegistry.detectAll();
    const html = await renderLandscape(landscape, deps.systemRegistry);
    res.send(html);
  },
};
