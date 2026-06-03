/**
 * agt-catalog — curated, governed catalog of Microsoft Agent Governance Toolkit
 * (AGT) installers (B-INT-16). AGT ships per-environment governance MODULES (not
 * one package): language SDKs (Python/TypeScript/.NET/Rust/Go) + agent-host
 * plugins (Claude Code / Copilot CLI / OpenCode / Antigravity CLI). The value
 * here is auto-detecting the workspace environment and serving the matching,
 * VERIFIED installer rather than a flat list the operator must triage.
 *
 * Install commands are verified against the upstream repo + live registries
 * (microsoft/agent-governance-toolkit, 2026-06-03), NOT fabricated:
 *  - Rust crate is `agentmesh` (4.0.0) — NOT `agent-governance` (the repo README
 *    is stale at 3.2.2 there); we ship the correct crate.
 *  - Go has no tagged release (proxy pseudo-version only) → status source-only.
 *  - Claude Code installs via slash commands INSIDE Claude Code, not a shell —
 *    so it is copy-only (runnable=false); the rest run in a terminal.
 *  - AGT is Public Preview upstream; surfaced in the module note.
 *
 * Pure — no fs/vscode/network — so the catalog + environment detection are
 * unit-tested deterministically.
 */

export type AgtModuleKind = 'language' | 'agent-host';

export interface AgtModule {
  id: string;
  label: string;
  /** Human environment label, e.g. "TypeScript / Node 18+". */
  env: string;
  kind: AgtModuleKind;
  /**
   * Workspace-root markers that imply this language module. Exact filenames
   * (e.g. `go.mod`) or extension suffixes (e.g. `.csproj`). Language modules
   * only; agent-host modules are not language-detected.
   */
  detect?: string[];
  /** The verified install command. For runnable modules it is a shell command. */
  command: string;
  registry: string;
  /** true → a shell command we can run in an integrated terminal; false → copy-only (e.g. Claude Code slash commands). */
  runnable: boolean;
  status: 'published' | 'source-only';
  note: string;
}

export const AGT_MODULES: AgtModule[] = [
  // ---- Language SDKs (auto-detected from workspace manifests) ----
  {
    id: 'typescript', label: 'TypeScript', env: 'TypeScript / Node 18+', kind: 'language',
    detect: ['package.json', 'tsconfig.json'],
    command: 'npm install @microsoft/agent-governance-sdk', registry: 'npm', runnable: true, status: 'published',
    note: 'TypeScript SDK: agent identity, trust scoring, policy evaluation, audit logging.',
  },
  {
    id: 'python', label: 'Python', env: 'Python 3.10+', kind: 'language',
    detect: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'],
    command: 'pip install agent-governance-toolkit[full]', registry: 'PyPI', runnable: true, status: 'published',
    note: 'Full governance stack: policy engine, identity, sandboxing, audit, SRE.',
  },
  {
    id: 'dotnet', label: '.NET', env: '.NET 8+', kind: 'language',
    detect: ['.csproj', '.sln', '.fsproj'],
    command: 'dotnet add package Microsoft.AgentGovernance', registry: 'NuGet', runnable: true, status: 'published',
    note: '.NET governance kernel: policy eval, identity, MCP/Agents extensions.',
  },
  {
    id: 'rust', label: 'Rust', env: 'Rust 1.70+', kind: 'language',
    detect: ['Cargo.toml'],
    command: 'cargo add agentmesh', registry: 'crates.io', runnable: true, status: 'published',
    note: 'Rust governance crate (policy, trust, audit, identity). Crate is `agentmesh` (4.0.0); `agentmesh-mcp` is the standalone MCP crate.',
  },
  {
    id: 'golang', label: 'Go', env: 'Go 1.25+', kind: 'language',
    detect: ['go.mod'],
    command: 'go get github.com/microsoft/agent-governance-toolkit/agent-governance-golang', registry: 'Go modules', runnable: true, status: 'source-only',
    note: 'Go governance SDK. No tagged release upstream yet — `go get` pulls an untagged pseudo-version (snapshot), not a stable semver.',
  },
  // ---- Agent-host plugins/installers ----
  {
    id: 'copilot-cli', label: 'Copilot CLI', env: 'GitHub Copilot CLI', kind: 'agent-host',
    command: 'npx @microsoft/agent-governance-copilot-cli install', registry: 'npm', runnable: true, status: 'published',
    note: 'Deploys an AGT governance extension into the Copilot CLI home.',
  },
  {
    id: 'opencode', label: 'OpenCode', env: 'OpenCode', kind: 'agent-host',
    command: 'npm install @microsoft/agent-governance-opencode', registry: 'npm', runnable: true, status: 'published',
    note: 'OpenCode governance plugin + bundled MCP server. After install, register it as a plugin in opencode.json.',
  },
  {
    id: 'antigravity-cli', label: 'Antigravity CLI', env: 'Antigravity CLI', kind: 'agent-host',
    command: 'npm install -g @microsoft/agent-governance-antigravity-cli && agt-antigravity install', registry: 'npm', runnable: true, status: 'published',
    note: 'Two-step: global install, then `agt-antigravity install` deploys the governance extension into ~/.antigravity/extensions.',
  },
  {
    id: 'claude-code', label: 'Claude Code', env: 'Claude Code', kind: 'agent-host',
    command: '/plugin marketplace add microsoft/agent-governance-toolkit\n/plugin install agt-governance@agent-governance-toolkit', registry: 'Claude plugin marketplace', runnable: false, status: 'published',
    note: 'Run these slash commands INSIDE Claude Code (not a terminal). Installs the agt-governance plugin: SessionStart/UserPromptSubmit/PreToolUse hooks + bundled MCP tools.',
  },
];

const PREVIEW_BANNER = 'Microsoft Agent Governance Toolkit is Public Preview — APIs may change before GA.';

/** AGT-wide advisory shown once in the UI header. */
export function agtPreviewNotice(): string { return PREVIEW_BANNER; }

/**
 * Pure environment detection: given the names of files at the workspace root,
 * return the language module ids whose markers are present. Exact filenames
 * match by equality; markers beginning with '.' match by suffix (extensions).
 * Agent-host modules are never language-detected.
 */
export function detectEnvironment(rootEntries: string[]): string[] {
  const names = new Set(rootEntries.map((n) => n.toLowerCase()));
  const matched: string[] = [];
  for (const m of AGT_MODULES) {
    if (m.kind !== 'language' || !m.detect) continue;
    const hit = m.detect.some((marker) => {
      const mk = marker.toLowerCase();
      return mk.startsWith('.')
        ? rootEntries.some((n) => n.toLowerCase().endsWith(mk))
        : names.has(mk);
    });
    if (hit) matched.push(m.id);
  }
  return matched;
}
