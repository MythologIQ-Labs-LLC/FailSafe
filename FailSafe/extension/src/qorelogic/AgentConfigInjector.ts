import * as fs from 'fs';
import * as path from 'path';
import { SystemRegistry } from './SystemRegistry';
import { QoreLogicSystem } from './types/QoreLogicSystem';
import { Logger } from '../shared/Logger';

const GOVERNANCE_MARKER_START = '<!-- FailSafe Governance Start -->';
const GOVERNANCE_MARKER_END = '<!-- FailSafe Governance End -->';

interface InjectionConfig {
  configPath: string;
  format: 'markdown' | 'mdc';
}

const AGENT_CONFIG_MAP: Record<string, InjectionConfig> = {
  claude: { configPath: '.claude/CLAUDE.md', format: 'markdown' },
  copilot: { configPath: '.github/copilot-instructions.md', format: 'markdown' },
  cursor: { configPath: '.cursor/rules/failsafe.mdc', format: 'mdc' },
  codex: { configPath: 'codex.md', format: 'markdown' },
  windsurf: { configPath: '.windsurfrules', format: 'markdown' },
  gemini: { configPath: 'GEMINI.md', format: 'markdown' },
};

export class AgentConfigInjector {
  private readonly logger = new Logger('AgentConfigInjector');

  constructor(
    private readonly systemRegistry: SystemRegistry,
    private readonly workspaceRoot: string,
  ) {}

  async injectAll(): Promise<void> {
    const systems = await this.systemRegistry.getSystems();
    for (const system of systems) {
      await this.inject(system);
    }
  }

  async inject(system: QoreLogicSystem): Promise<void> {
    const manifest = system.getManifest();
    const config = AGENT_CONFIG_MAP[manifest.id];
    if (!config) return;

    const fullPath = path.join(this.workspaceRoot, config.configPath);
    const governanceBlock = this.buildGovernanceBlock(manifest.name, config.format);
    await this.writeGovernanceBlock(fullPath, governanceBlock);
  }

  async remove(system: QoreLogicSystem): Promise<void> {
    const manifest = system.getManifest();
    const config = AGENT_CONFIG_MAP[manifest.id];
    if (!config) return;

    const fullPath = path.join(this.workspaceRoot, config.configPath);
    await this.removeGovernanceBlock(fullPath);
  }

  private buildGovernanceBlock(systemName: string, format: string): string {
    const rules = [
      `All writes are subject to EnforcementEngine (FailSafe Extension).`,
      `Use /qor-status to check current governance state.`,
    ].join('\n');

    if (format === 'mdc') {
      return [
        '---',
        'description: FailSafe governance rules',
        'globs: **/*',
        '---',
        GOVERNANCE_MARKER_START,
        `# FailSafe Governance (${systemName})`,
        rules,
        GOVERNANCE_MARKER_END,
      ].join('\n');
    }
    return [GOVERNANCE_MARKER_START, `# FailSafe Governance (${systemName})`, rules, GOVERNANCE_MARKER_END].join('\n');
  }

  private async writeGovernanceBlock(filePath: string, block: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    let content = '';
    if (fs.existsSync(filePath)) {
      content = await fs.promises.readFile(filePath, 'utf-8');
      content = this.stripExistingBlock(content);
    }
    const merged = content ? `${content}\n\n${block}\n` : `${block}\n`;
    await fs.promises.writeFile(filePath, merged, 'utf-8');
  }

  private async removeGovernanceBlock(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) return;
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const cleaned = this.stripExistingBlock(content).trim();
    await fs.promises.writeFile(filePath, cleaned ? `${cleaned}\n` : '', 'utf-8');
  }

  private stripExistingBlock(content: string): string {
    const startIdx = content.indexOf(GOVERNANCE_MARKER_START);
    const endIdx = content.indexOf(GOVERNANCE_MARKER_END);
    if (startIdx === -1 || endIdx === -1) return content;
    const before = content.slice(0, startIdx).trimEnd();
    const after = content.slice(endIdx + GOVERNANCE_MARKER_END.length).trimStart();
    return before + (after ? '\n' + after : '');
  }
}
