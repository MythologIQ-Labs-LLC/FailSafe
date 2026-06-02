import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFileSync } from 'child_process';
import type { ModuleResult, SubstrateFinding } from './types';
import {
  parseDirectDeps,
  diffDeps,
  parseOverrideEntries,
  evaluateBumps,
  DEFAULT_THRESHOLD_DAYS,
  type DepEntry,
} from './dependency-admission-core';

/**
 * DependencyAdmissionLintModule — Node-archetype port of
 * qor.scripts.dependency_admission_lint (B-SUBSTRATE-2).
 *
 * Diffs direct dependencies in package.json against the merge-base of
 * origin/main, queries the npm registry for each new/bumped version's publish
 * time, and emits a WARN finding for any version published within the cooling
 * window (default 14 days) that has no `**Dependency admission override**`
 * entry in docs/META_LEDGER.md. WARN-only: never blocks any workflow.
 *
 * All I/O (git, registry, clock) is injectable so the cooling logic is tested
 * deterministically without live network calls (B-BIC-24 lesson).
 */

export interface DepAdmitIO {
  resolveBaseRef(workspaceRoot: string): string | null;
  gitShow(ref: string, relPath: string, workspaceRoot: string): string | null;
  fetchPublishTime(name: string, version: string): Promise<Date | null>;
  now(): Date;
}

export interface DepAdmitOptions {
  manifestRelPath?: string;
  ledgerRelPath?: string;
  thresholdDays?: number;
  io?: Partial<DepAdmitIO>;
}

const DEFAULT_IO: DepAdmitIO = {
  resolveBaseRef(workspaceRoot) {
    try {
      return execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      }).trim();
    } catch {
      return null;
    }
  },
  gitShow(ref, relPath, workspaceRoot) {
    try {
      // git wants forward slashes even on Windows.
      const spec = `${ref}:${relPath.split(path.sep).join('/')}`;
      return execFileSync('git', ['show', spec], {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      return null;
    }
  },
  async fetchPublishTime(name, version) {
    // npm packument: time map keyed by version. Scoped names encode the slash.
    const encoded = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : name;
    const url = `https://registry.npmjs.org/${encoded}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const iso = await new Promise<string | null>((resolve, reject) => {
          const req = https.get(
            url,
            { headers: { 'User-Agent': 'failsafe/dependency-admission-lint', Accept: 'application/json' }, timeout: 5000 },
            (res) => {
              if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
              }
              const chunks: Buffer[] = [];
              res.on('data', (c) => chunks.push(c as Buffer));
              res.on('end', () => {
                try {
                  const doc = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
                    time?: Record<string, string>;
                  };
                  resolve(doc.time?.[version] ?? null);
                } catch (e) {
                  reject(e as Error);
                }
              });
            },
          );
          req.on('timeout', () => req.destroy(new Error('timeout')));
          req.on('error', reject);
        });
        if (iso === null) return null; // version not in registry time map
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? null : d;
      } catch {
        if (attempt === 2) return null;
      }
    }
    return null;
  },
  now() {
    return new Date();
  },
};

export class DependencyAdmissionLintModule {
  readonly name = 'dependency_admission_lint';

  private readonly manifestRelPath: string;
  private readonly ledgerRelPath: string;
  private readonly thresholdDays: number;
  private readonly io: DepAdmitIO;

  constructor(private readonly workspaceRoot: string, opts: DepAdmitOptions = {}) {
    this.manifestRelPath = opts.manifestRelPath ?? this.detectManifest(workspaceRoot);
    this.ledgerRelPath = opts.ledgerRelPath ?? path.join('docs', 'META_LEDGER.md');
    this.thresholdDays = opts.thresholdDays ?? DEFAULT_THRESHOLD_DAYS;
    this.io = { ...DEFAULT_IO, ...opts.io };
  }

  private detectManifest(ws: string): string {
    const nested = path.join('FailSafe', 'extension', 'package.json');
    if (fs.existsSync(path.join(ws, nested))) return nested;
    return 'package.json';
  }

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    const done = (
      findings: SubstrateFinding[],
      note?: string,
    ): ModuleResult => ({
      module: this.name,
      ok: true, // WARN-only: this module never blocks
      findings,
      summary: {
        count: findings.length,
        bySeverity: {
          info: findings.filter((f) => f.severity === 'info').length,
          warn: findings.filter((f) => f.severity === 'warn').length,
          high: 0,
        },
        note,
      },
      durationMs: Date.now() - startedAt,
    });

    const manifestAbs = path.join(this.workspaceRoot, this.manifestRelPath);
    if (!fs.existsSync(manifestAbs)) {
      return done([], `manifest not found at ${this.manifestRelPath}`);
    }

    let current: DepEntry[];
    try {
      current = parseDirectDeps(fs.readFileSync(manifestAbs, 'utf-8'));
    } catch (e) {
      return done([], `manifest parse error: ${(e as Error).message}`);
    }

    const baseRef = this.io.resolveBaseRef(this.workspaceRoot);
    const baseText = baseRef ? this.io.gitShow(baseRef, this.manifestRelPath, this.workspaceRoot) : null;
    let base: DepEntry[];
    try {
      base = baseText ? parseDirectDeps(baseText) : [];
    } catch {
      base = [];
    }

    const bumps = diffDeps(current, base);
    if (bumps.length === 0) {
      return done([], baseRef ? 'no dependency changes vs base' : 'no base ref; nothing compared');
    }

    const ledgerAbs = path.join(this.workspaceRoot, this.ledgerRelPath);
    const ledgerText = fs.existsSync(ledgerAbs) ? fs.readFileSync(ledgerAbs, 'utf-8') : '';
    const overrideKeys = parseOverrideEntries(ledgerText);

    // Resolve publish times (network) up front, then evaluate via pure logic.
    const publishTimes = new Map<string, Date | null>();
    for (const bump of bumps) {
      publishTimes.set(`${bump.name}@${bump.newVersion}`, await this.io.fetchPublishTime(bump.name, bump.newVersion));
    }

    const result = evaluateBumps(
      bumps,
      overrideKeys,
      (name, version) => publishTimes.get(`${name}@${version}`) ?? null,
      this.io.now(),
      this.thresholdDays,
    );

    const findings: SubstrateFinding[] = [];
    for (const v of result.violations) {
      const report = result.reports.find((r) => r.name === v.name && r.newVersion === v.newVersion);
      findings.push({
        module: this.name,
        severity: 'warn',
        rule: 'within-cooling-window',
        message:
          `${v.name}@${v.newVersion} was published ${report?.ageDays ?? '?'} day(s) ago ` +
          `(within the ${this.thresholdDays}-day cooling window) with no admission override. ` +
          `Add a "**Dependency admission override**: ${v.name}@${v.newVersion}; upload_age_days=N; justification=..." ` +
          `entry to docs/META_LEDGER.md to admit it.`,
        location: { file: this.manifestRelPath },
      });
    }
    for (const errKey of result.registryErrors) {
      findings.push({
        module: this.name,
        severity: 'info',
        rule: 'registry-query-failed',
        message: `Could not resolve npm publish time for ${errKey}; cooling-period check skipped for this entry.`,
        location: { file: this.manifestRelPath },
      });
    }

    const note =
      `${bumps.length} dependency change(s) vs base; ` +
      `${result.violations.length} within-window violation(s), ${result.registryErrors.length} registry error(s).`;
    return done(findings, note);
  }
}
