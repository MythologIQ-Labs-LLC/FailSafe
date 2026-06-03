/**
 * mcp-catalog — curated, governed catalog of installable MCP integrations
 * (B-INT-13 Context7 + B-INT-14 Mermaid Chart + B-INT-15 Playwright). These are
 * "installer-only" integrations: standard MCP servers whose value is registering
 * them into the workspace MCP config under FailSafe governance. Each entry
 * carries the McpServerMeta consumed by the #108 risk scorer, so admission is
 * risk-rated — and a high-capability server (Playwright: browser automation +
 * arbitrary in-page JS via browser_evaluate) is surfaced as `high` risk, exactly
 * the governance value of curating installs through FailSafe.
 *
 * Install commands are verified (not fabricated): see docs/INTEGRATIONS.md.
 * Pure — no fs/network — so the catalog + its risk assessment are unit-tested.
 */

import { type McpServerMeta, scoreMcpServer, type McpRiskAssessment } from '../mcp-registry/mcp-risk-score';

export interface McpCatalogEntry {
  id: string;
  name: string;
  description: string;
  meta: McpServerMeta;
  install: { command: string; args: string[]; transport: 'stdio'; note?: string };
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'context7',
    name: 'Context7',
    description: 'Up-to-date library/SDK docs — powers /qor-research + plan-time external-name verification (feedback_verify_external_names_at_plan_time).',
    meta: {
      name: 'context7', publisher: 'Upstash', repositoryUrl: 'https://github.com/upstash/context7',
      transports: ['stdio'], tools: [{ name: 'resolve-library-id' }, { name: 'query-docs' }],
    },
    install: { command: 'npx', args: ['-y', '@upstash/context7-mcp'], transport: 'stdio', note: 'Optional --api-key raises rate limits. Read-only doc queries; send only a library id + topic, never repo content.' },
  },
  {
    id: 'mermaid',
    name: 'Mermaid Chart',
    description: 'Validate + render governance diagrams (SHIELD lifecycle, Bicameral decision graph, Development Tracker convergence/sequence).',
    meta: {
      name: 'mermaid', publisher: 'mcp-mermaid (hustcc)', repositoryUrl: 'https://github.com/hustcc/mcp-mermaid',
      transports: ['stdio'], tools: [{ name: 'validate_and_render_mermaid_diagram' }],
    },
    install: { command: 'npx', args: ['-y', 'mcp-mermaid'], transport: 'stdio', note: 'Community render/validate package; the official Mermaid Chart hosted server is an alternative.' },
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser automation for agents via accessibility snapshots — navigate, click, type, fill forms, inspect/mock network. A high-capability surface FailSafe rates HIGH risk: review the safe-flag guidance before you trust it.',
    meta: {
      name: 'playwright', publisher: 'Microsoft', repositoryUrl: 'https://github.com/microsoft/playwright-mcp',
      transports: ['stdio'],
      tools: [
        { name: 'browser_navigate' }, { name: 'browser_click' }, { name: 'browser_type' },
        { name: 'browser_evaluate' }, { name: 'browser_file_upload' }, { name: 'browser_network_requests' },
        { name: 'browser_take_screenshot' },
      ],
    },
    install: {
      command: 'npx', args: ['-y', '@playwright/mcp@latest'], transport: 'stdio',
      note: 'High-capability browser automation — Microsoft states Playwright MCP is NOT a security boundary, and browser_evaluate runs arbitrary JS in the page. Prefer --isolated (in-memory profile) + --headless; opt into extra powers only via --caps; never pass --no-sandbox with untrusted content.',
    },
  },
];

/** Each catalog entry paired with its local #108 risk assessment. `now` injected. */
export function assessCatalog(now?: Date): Array<{ entry: McpCatalogEntry; assessment: McpRiskAssessment }> {
  return MCP_CATALOG.map((entry) => ({ entry, assessment: scoreMcpServer(entry.meta, { now }) }));
}
