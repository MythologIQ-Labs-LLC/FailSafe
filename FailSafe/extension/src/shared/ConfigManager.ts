/**
 * ConfigManager - Configuration management for FailSafe
 *
 * Provides type-safe access to VS Code configuration settings
 * and workspace-specific configuration files.
 */

import * as vscode from 'vscode';
import { resolveGitDirs } from '../governance/gitDirs';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type { IConfigProvider } from '../core/interfaces';
import { FailSafeConfig, SentinelMode } from './types';
import { ensureFailsafeGitignoreEntry } from './gitignore';

type SentinelYamlConfig = Partial<FailSafeConfig> & Record<string, unknown>;

export class ConfigManager implements IConfigProvider {
    private context: vscode.ExtensionContext;
    private workspaceRoot: string | undefined;
    private governanceRoot: string | undefined;
    private configChangeEmitter = new vscode.EventEmitter<FailSafeConfig>();


    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('failsafe')) {
                this.configChangeEmitter.fire(this.getConfig());
            }
        });
    }

    onConfigChange(callback: (config: FailSafeConfig) => void): () => void {
        const disposable = this.configChangeEmitter.event(callback);
        return () => disposable.dispose();
    }

    /**
     * Get the full configuration object
     */
    getConfig(): FailSafeConfig {
        const config = vscode.workspace.getConfiguration('failsafe');
        const sentinelYaml = this.readSentinelYaml();

        return {
            genesis: {
                livingGraph: sentinelYaml?.genesis?.livingGraph ?? config.get<boolean>('genesis.livingGraph', true),
                cortexOmnibar: sentinelYaml?.genesis?.cortexOmnibar ?? config.get<boolean>('genesis.cortexOmnibar', true),
                theme: sentinelYaml?.genesis?.theme ?? config.get<'starry-night' | 'light' | 'high-contrast'>('genesis.theme', 'starry-night')
            },
            sentinel: {
                enabled: sentinelYaml?.sentinel?.enabled ?? config.get<boolean>('sentinel.enabled', true),
                mode: sentinelYaml?.sentinel?.mode ?? config.get<SentinelMode>('sentinel.mode', 'heuristic'),
                localModel: sentinelYaml?.sentinel?.localModel ?? config.get<string>('sentinel.localModel', 'phi3:mini'),
                ollamaEndpoint: sentinelYaml?.sentinel?.ollamaEndpoint ?? config.get<string>('sentinel.ollamaEndpoint', 'http://localhost:11434')
            },
            evaluation: sentinelYaml?.evaluation,
            qorelogic: {
                ledgerPath: sentinelYaml?.qorelogic?.ledgerPath ?? config.get<string>('qorelogic.ledgerPath', '.failsafe/ledger/soa_ledger.db'),
                strictMode: sentinelYaml?.qorelogic?.strictMode ?? config.get<boolean>('qorelogic.strictMode', false),
                l3SLA: sentinelYaml?.qorelogic?.l3SLA ?? config.get<number>('qorelogic.l3SLA', 120)
            },
            feedback: {
                outputDir: sentinelYaml?.feedback?.outputDir ?? config.get<string>('feedback.outputDir', '.failsafe/feedback')
            },
            architecture: {
                contributors: sentinelYaml?.architecture?.contributors ?? config.get<number>('architecture.contributors', 1),
                maxComplexity: sentinelYaml?.architecture?.maxComplexity ?? config.get<number>('architecture.maxComplexity', 20)
            },
            governance: {
                mode: sentinelYaml?.governance?.mode ?? config.get<"observe" | "assist" | "enforce">("governance.mode", "enforce"),
                overseerId: sentinelYaml?.governance?.overseerId ?? config.get<string>("governance.overseerId", "did:myth:overseer:local"),
            },
        };
    }

    /**
     * Get the workspace root path
     */
    getWorkspaceRoot(): string | undefined {
        return this.workspaceRoot;
    }

    /**
     * Get the .failsafe directory path
     */
    getFailSafeDir(): string {
        if (!this.workspaceRoot) {
            throw new Error('No workspace folder open');
        }
        return path.join(this.workspaceRoot, '.failsafe');
    }

    getSentinelConfigPath(): string {
        return path.join(this.getFailSafeDir(), 'config', 'sentinel.yaml');
    }

    /**
     * Get the ledger database path
     */
    getLedgerPath(): string {
        const config = this.getConfig();
        if (path.isAbsolute(config.qorelogic.ledgerPath)) {
            return config.qorelogic.ledgerPath;
        }
        if (!this.workspaceRoot) {
            throw new Error('No workspace folder open');
        }
        return path.join(this.workspaceRoot, config.qorelogic.ledgerPath);
    }

    /**
     * Get the feedback output directory path
     */
    getFeedbackDir(): string {
        const config = this.getConfig();
        if (path.isAbsolute(config.feedback.outputDir)) {
            return config.feedback.outputDir;
        }
        if (!this.workspaceRoot) {
            throw new Error('No workspace folder open');
        }
        return path.join(this.workspaceRoot, config.feedback.outputDir);
    }



    /**
     * Ensure the .failsafe directory structure exists and populate default configs
     */
    async ensureDirectoryStructure(): Promise<void> {
        try {
            const failsafeDir = this.getFailSafeDir();
            const feedbackDir = this.getFeedbackDir();

            const dirs = [
                failsafeDir,
                path.join(failsafeDir, 'config'),
                path.join(failsafeDir, 'config', 'personas'),
                path.join(failsafeDir, 'config', 'policies'),
                path.join(failsafeDir, 'ledger'),
                path.join(failsafeDir, 'keystore'),
                path.join(failsafeDir, 'cache'),
                path.join(failsafeDir, 'logs'),
                feedbackDir
            ];

            for (const dir of dirs) {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }

            if (this.workspaceRoot) {
                try {
                    ensureFailsafeGitignoreEntry(this.workspaceRoot);
                } catch (error) {
                    console.warn('Failed to update .gitignore with .failsafe/:', error);
                }
            }

            await this.ensureConfigFiles();
        } catch (error) {
            console.error('Failed to initialize FailSafe directory structure:', error);
            vscode.window.showErrorMessage('FailSafe initialization failed: Could not create .failsafe directory. check permissions.');
            throw error;
        }
    }

    /**
     * Populate default configuration files if they are missing
     */
    private async ensureConfigFiles(): Promise<void> {
        const failsafeDir = this.getFailSafeDir();

        // 1. sentinel.yaml
        const sentinelConfig = this.getSentinelConfigPath();
        if (!fs.existsSync(sentinelConfig)) {
            const content = `# Sentinel Configuration
sentinel:
  enabled: true
  mode: hybrid
  localModel: "phi3:mini"
  ollamaEndpoint: "http://localhost:11434"

evaluation:
  enabled: true
  mode: production # production | debug | audit
  routing:
    tier2_risk_threshold: R2
    tier3_risk_threshold: R3
    tier2_novelty_threshold: high
    tier3_novelty_threshold: medium
    tier2_confidence_threshold: low
    tier3_confidence_threshold: low
  ledger:
    tier0_enabled: false
    tier1_enabled: false
    tier2_enabled: false
    tier3_enabled: true

genesis:
  livingGraph: true
  cortexOmnibar: true
  theme: starry-night

qorelogic:
  ledgerPath: ".failsafe/ledger/soa_ledger.db"
  strictMode: false
  l3SLA: 120

feedback:
  outputDir: ".failsafe/feedback"
`;
            await this.writeConfigAtomic(sentinelConfig, content);
        }

        // 2. personas/scrivener.yaml
        const scrivenerConfig = path.join(failsafeDir, 'config', 'personas', 'scrivener.yaml');
        if (!fs.existsSync(scrivenerConfig)) {
            const content = `# Scrivener Persona
persona: scrivener
version: 1.0.0
description: Code generation agent
risk_tolerance: L2
verification_requirements:
  L1: sampling_10_percent
  L2: full_sentinel_pass
  L3: escalate_to_overseer
`;
            await this.writeConfigAtomic(scrivenerConfig, content);
        }

        // 3. policies/risk_grading.yaml
        const riskConfig = path.join(failsafeDir, 'config', 'policies', 'risk_grading.yaml');
        if (!fs.existsSync(riskConfig)) {
            const content = `# Risk Grading Policy
policy: risk_grading
auto_classification:
  file_path_triggers:
    L3: ["auth", "login", "crypto", "payment"]
  content_triggers:
    L3: ["private_key", "password", "api_key"]
`;
            await this.writeConfigAtomic(riskConfig, content);
        }
    }

    private async writeConfigAtomic(filePath: string, content: string): Promise<void> {
        const tempPath = `${filePath}.tmp`;
        try {
            await fs.promises.writeFile(tempPath, content, 'utf8');
            await fs.promises.rename(tempPath, filePath);
        } catch (error) {
            console.error(`Failed to write config file ${filePath}:`, error);
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
            throw error;
        }
    }

    private readSentinelYaml(): SentinelYamlConfig | null {
        try {
            const sentinelPath = this.getSentinelConfigPath();
            if (!fs.existsSync(sentinelPath)) {
                return null;
            }
            const content = fs.readFileSync(sentinelPath, 'utf8');
            const parsed = yaml.load(content) as unknown;
            if (parsed && typeof parsed === 'object') {
                return parsed as SentinelYamlConfig;
            }
            return null;
        } catch (error) {
            console.error('Failed to read sentinel.yaml:', error);
            return null;
        }
    }

    async updateSentinelYaml(
        section: 'sentinel' | 'genesis' | 'qorelogic' | 'feedback' | 'evaluation',
        partial: Record<string, unknown>
    ): Promise<void> {
        const sentinelPath = this.getSentinelConfigPath();
        const existing = (this.readSentinelYaml() ?? {}) as Record<string, unknown>;
        const currentSection = (existing[section] ?? {}) as Record<string, unknown>;
        existing[section] = { ...currentSection, ...partial };
        await this.writeConfigAtomic(sentinelPath, yaml.dump(existing));
        this.configChangeEmitter.fire(this.getConfig());
    }

    getSentinelSection<T>(section: string, defaultValue: T): T {
        const yamlConfig = this.readSentinelYaml();
        return (yamlConfig?.[section] as T) ?? defaultValue;
    }

    /**
     * #83A: canonical governance root for worktree-aware consumers.
     * On a linked worktree this resolves to the MAIN checkout's repository
     * root (parent of the common .git), so governance artifacts converge on
     * one location per repository. Falls back to workspaceRoot outside a
     * repo. Cached once per activation.
     */
    getGovernanceRoot(): string {
        if (this.governanceRoot === undefined) {
            const root = this.workspaceRoot ?? "";
            if (!root) {
                this.governanceRoot = "";
            } else {
                const { commonDir } = resolveGitDirs(root);
                this.governanceRoot = commonDir.endsWith(".git")
                    ? path.dirname(commonDir)
                    : root;
            }
        }
        return this.governanceRoot;
    }

    /**
     * Get a value from extension global state
     */
    getGlobalState<T>(key: string, defaultValue: T): T {
        return this.context.globalState.get<T>(key, defaultValue);
    }

    /**
     * Set a value in extension global state
     */
    async setGlobalState<T>(key: string, value: T): Promise<void> {
        await this.context.globalState.update(key, value);
    }

    /**
     * Get a value from extension workspace state
     */
    getWorkspaceState<T>(key: string, defaultValue: T): T {
        return this.context.workspaceState.get<T>(key, defaultValue);
    }

    /**
     * Set a value in extension workspace state
     */
    async setWorkspaceState<T>(key: string, value: T): Promise<void> {
        await this.context.workspaceState.update(key, value);
    }

    dispose(): void {
        this.configChangeEmitter.dispose();
    }
}
