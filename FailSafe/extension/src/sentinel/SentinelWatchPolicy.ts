/**
 * SentinelWatchPolicy - Watch / ignore classification for the Sentinel daemon.
 *
 * Owns:
 * - Watched file-extension catalog (code files Sentinel cares about).
 * - chokidar ignore patterns (node_modules, build output, governance dir, ...).
 * - Governance-path predicate (`.failsafe/**`).
 * - Priority assignment from file path heuristics.
 *
 * Extracted from SentinelDaemon as part of Phase 60 Section 4 Razor
 * refactor. Behaviour is preserved: same extension list, same ignore
 * globs, same priority heuristics — only the location changed.
 */
import * as path from 'path';
import { SentinelEvent, SentinelEventType } from '../shared/types';

const CODE_EXTENSIONS: ReadonlyArray<string> = [
    '.ts',
    '.js',
    '.tsx',
    '.jsx',
    '.py',
    '.go',
    '.rs',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.cs'
];

const IGNORE_PATTERNS: ReadonlyArray<string> = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/*.log',
    '**/.failsafe/**'
];

const GOVERNANCE_PATH_FRAGMENT = '.failsafe';

export class SentinelWatchPolicy {
    /**
     * Globs handed to chokidar's `ignored` option.
     */
    getIgnorePatterns(): string[] {
        return [...IGNORE_PATTERNS];
    }

    /**
     * Code-file extension catalog (lower-case, leading dot).
     */
    getCodeExtensions(): string[] {
        return [...CODE_EXTENSIONS];
    }

    /**
     * True when a path lives under the `.failsafe/` governance tree.
     * Governance writes never feed Sentinel — they are the audit trail
     * Sentinel emits, so re-watching them would create a feedback loop.
     */
    isGovernancePath(filePath: string): boolean {
        if (!filePath) {
            return false;
        }
        const normalized = filePath.replace(/\\/g, '/').toLowerCase();
        return normalized.includes(`/${GOVERNANCE_PATH_FRAGMENT}/`)
            || normalized.startsWith(`${GOVERNANCE_PATH_FRAGMENT}/`)
            || normalized.endsWith(`/${GOVERNANCE_PATH_FRAGMENT}`)
            || normalized === GOVERNANCE_PATH_FRAGMENT;
    }

    /**
     * Decide whether a watcher event should be queued.
     *
     * Rules (preserved from prior SentinelDaemon.queueEvent):
     * - Deletions are always observed regardless of extension, so a
     *   removed `.md` still surfaces as evidence of activity.
     * - All other event types must match a known code extension.
     * - Governance paths (`.failsafe/**`) are dropped — the chokidar
     *   ignore globs already suppress them, but this predicate keeps
     *   the policy honest if a caller skips chokidar.
     */
    shouldWatch(filePath: string, type: SentinelEventType): boolean {
        if (this.isGovernancePath(filePath)) {
            return false;
        }
        if (type === 'FILE_DELETED') {
            return true;
        }
        const ext = path.extname(filePath).toLowerCase();
        return CODE_EXTENSIONS.includes(ext);
    }

    /**
     * Pick priority from path heuristics.
     *
     * Order matters: a path containing both "auth" and "test" is
     * treated as critical (security-touching), not low (test).
     */
    determinePriority(filePath: string): SentinelEvent['priority'] {
        const lowerPath = filePath.toLowerCase();
        if (this.isSecuritySensitive(lowerPath)) {
            return 'critical';
        }
        if (this.isApiSurface(lowerPath)) {
            return 'high';
        }
        if (this.isTestSurface(lowerPath)) {
            return 'low';
        }
        return 'normal';
    }

    private isSecuritySensitive(lowerPath: string): boolean {
        return lowerPath.includes('auth')
            || lowerPath.includes('password')
            || lowerPath.includes('crypto')
            || lowerPath.includes('secret');
    }

    private isApiSurface(lowerPath: string): boolean {
        return lowerPath.includes('api')
            || lowerPath.includes('service')
            || lowerPath.includes('controller');
    }

    private isTestSurface(lowerPath: string): boolean {
        return lowerPath.includes('test') || lowerPath.includes('spec');
    }
}
