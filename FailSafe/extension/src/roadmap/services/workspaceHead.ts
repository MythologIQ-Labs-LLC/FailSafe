/**
 * #532 (plan-532c LD8, B284): the workspace's HEAD commit, read from disk.
 *
 * Hub checkpoints record the HEAD of this workspace. A git spawn per checkpoint costs about 40 ms
 * on Windows (200 measured at 8.0 s) and every Sentinel verdict records two checkpoints, so the
 * HEAD is read from the repository files instead.
 */

import * as fs from 'fs';

export const UNKNOWN_HEAD = 'unknown';

/** File access the reader uses (injectable so tests can see which paths were read). */
export interface HeadIo {
  readText(p: string, maxBytes: number): string | null;
  stat(p: string): fs.Stats | null;
}

export const defaultHeadIo: HeadIo = {
  readText(p, maxBytes) { void p; void maxBytes; return null; },
  stat(p) { void p; return null; },
};

/** Used only for a layout the reader does not handle (reftable); full name or null. */
export type HeadFallback = (root: string) => string | null;

export interface WorkspaceHeadOptions {
  io?: HeadIo;
  fallback?: HeadFallback;
  now?: () => number;
}

export function readWorkspaceHead(root: string, options: WorkspaceHeadOptions = {}): string {
  void root; void options; // RED STUB
  return UNKNOWN_HEAD;
}
