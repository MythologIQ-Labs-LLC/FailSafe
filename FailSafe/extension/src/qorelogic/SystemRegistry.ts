import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "../shared/Logger";
import {
  DetectionContext,
  DetectionResult,
  QoreLogicSystem,
  SystemManifest,
} from "./types/QoreLogicSystem";
import {
  AgentDetectionRules,
  AgentSystemManifest,
  DetectionOutcome,
  DetectionSignal,
  DETECTION_THRESHOLD,
  SIGNAL_WEIGHTS,
  toSystemManifest,
} from "./types/DetectionTypes";
import {
  DetectionEnvironment,
  VsCodeDetectionEnvironment,
} from "./AgentDetectionEnvironment";
import { PluginRegistry } from "./PluginRegistry";
import { BUILT_IN_AGENTS } from "./AgentDefinitions";
import { loadAgentOverlay, mergeAgentOverlay } from "./AgentOverlayLoader";

export interface AgentTerminalInfo {
  name: string;
  terminalIndex: number;
  agentType: string;
}

export interface AgentTeamsStatus {
  enabled: boolean;
  settingsPath: string;
}

export interface AgentLandscape {
  registeredSystems: QoreLogicSystem[];
  activeTerminals: AgentTerminalInfo[];
  agentTeams: AgentTeamsStatus;
}

export class SystemRegistry {
  private logger: Logger;
  private workspaceRoot: string;
  private cached: QoreLogicSystem[] | null = null;
  private agentManifests: AgentSystemManifest[] | null = null;
  private pluginRegistry: PluginRegistry;
  private env: DetectionEnvironment;

  constructor(
    workspaceRoot: string,
    logger?: Logger,
    env?: DetectionEnvironment,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.logger = logger ?? new Logger("SystemRegistry");
    this.pluginRegistry = new PluginRegistry();
    this.env = env ?? new VsCodeDetectionEnvironment();
  }

  async getSystems(): Promise<QoreLogicSystem[]> {
    if (this.cached) {
      return this.cached;
    }
    for (const manifest of this.loadAgentManifests()) {
      this.pluginRegistry.register({
        plugin: new DefaultSystemPlugin(toSystemManifest(manifest)),
      });
    }
    this.cached = this.pluginRegistry.getSorted();
    return this.cached;
  }

  async findById(id: string): Promise<QoreLogicSystem | undefined> {
    const systems = await this.getSystems();
    return systems.find((system) => system.getManifest().id === id);
  }

  async detect(system: QoreLogicSystem): Promise<DetectionResult> {
    if (system.detect) {
      return system.detect(this.buildDetectionContext());
    }
    return { detected: this.detectWithConfidence(system).detected };
  }

  /**
   * Weighted, multi-phase detection (filesystem phase implemented).
   * Confidence = min(1.0, sum of matched signal weights). A single strong
   * signal (exact extension id, host app, or agent dot-directory) is enough.
   */
  detectWithConfidence(system: QoreLogicSystem): DetectionOutcome {
    const rules = this.agentRulesFor(system.getManifest().id);
    const matched = this.collectSignals(rules);
    const confidence = Math.min(
      1,
      matched.reduce((sum, signal) => sum + signal.weight, 0),
    );
    const detected =
      rules.alwaysInstalled === true || confidence >= DETECTION_THRESHOLD;
    return {
      detected,
      confidence,
      signals: matched.map((signal) => `${signal.type}:${signal.value}`),
      phase: "filesystem",
    };
  }

  hasGovernance(system: QoreLogicSystem): boolean {
    const manifest = system.getManifest();
    const pathsToCheck = manifest.governancePaths || [];
    return pathsToCheck.some((p) =>
      fs.existsSync(path.join(this.workspaceRoot, p)),
    );
  }

  renderTemplate(template: string, system: QoreLogicSystem): string {
    const manifest = system.getManifest();
    return template
      .replaceAll("{{SYSTEM_NAME}}", manifest.name)
      .replaceAll("{{SYSTEM_ID}}", manifest.id);
  }

  resolvePath(relativePath: string): string {
    return path.join(this.workspaceRoot, relativePath);
  }

  detectTerminalAgents(): AgentTerminalInfo[] {
    const patterns = this.terminalPatternMap();
    const results: AgentTerminalInfo[] = [];
    const terminals = vscode.window.terminals;
    for (let i = 0; i < terminals.length; i++) {
      const name = terminals[i].name.toLowerCase();
      for (const [agentType, agentPatterns] of patterns) {
        if (agentPatterns.some((p) => name.includes(p))) {
          results.push({ name: terminals[i].name, terminalIndex: i, agentType });
          break;
        }
      }
    }
    return results;
  }

  private terminalPatternMap(): Array<[string, string[]]> {
    return this.loadAgentManifests()
      .map((m): [string, string[]] => [
        m.id,
        (m.detection?.terminalPatterns ?? []).map((p) => p.toLowerCase()),
      ])
      .filter(([, patterns]) => patterns.length > 0);
  }

  detectAgentTeams(): AgentTeamsStatus {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    try {
      if (!fs.existsSync(settingsPath)) {
        return { enabled: false, settingsPath };
      }
      const raw = fs.readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw);
      const env = settings?.env || {};
      const enabled = env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1";
      return { enabled, settingsPath };
    } catch {
      return { enabled: false, settingsPath };
    }
  }

  async detectAll(): Promise<AgentLandscape> {
    const registeredSystems = await this.getSystems();
    const activeTerminals = this.detectTerminalAgents();
    const agentTeams = this.detectAgentTeams();
    return { registeredSystems, activeTerminals, agentTeams };
  }

  private loadAgentManifests(): AgentSystemManifest[] {
    if (!this.agentManifests) {
      this.agentManifests = mergeAgentOverlay(
        [...BUILT_IN_AGENTS],
        loadAgentOverlay(this.workspaceRoot),
      );
    }
    return this.agentManifests;
  }

  private agentRulesFor(id: string): AgentDetectionRules {
    const found = this.loadAgentManifests().find((m) => m.id === id);
    return (found?.detection ?? {}) as AgentDetectionRules;
  }

  private collectSignals(rules: AgentDetectionRules): DetectionSignal[] {
    const out: DetectionSignal[] = [];
    for (const folder of rules.folderExists ?? []) {
      if (fs.existsSync(path.join(this.workspaceRoot, folder))) {
        out.push({ type: "folderExists", value: folder, weight: SIGNAL_WEIGHTS.folderExists });
      }
    }
    for (const id of rules.extensionIds ?? []) {
      if (this.env.hasExtensionId(id)) {
        out.push({ type: "extensionId", value: id, weight: SIGNAL_WEIGHTS.extensionId });
      }
    }
    // Extension keywords are noisy alternative spellings of one weak signal,
    // so they contribute at most once (a single agent's two keyword matches
    // must not sum past the detection threshold on their own).
    for (const keyword of rules.extensionKeywords ?? []) {
      if (this.env.matchesExtensionKeyword(keyword)) {
        out.push({ type: "extensionKeyword", value: keyword, weight: SIGNAL_WEIGHTS.extensionKeyword });
        break;
      }
    }
    for (const name of rules.hostAppNames ?? []) {
      if (this.env.matchesHostAppName(name)) {
        out.push({ type: "hostAppName", value: name, weight: SIGNAL_WEIGHTS.hostAppName });
      }
    }
    return out;
  }

  private buildDetectionContext(): DetectionContext {
    return {
      workspaceRoot: this.workspaceRoot,
      vscode,
      extensions: vscode.extensions.all,
      appName: vscode.env.appName,
    };
  }
}

class DefaultSystemPlugin implements QoreLogicSystem {
  private manifest: SystemManifest;

  constructor(manifest: SystemManifest) {
    this.manifest = manifest;
  }

  getManifest(): SystemManifest {
    return this.manifest;
  }
}
