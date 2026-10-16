/**
 * riskImportBatch - write an import's records to the risk register in chunks
 * (v6.0.8 #528, LD-5).
 *
 * With a batch runner (RiskRegisterManager.importSink().batch), each chunk of
 * up to 500 records is one register update: one lock, one fresh read, one
 * write. 500 keeps a chunk's lock hold far inside the lock budget even on a
 * large register (about 0.2 s at 20,000 stored records on Windows), so a
 * waiting update from another window waits for one chunk, not the import.
 * Without a batch runner every record is written on its own (the v6.0.7 path).
 *
 * Accounting is per chunk. A record whose write throws is counted failed and
 * the chunk goes on. A chunk whose update fails as a whole wrote nothing: all
 * its records are counted failed and its side tallies are dropped; earlier
 * chunks stay written and the next chunk is still attempted.
 */

import type { UpsertOutcome } from "./RiskRegisterManager";

/**
 * What one import wrote. Stable shape: Lane B's integration status maps
 * failed > 0 or chunksFailed > 0 to a failing storage state.
 */
export interface ImportWriteOutcome {
  /** Records the register accepted. */
  written: number;
  /** `written` broken down, when the writer reports an UpsertOutcome. */
  created: number;
  updated: number;
  unchanged: number;
  /** Records not written: their own write threw, or their chunk failed. */
  failed: number;
  chunks: number;
  chunksFailed: number;
  /** The first message of a failed chunk's update. */
  writeError?: string;
}

/** Runs `write` as one register update; throws when the update fails. */
export type ImportBatch = (write: () => void) => void;

export interface ChunkWriter<R, S> {
  /** Write one record, adding any side tally to `side`. Throwing fails the record. */
  write(record: R, side: S): unknown;
  /** A fresh side tally for one chunk. */
  newSide(): S;
  /** Keep the side tally of a chunk that was written. */
  keep(side: S): void;
}

export const IMPORT_CHUNK_SIZE = 500;

const OUTCOMES: ReadonlySet<unknown> = new Set<UpsertOutcome>(["created", "updated", "unchanged"]);

export function emptyWriteOutcome(): ImportWriteOutcome {
  return { written: 0, created: 0, updated: 0, unchanged: 0, failed: 0, chunks: 0, chunksFailed: 0 };
}

function writeChunk<R, S>(chunk: R[], writer: ChunkWriter<R, S>, side: S, tally: ImportWriteOutcome): void {
  for (const record of chunk) {
    try {
      const result = writer.write(record, side);
      tally.written++;
      if (OUTCOMES.has(result)) tally[result as UpsertOutcome]++;
    } catch {
      tally.failed++;
    }
  }
}

function addCounts(into: ImportWriteOutcome, from: ImportWriteOutcome): void {
  into.written += from.written;
  into.created += from.created;
  into.updated += from.updated;
  into.unchanged += from.unchanged;
  into.failed += from.failed;
}

export function writeInChunks<R, S>(
  records: R[],
  writer: ChunkWriter<R, S>,
  batch?: ImportBatch,
  chunkSize = IMPORT_CHUNK_SIZE,
): ImportWriteOutcome {
  const out = emptyWriteOutcome();
  for (let start = 0; start < records.length; start += chunkSize) {
    const chunk = records.slice(start, start + chunkSize);
    const tally = emptyWriteOutcome();
    const side = writer.newSide();
    out.chunks++;
    try {
      if (batch) batch(() => writeChunk(chunk, writer, side, tally));
      else writeChunk(chunk, writer, side, tally);
    } catch (error) {
      out.chunksFailed++;
      out.failed += chunk.length;
      out.writeError ??= error instanceof Error ? error.message : String(error);
      continue;
    }
    addCounts(out, tally);
    writer.keep(side);
  }
  return out;
}
