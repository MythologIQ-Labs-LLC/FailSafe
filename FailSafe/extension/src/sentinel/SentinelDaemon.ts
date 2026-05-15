/**
 * SentinelDaemon - Active Monitoring & Enforcement Daemon.
 * Coordinates VerdictArbiter (decision) and VerdictRouter (action).
 * Watch / ignore classification: SentinelWatchPolicy.
 * Priority-sorted bounded buffer: SentinelEventQueue.
 * Decoupled from vscode.* via IConfigProvider.
 */
import * as chokidar from 'chokidar';
import * as crypto from 'crypto';
import { EventBus } from '../shared/EventBus';
import { Logger } from '../shared/Logger';
import { IConfigProvider } from '../core/interfaces/IConfigProvider';
import { SentinelStatus, SentinelEvent, SentinelVerdict } from '../shared/types';
import { VerdictArbiter } from './VerdictArbiter';
import { VerdictRouter } from './VerdictRouter';
import { SentinelRagStore } from './SentinelRagStore';
import { IFeatureGate } from '../core/interfaces/IFeatureGate';
import { SentinelWatchPolicy } from './SentinelWatchPolicy';
import { SentinelEventQueue } from './SentinelEventQueue';

type AgentClaim = {
    agentDid: string;
    claimedArtifacts?: string[];
    [key: string]: unknown;
};

function initialStatus(): SentinelStatus {
    return {
        running: false, mode: 'heuristic', operationalMode: 'normal',
        uptime: 0, filesWatched: 0, eventsProcessed: 0,
        queueDepth: 0, lastVerdict: null, llmAvailable: false
    };
}

export class SentinelDaemon {
    private logger = new Logger('Sentinel');
    private watchPolicy = new SentinelWatchPolicy();
    private queue = new SentinelEventQueue();
    private status: SentinelStatus = initialStatus();
    private watcher: chokidar.FSWatcher | undefined;
    private processing = false;
    private startTime = 0;
    private processInterval: NodeJS.Timeout | undefined;
    private ragStore: SentinelRagStore | undefined;

    constructor(
        private configProvider: IConfigProvider,
        private arbiter: VerdictArbiter,
        private router: VerdictRouter,
        private eventBus: EventBus,
        private featureGate?: IFeatureGate
    ) {
        this.status.mode = this.arbiter.getMode();
    }

    setFeatureGate(gate: IFeatureGate): void {
        this.featureGate = gate;
    }

    async start(): Promise<void> {
        if (this.status.running) {
            this.logger.warn('Sentinel already running');
            return;
        }
        if (this.featureGate && !this.featureGate.isEnabled('sentinel.osDaemon')) {
            this.logger.info('Sentinel OS daemon not enabled. Running in standard mode.');
        }
        this.logger.info('Starting Sentinel daemon...');
        this.startTime = Date.now();
        this.status.running = true;
        this.initializeRagStore();
        await this.initializeWatcher();
        this.status.llmAvailable = await this.arbiter.checkLLMAvailability();
        this.status.mode = this.arbiter.getMode();
        this.processInterval = setInterval(() => this.processEvents(), 100);
        this.eventBus.emit('genesis.streamEvent', {
            id: crypto.randomUUID(), timestamp: new Date().toISOString(),
            category: 'sentinel', severity: 'info',
            title: 'Sentinel daemon started', details: `Mode: ${this.status.mode}`
        });
        this.logger.info('Sentinel daemon started');
    }

    stop(): void {
        if (!this.status.running) {
            return;
        }
        this.logger.info('Stopping Sentinel daemon...');
        this.status.running = false;
        if (this.watcher) {
            this.watcher.close();
            this.watcher = undefined;
        }
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = undefined;
        }
        this.ragStore?.dispose();
        this.ragStore = undefined;
        this.logger.info('Sentinel daemon stopped');
    }

    getStatus(): SentinelStatus {
        return {
            ...this.status,
            uptime: this.status.running ? Date.now() - this.startTime : 0,
            queueDepth: this.queue.size(),
            mode: this.arbiter.getMode(),
            llmAvailable: this.arbiter.isLlmAvailable()
        };
    }

    isRunning(): boolean {
        return this.status.running;
    }

    getRecentObservationIds(since: string, limit?: number): string[] {
        return this.ragStore?.getRecentObservationIds(since, limit) ?? [];
    }

    async auditFile(filePath: string): Promise<SentinelVerdict> {
        this.logger.info('Manual audit requested', { filePath });
        return this.processSingleEvent({
            id: crypto.randomUUID(), timestamp: new Date().toISOString(),
            priority: 'high', source: 'manual', type: 'MANUAL_AUDIT',
            payload: { path: filePath }
        });
    }

    async validateClaim(claim: AgentClaim): Promise<SentinelVerdict> {
        this.logger.info('Validating agent claim', { agentDid: claim.agentDid });
        const verdict = await this.arbiter.validateClaim(claim);
        await this.router.route(verdict);
        return verdict;
    }

    private async initializeWatcher(): Promise<void> {
        const workspaceRoot = this.configProvider.getWorkspaceRoot();
        if (!workspaceRoot) {
            this.logger.warn('No workspace root, file watching disabled');
            return;
        }
        this.watcher = chokidar.watch(workspaceRoot, {
            ignored: this.watchPolicy.getIgnorePatterns(),
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
        });
        this.bindWatcherEvents();
    }

    private bindWatcherEvents(): void {
        if (!this.watcher) {
            return;
        }
        this.watcher
            .on('add', (filePath) => this.queueEvent('FILE_CREATED', filePath))
            .on('change', (filePath) => this.queueEvent('FILE_MODIFIED', filePath))
            .on('unlink', (filePath) => this.queueEvent('FILE_DELETED', filePath))
            .on('ready', () => this.onWatcherReady())
            .on('error', (error) => this.logger.error('File watcher error', error));
    }

    private onWatcherReady(): void {
        const watched = this.watcher?.getWatched();
        this.status.filesWatched = watched
            ? Object.values(watched).reduce((acc, files) => acc + files.length, 0)
            : 0;
        this.logger.info(`File watcher ready, watching ${this.status.filesWatched} files`);
    }

    private queueEvent(type: SentinelEvent['type'], filePath: string): void {
        if (!this.watchPolicy.shouldWatch(filePath, type)) {
            return;
        }
        this.queue.enqueue({
            id: crypto.randomUUID(), timestamp: new Date().toISOString(),
            priority: this.watchPolicy.determinePriority(filePath),
            source: 'file_watcher', type, payload: { path: filePath }
        });
    }

    private async processEvents(): Promise<void> {
        if (this.processing || this.queue.isEmpty()) {
            return;
        }
        this.processing = true;
        try {
            const event = this.queue.dequeue();
            if (event) {
                await this.processSingleEvent(event);
            }
        } catch (error) {
            this.logger.error('Error processing event', error);
        } finally {
            this.processing = false;
        }
    }

    private async processSingleEvent(event: SentinelEvent): Promise<SentinelVerdict> {
        const verdict = await this.arbiter.evaluateEvent(event);
        this.status.eventsProcessed++;
        this.status.lastVerdict = verdict;
        this.emitVerdictSignals(event, verdict);
        await this.router.route(verdict, event);
        await this.recordToRag(event, verdict);
        return verdict;
    }

    private emitVerdictSignals(event: SentinelEvent, verdict: SentinelVerdict): void {
        this.eventBus.emit('sentinel.confidence', {
            eventId: event.id, confidence: verdict.confidence,
            timestamp: new Date().toISOString()
        });
        const artifactPath = typeof event.payload?.path === 'string' ? event.payload.path : undefined;
        this.eventBus.emit('sentinel.activityObserved', {
            eventId: event.id, timestamp: event.timestamp,
            source: event.source, type: event.type, artifactPath,
            decision: verdict.decision, agentDid: verdict.agentDid
        });
    }

    private initializeRagStore(): void {
        const config = this.configProvider.getConfig();
        const sentinelConfig = config.sentinel as Record<string, unknown> | undefined;
        const enabled = (sentinelConfig?.ragEnabled as boolean) ?? true;
        if (!enabled) {
            this.ragStore = undefined;
            return;
        }
        const workspaceRoot = this.configProvider.getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }
        this.ragStore = new SentinelRagStore(workspaceRoot, this.logger.child('RAG'));
        this.ragStore.initialize();
    }

    private async recordToRag(event: SentinelEvent, verdict: SentinelVerdict): Promise<void> {
        if (!this.ragStore) {
            return;
        }
        try {
            await this.ragStore.recordEvent(event, verdict);
        } catch (error) {
            this.logger.warn('Failed to persist Sentinel observation to RAG store', error);
        }
    }
}
