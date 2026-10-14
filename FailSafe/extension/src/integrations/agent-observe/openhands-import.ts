/** Persist historical OpenHands observations with explicit failure and stable dedup. */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { AgentObservationEvent } from './openhands-observer';

export interface OpenHandsImportResult { imported: number; duplicates: number; }
export function persistOpenHandsObservations(
  workspaceRoot: string, sourceFile: string, events: readonly AgentObservationEvent[],
): OpenHandsImportResult {
  const target = path.join(workspaceRoot, '.failsafe', 'logs', 'transparency.jsonl');
  const sourceHash = createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
  const lockPath = target + '.openhands-import.lock';
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Serialize cooperating importers: duplicate checks and append share a lock.
  // Never silently steal a stale lock. Operator recovery must inspect it first.
  let lockFd: number;
  try { lockFd = fs.openSync(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('OPENHANDS_IMPORT_LOCKED: inspect interrupted import before manually removing lock');
    }
    throw error;
  }
  try {
    const existing = new Set<string>();
    if (fs.existsSync(target)) {
      for (const line of fs.readFileSync(target, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(line); }
        catch { throw new Error('OPENHANDS_IMPORT_CORRUPT_LOG: existing transparency log contains invalid JSON'); }
        if (parsed && typeof parsed === 'object') {
          const key = (parsed as Record<string, unknown>).importKey;
          if (typeof key === 'string') existing.add(key);
        }
      }
    }
    const seen = new Set(existing);
    let duplicates = 0;
    const pending: Record<string, unknown>[] = [];
    for (const event of events) {
      const key = createHash('sha256').update(sourceHash + ':' + event.id + ':' + event.kind).digest('hex');
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      pending.push({
        type: 'agent.observation.imported', source: 'openhands', origin: 'historical-export',
        importKey: key, sourceSha256: sourceHash, sourceEventId: event.id,
        timestamp: event.timestamp ?? null, kind: event.kind, tool: event.tool ?? null,
        severity: event.riskHint, summary: event.summary,
      });
    }
    if (pending.length) {
      fs.appendFileSync(target, pending.map(e => JSON.stringify(e)).join('\n') + '\n', { encoding: 'utf8', flag: 'a', mode: 0o600 });
    }
    return { imported: pending.length, duplicates };
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lockPath);
  }
}
