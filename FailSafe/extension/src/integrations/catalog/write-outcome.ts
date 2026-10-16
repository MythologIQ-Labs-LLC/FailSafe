/**
 * write-outcome — the part of a risk-import write outcome the health mappings
 * read (#479). It matches, by name and nesting, the `write: ImportWriteOutcome`
 * the batched risk imports return; when an importer result has no `write`
 * field, the importer's own `failed` count decides.
 */

export interface WriteCounts {
  failed: number;
  chunksFailed: number;
}

/** True when any record or any chunk of the import was not written. */
export function writeFailed(o: { failed?: number; write?: Partial<WriteCounts> }): boolean {
  return (o.failed ?? 0) > 0 || (o.write?.failed ?? 0) > 0 || (o.write?.chunksFailed ?? 0) > 0;
}
