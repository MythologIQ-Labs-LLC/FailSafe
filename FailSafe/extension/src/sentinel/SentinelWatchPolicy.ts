/**
 * SentinelWatchPolicy - Watch / ignore classification for the Sentinel daemon.
 *
 * Owns:
 * - Watched file-extension catalog (code + governance doc formats).
 * - chokidar ignore patterns (node_modules, build output, transient
 *   `.failsafe/` subtrees, ...).
 * - Governance-path whitelist for operator-meaningful `.failsafe/**`
 *   artifacts (META_LEDGER, AUDIT_REPORT, plan-*.md, scope docs,
 *   plans.yaml, risk register, workspace-config).
 * - Priority assignment from file path heuristics.
 *
 * Phase 60 §2 Track C (B193 remediation): governance file changes
 * (`.md`, `.yaml`, `.json`) are now visible to the Sentinel verdict
 * pipeline. The previous policy DROPPED every `.failsafe/**` path and
 * only watched code extensions — META_LEDGER, AUDIT_REPORT, plan-*.md
 * and the intent store never reached arbitration.
 */
import * as path from 'path';
import { SentinelEvent, SentinelEventType } from '../shared/types';

const CODE_EXTENSIONS: ReadonlyArray<string> = [
    '.ts', '.js', '.tsx', '.jsx',
    '.py', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.cs'
];

const GOVERNANCE_DOC_EXTENSIONS: ReadonlyArray<string> = [
    '.md', '.yaml', '.yml', '.json'
];

const WATCHED_EXTENSIONS: ReadonlyArray<string> = [
    ...CODE_EXTENSIONS,
    ...GOVERNANCE_DOC_EXTENSIONS
];

// Operator-meaningful `.failsafe/**` and `docs/**` artifacts. Anything
// outside this list (e.g. `.failsafe/runtime/`, cache files) stays
// suppressed. B193 residual fix-up (2026-05-19): corrected stale
// aspirational entries to canonical fs paths; broader `.failsafe/governance/`
// prefix now covers the 70+ on-disk variant files (AUDIT_REPORT_*.md,
// RESEARCH_BRIEF_*.md, SESSION_STATE_*.md, etc.) that suffix-equality
// matching previously dropped silently.
const GOVERNANCE_WHITELIST_FILES: ReadonlyArray<string> = [
    '.failsafe/workspace-config.json',
    '.failsafe/risks/risks.json',
    '.failsafe/manifest/active_intent.json',
    'docs/META_LEDGER.md',
    'docs/BACKLOG.md'
];

const GOVERNANCE_WHITELIST_PREFIXES: ReadonlyArray<string> = [
    '.failsafe/governance/',
    '.failsafe/manifest/intents/',
    'docs/plan-'
];

const IGNORE_PATTERNS: ReadonlyArray<string> = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/*.log',
    '**/.failsafe/runtime/**',
    '**/.failsafe/cache/**',
    '**/.failsafe/archive/**'
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
     * Code-file extension catalog (lower-case, leading dot). Retained
     * for callers that only care about source-code extensions.
     */
    getCodeExtensions(): string[] {
        return [...CODE_EXTENSIONS];
    }

    /**
     * Full watched-extension set: code + governance doc formats.
     */
    getWatchedExtensions(): string[] {
        return [...WATCHED_EXTENSIONS];
    }

    /**
     * True when a path lives under the `.failsafe/` governance tree.
     */
    isGovernancePath(filePath: string): boolean {
        if (!filePath) {
            return false;
        }
        const normalized = this.normalize(filePath);
        return normalized.includes(`/${GOVERNANCE_PATH_FRAGMENT}/`)
            || normalized.startsWith(`${GOVERNANCE_PATH_FRAGMENT}/`)
            || normalized.endsWith(`/${GOVERNANCE_PATH_FRAGMENT}`)
            || normalized === GOVERNANCE_PATH_FRAGMENT;
    }

    /**
     * True when a path is on the operator-meaningful governance
     * whitelist. After B193 residual fix-up (2026-05-19), the whitelist
     * spans `.failsafe/` artifacts AND repo-canonical `docs/` governance
     * surfaces (META_LEDGER.md, BACKLOG.md, plan-*.md). The
     * `isGovernancePath` gate is preserved for `.failsafe/` paths but
     * is no longer required for whitelist membership.
     */
    isWatchedGovernancePath(filePath: string): boolean {
        if (!filePath) {
            return false;
        }
        const normalized = this.normalize(filePath);
        return this.matchesWhitelistFile(normalized)
            || this.matchesWhitelistPrefix(normalized);
    }

    /**
     * Decide whether a watcher event should be queued.
     *
     * Rules:
     * - Deletions are always observed regardless of extension or path.
     * - Governance paths require both a watched extension AND a
     *   whitelist hit. Non-whitelisted `.failsafe/**` paths are dropped.
     * - Non-governance paths must match a watched extension (code +
     *   governance doc formats).
     */
    shouldWatch(filePath: string, type: SentinelEventType): boolean {
        if (type === 'FILE_DELETED') {
            return true;
        }
        const ext = path.extname(filePath).toLowerCase();
        if (!WATCHED_EXTENSIONS.includes(ext)) {
            return false;
        }
        if (this.isGovernancePath(filePath)) {
            return this.isWatchedGovernancePath(filePath);
        }
        return true;
    }

    /**
     * Pick priority from path heuristics.
     */
    determinePriority(filePath: string): SentinelEvent['priority'] {
        const lowerPath = filePath.toLowerCase();
        if (this.isSecuritySensitive(lowerPath)) {
            return 'critical';
        }
        if (this.isGovernanceSurface(lowerPath)) {
            return 'high';
        }
        if (this.isApiSurface(lowerPath)) {
            return 'high';
        }
        if (this.isTestSurface(lowerPath)) {
            return 'low';
        }
        return 'normal';
    }

    private normalize(filePath: string): string {
        return filePath.replace(/\\/g, '/').toLowerCase();
    }

    private matchesWhitelistFile(normalized: string): boolean {
        return GOVERNANCE_WHITELIST_FILES.some((entry) => {
            const target = entry.toLowerCase();
            return normalized === target || normalized.endsWith(`/${target}`);
        });
    }

    private matchesWhitelistPrefix(normalized: string): boolean {
        return GOVERNANCE_WHITELIST_PREFIXES.some((prefix) => {
            const target = prefix.toLowerCase();
            return normalized.startsWith(target)
                || normalized.includes(`/${target}`);
        });
    }

    private isSecuritySensitive(lowerPath: string): boolean {
        return lowerPath.includes('auth')
            || lowerPath.includes('password')
            || lowerPath.includes('crypto')
            || lowerPath.includes('secret');
    }

    private isGovernanceSurface(lowerPath: string): boolean {
        const normalized = lowerPath.replace(/\\/g, '/');
        if (normalized.includes('/.failsafe/governance/')
            || normalized.startsWith('.failsafe/governance/')
            || normalized.endsWith('/workspace-config.json')) {
            return true;
        }
        // B193 residual fix-up: docs/ governance surfaces now priority-boosted
        // alongside .failsafe/governance/ paths. Mutations to META_LEDGER,
        // BACKLOG, and plan-*.md are operator-meaningful and should arrive at
        // the verdict pipeline as 'high' priority, not 'normal'.
        return normalized === 'docs/meta_ledger.md'
            || normalized.endsWith('/docs/meta_ledger.md')
            || normalized === 'docs/backlog.md'
            || normalized.endsWith('/docs/backlog.md')
            || normalized.includes('/docs/plan-')
            || normalized.startsWith('docs/plan-');
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
