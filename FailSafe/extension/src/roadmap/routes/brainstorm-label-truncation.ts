// Brainstorm node-label truncation helpers (B132).
// Tiny leaf: the server-side label cap + the additive response augmentation
// used by both the POST /node and PATCH /node/:id handlers in BrainstormRoute.

/**
 * Maximum stored length of a brainstorm node label. Labels longer than this
 * are truncated server-side; responses carry additive `labelTruncated` +
 * `labelOriginalLength` fields so clients can surface a non-blocking notice.
 */
export const NODE_LABEL_MAX = 200;

/**
 * Returns the node payload, additively augmented with `labelTruncated: true`
 * + `labelOriginalLength` when the raw label exceeded NODE_LABEL_MAX.
 * When no truncation occurred the node is returned unchanged, preserving
 * the prior `res.json(node)` shape for existing consumers.
 */
export function withTruncationInfo<T extends object>(
  node: T,
  rawLabel: string,
): object {
  if (rawLabel.length > NODE_LABEL_MAX) {
    return { ...node, labelTruncated: true, labelOriginalLength: rawLabel.length };
  }
  return node;
}
