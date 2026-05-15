import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../shared/Logger';
import {
    PostSyncResult,
    PreSyncResult,
    QorLogicSystem,
    SyncContext,
    TemplateRenderContext,
    TemplateRenderResult,
} from './types/QorLogicSystem';
import { SystemRegistry } from './SystemRegistry';

/**
 * FrameworkSync - Multi-Agent Identity Distribution
 * 
 * Synchronizes QorLogic identity definitions (skills, workflows, personas)
 * from the source 'qorelogic/' directory to platform-specific hidden folders
 * (.agent, .claude, .qorelogic) as well as root-level instructions (CLAUDE.md, GEMINI.md).
 */
export interface DetectedSystem {
    id: string;
    name: string;
    isInstalled: boolean;
    hasGovernance: boolean;
    description: string;
}

export interface PropagateResult {
    systemId: string;
    systemName: string;
    dirCopied: boolean;
    injectedPath: string | null;
    skipped: boolean;
    skipReason?: string;
}

export class FrameworkSync {
    private logger: Logger;
    private workspaceRoot: string;
    private registry: SystemRegistry;

    constructor(workspaceRoot: string, registry?: SystemRegistry) {
        this.workspaceRoot = workspaceRoot;
        this.logger = new Logger('FrameworkSync');
        this.registry = registry ?? new SystemRegistry(workspaceRoot, this.logger);
    }

    /**
     * Synchronize all framework components to their target locations
     */
    async syncAll(): Promise<void> {
        this.logger.info('Starting full framework synchronization...');

        try {
            const systems = await this.detectSystems();
            for (const system of systems) {
                if (system.isInstalled) {
                    await this.propagate(system.id);
                }
            }
            await this.generateRootInstructions();

            const { AgentConfigInjector } = await import('./AgentConfigInjector');
            const injector = new AgentConfigInjector(this.registry, this.workspaceRoot);
            await injector.injectAll();

            vscode.window.showInformationMessage('FailSafe: Multi-Agent Identity Synchronized Across All Detected Systems.');
        } catch (error) {
            this.logger.error('Synchronization failed', error);
            vscode.window.showErrorMessage(`Framework Sync Failed: ${error}`);
        }
    }

    /**
     * Detect which agent systems are active in the current workspace or environment
     */
    async detectSystems(): Promise<DetectedSystem[]> {
        const systems = await this.registry.getSystems();
        const results: DetectedSystem[] = [];
        for (const system of systems) {
            const manifest = system.getManifest();
            const detection = await this.registry.detect(system);
            results.push({
                id: manifest.id,
                name: manifest.name,
                isInstalled: detection.detected,
                hasGovernance: this.registry.hasGovernance(system),
                description: manifest.description
            });
        }
        return results;
    }

    /**
     * Propagate governance to a specific system. Runs both the dir-copy
     * step (when the system has sourceDir/targetDir) AND the governance-block
     * injector (writing .github/copilot-instructions.md, .claude/CLAUDE.md, etc.).
     * Returns a structured result so callers can report what actually happened.
     */
    async propagate(systemId: string): Promise<PropagateResult> {
        const system = await this.registry.findById(systemId);
        if (!system) {
            throw new Error(`Unknown system ID: ${systemId}`);
        }
        const manifest = system.getManifest();
        const dirCopied = await this.syncSystem(system);

        const { AgentConfigInjector, AGENT_CONFIG_MAP } = await import('./AgentConfigInjector');
        const injector = new AgentConfigInjector(this.registry, this.workspaceRoot);
        const cfg = AGENT_CONFIG_MAP[manifest.id];
        let injectedPath: string | null = null;
        if (cfg) {
            await injector.inject(system);
            injectedPath = cfg.configPath;
        }

        const skipped = !dirCopied && !injectedPath;
        return {
            systemId: manifest.id,
            systemName: manifest.name,
            dirCopied,
            injectedPath,
            skipped,
            skipReason: skipped ? 'no sourceDir/targetDir and no injector config' : undefined,
        };
    }

    private async generateRootInstructions(): Promise<void> {
        const systems = await this.registry.getSystems();
        for (const system of systems) {
            const manifest = system.getManifest();
            if (!manifest.templates || manifest.templates.length === 0) continue;
            for (const template of manifest.templates) {
                const templatePath = this.registry.resolvePath(template.source);
                if (!fs.existsSync(templatePath)) continue;
                const raw = await fs.promises.readFile(templatePath, 'utf-8');
                const rendered = await this.renderTemplate(system, {
                    workspaceRoot: this.workspaceRoot,
                    manifest,
                    template,
                    templateContent: raw,
                    vscode,
                    logger: this.logger
                });
                const outputPath = this.registry.resolvePath(template.output);
                await fs.promises.writeFile(outputPath, rendered, 'utf-8');
            }
        }
    }

    private async syncSystem(system: QorLogicSystem): Promise<boolean> {
        const manifest = system.getManifest();
        if (!manifest.targetDir || !manifest.sourceDir) {
            this.logger.info(`Skipping dir-copy for ${manifest.id} (no sourceDir/targetDir)`);
            return false;
        }
        const sourceDir = this.registry.resolvePath(manifest.sourceDir);
        const targetDir = this.registry.resolvePath(manifest.targetDir);
        if (!fs.existsSync(sourceDir)) return false;

        const preSync = await this.preSync(system, {
            workspaceRoot: this.workspaceRoot,
            manifest,
            vscode,
            logger: this.logger
        });
        if (!preSync.proceed) {
            this.logger.warn(`PreSync blocked for ${manifest.id}`, preSync.error);
            return false;
        }

        this.logger.info(`Syncing ${manifest.name} framework...`);
        await this.copyRecursive(sourceDir, targetDir);

        if (manifest.extraCopies) {
            for (const extra of manifest.extraCopies) {
                const extraSource = this.registry.resolvePath(extra.source);
                const extraTarget = this.registry.resolvePath(extra.target);
                if (fs.existsSync(extraSource)) {
                    await this.copyRecursive(extraSource, extraTarget);
                }
            }
        }

        const postSync = await this.postSync(system, {
            workspaceRoot: this.workspaceRoot,
            manifest,
            vscode,
            logger: this.logger
        }, preSync.data);
        if (!postSync.success) {
            this.logger.warn(`PostSync failed for ${manifest.id}`, postSync.error);
        }
        return true;
    }

    private async copyRecursive(src: string, dest: string): Promise<void> {
        if (!fs.existsSync(src)) return;
        
        const stats = await fs.promises.stat(src);
        if (stats.isDirectory()) {
            if (!fs.existsSync(dest)) {
                await fs.promises.mkdir(dest, { recursive: true });
            }
            const entries = await fs.promises.readdir(src);
            for (const entry of entries) {
                // Skip the weird malformed filenames found in research
                if (entry.includes('') || entry.includes('')) continue; 
                await this.copyRecursive(path.join(src, entry), path.join(dest, entry));
            }
        } else {
            await fs.promises.copyFile(src, dest);
        }
    }

    private async preSync(system: QorLogicSystem, context: SyncContext): Promise<PreSyncResult> {
        if (!system.preSync) {
            return { proceed: true };
        }
        try {
            return await system.preSync(context);
        } catch (error) {
            return { proceed: false, error: String(error) };
        }
    }

    private async postSync(
        system: QorLogicSystem,
        context: SyncContext,
        preSyncData?: Record<string, unknown>
    ): Promise<PostSyncResult> {
        if (!system.postSync) {
            return { success: true };
        }
        try {
            return await system.postSync(context, preSyncData);
        } catch (error) {
            return { success: false, error: String(error) };
        }
    }

    private async renderTemplate(
        system: QorLogicSystem,
        context: TemplateRenderContext
    ): Promise<string> {
        if (!system.renderTemplate) {
            return this.registry.renderTemplate(context.templateContent, system);
        }
        try {
            const result: TemplateRenderResult = await system.renderTemplate(context);
            if (result.success) return result.content;
            this.logger.warn(`Template render failed for ${context.manifest.id}`, result.error);
            return this.registry.renderTemplate(context.templateContent, system);
        } catch (error) {
            this.logger.warn(`Template render threw for ${context.manifest.id}`, error);
            return this.registry.renderTemplate(context.templateContent, system);
        }
    }
}
