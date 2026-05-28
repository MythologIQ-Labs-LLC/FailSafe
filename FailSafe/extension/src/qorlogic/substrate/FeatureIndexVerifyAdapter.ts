import * as fs from 'fs';
import * as path from 'path';
import type { ModuleResult, SubstrateFinding } from './types';

/**
 * FeatureIndexVerifyAdapter — TS-local adapter (NOT a Python subprocess).
 *
 * Upstream `qor.scripts.feature_index_verify` expects column header
 * "verification status"; FailSafe canonical header is `Status`. To ship v1
 * without depending on an upstream PR, this adapter implements the same
 * intent locally: scan `docs/FEATURE_INDEX.md`, find rows that are
 * `unverified` or have an empty test-path cell, and emit one SubstrateFinding
 * per offender.
 *
 * WARN-only posture: findings surface in the substrate run report; never block.
 */
export class FeatureIndexVerifyAdapter {
  readonly name = 'feature_index_verify';

  constructor(private readonly workspaceRoot: string) {}

  async run(): Promise<ModuleResult> {
    const startedAt = Date.now();
    const indexPath = path.join(this.workspaceRoot, 'docs', 'FEATURE_INDEX.md');
    if (!fs.existsSync(indexPath)) {
      return {
        module: this.name,
        ok: true,
        findings: [],
        summary: {
          count: 0,
          bySeverity: { info: 0, warn: 0, high: 0 },
          note: 'docs/FEATURE_INDEX.md not present in workspace',
        },
        durationMs: Date.now() - startedAt,
      };
    }

    const raw = fs.readFileSync(indexPath, 'utf-8');
    const findings: SubstrateFinding[] = [];

    const lines = raw.split(/\r?\n/);
    // Walk for table headers (`| ID |` style) and parse subsequent rows
    // until we hit a blank line or a non-table line.
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!isHeaderRow(line)) continue;
      const headers = parseCells(line);
      const idIdx = indexOfHeader(headers, 'id');
      const testIdx = indexOfHeader(headers, 'test');
      const statusIdx = indexOfHeader(headers, 'status');
      if (idIdx === -1 || testIdx === -1 || statusIdx === -1) continue;
      // Skip the separator row (|---|---|).
      let j = i + 1;
      if (lines[j] && /^\s*\|[\s-:|]+\|\s*$/.test(lines[j])) j += 1;
      for (; j < lines.length; j += 1) {
        const row = lines[j];
        if (!row.trim().startsWith('|')) break;
        const cells = parseCells(row);
        // Tolerate malformed rows: skip if column count below header count.
        if (cells.length < headers.length) continue;
        const id = cells[idIdx].trim();
        const testPath = cells[testIdx].trim();
        const status = cells[statusIdx].trim().toLowerCase();
        if (!id) continue;
        if (status === 'unverified') {
          findings.push({
            module: this.name,
            severity: 'warn',
            rule: 'unverified-entry',
            message: `Feature ${id} is unverified`,
            location: { file: 'docs/FEATURE_INDEX.md', line: j + 1 },
          });
          continue;
        }
        if (!testPath) {
          findings.push({
            module: this.name,
            severity: 'warn',
            rule: 'missing-test-path',
            message: `Feature ${id} has no test path cited`,
            location: { file: 'docs/FEATURE_INDEX.md', line: j + 1 },
          });
        }
      }
      i = j - 1;
    }

    return {
      module: this.name,
      ok: true,
      findings,
      summary: {
        count: findings.length,
        bySeverity: { info: 0, warn: findings.length, high: 0 },
      },
      durationMs: Date.now() - startedAt,
    };
  }
}

function parseCells(row: string): string[] {
  // Strip leading/trailing pipes then split. Inner pipes inside cells are
  // exceedingly rare in this doc; the FailSafe index never uses them.
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|');
}

function isHeaderRow(line: string): boolean {
  if (!line.trim().startsWith('|')) return false;
  const cells = parseCells(line).map((c) => c.trim().toLowerCase());
  return cells.includes('id') && cells.includes('status');
}

function indexOfHeader(headers: string[], needle: string): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  return lower.indexOf(needle);
}
