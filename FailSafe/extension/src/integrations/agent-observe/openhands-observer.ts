/**
 * openhands-observer — pure, READ-ONLY observer adapter for OpenHands agent runs
 * (#105). Maps OpenHands run/step events (actions + observations) into a
 * normalized FailSafe transparency record. Documents the supported API surface
 * and degrades gracefully on an unsupported version. Never mutates an active
 * run: per the OpenHands contract, tools are fixed in the system prompt, so a
 * tool-policy change must start a NEW conversation/fork rather than mutate a
 * live run — this adapter only observes and so honors that by construction.
 *
 * Schema fidelity: grounded in the OpenHands SDK event API reference — base
 * `Event` (`id`, `timestamp`, `source`), `ActionEvent` (OBJECT `action` +
 * STRING `tool_name`), `ObservationEvent` (OBJECT `observation` + `tool_name`).
 * The verb is taken from `tool_name`; a flattened export with a string
 * `action`/`observation` is also tolerated. CAVEAT: the inner `Action`/
 * `Observation` object field layout (where per-tool args live) was not
 * fully confirmable from rendered docs (referenced to GitHub SDK source), so v1
 * surfaces tool-name + risk hint only and should be validated once against a
 * real exported run before relying on per-arg detail.
 *
 * Pure (no fs/network); the command layer supplies the events (e.g. from an
 * exported run JSON) and the version string.
 */

export type RiskSeverity = 'high' | 'warn' | 'info';

/** Documented supported OpenHands major lines (pre-2.0). See the docs index. */
export const OPENHANDS_SUPPORTED_MAJORS = ['0', '1'] as const;

/** True if `version`'s major is in the supported set. Undefined/garbage → false. */
export function isOpenHandsVersionSupported(version: string | undefined, supported: ReadonlyArray<string> = OPENHANDS_SUPPORTED_MAJORS): boolean {
  const m = /^(\d+)\./.exec((version ?? '').trim());
  if (!m) return false;
  return supported.includes(m[1]);
}

export interface AgentObservationEvent {
  id: string;
  source: 'openhands';
  /** 'action' (agent did something) or 'observation' (environment responded). */
  kind: 'action' | 'observation';
  /** The action/observation verb (e.g. 'run', 'edit', 'read', 'browse'). */
  verb: string;
  tool?: string;
  riskHint: RiskSeverity;
  timestamp?: string;
  summary: string;
}

const HIGH_VERBS = ['run', 'execute', 'cmd', 'command', 'shell', 'bash', 'browse'];
const WARN_VERBS = ['edit', 'write', 'create', 'delete', 'patch', 'modify'];

function riskHintFor(verb: string): RiskSeverity {
  const v = verb.toLowerCase();
  if (HIGH_VERBS.some((h) => v.includes(h))) return 'high';
  if (WARN_VERBS.some((h) => v.includes(h))) return 'warn';
  return 'info';
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Extract a class/kind label from an SDK `action`/`observation` OBJECT
 *  (e.g. `{ kind: 'ExecuteBashAction' }`) — the documented schema types these
 *  fields as objects, not strings. */
function objLabel(v: unknown): string | undefined {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return str(o.kind) ?? str(o.type) ?? str(o.name);
  }
  return undefined;
}

/**
 * Map one OpenHands event → a normalized observation record.
 *
 * Grounded in the OpenHands SDK event schema
 * (docs.openhands.dev/sdk/api-reference/openhands.sdk.event): the base `Event`
 * carries `id` + `timestamp`; `ActionEvent` has an OBJECT `action` + a STRING
 * `tool_name`; `ObservationEvent` has an OBJECT `observation` + `tool_name`.
 * The meaningful verb is therefore `tool_name` (e.g. `execute_bash`,
 * `str_replace_editor`), NOT a string `action` field. We discriminate by which
 * key is present and ALSO tolerate a flattened export where `action`/
 * `observation` is a plain string verb. Returns null when neither key is present.
 */
export function mapOpenHandsEvent(raw: unknown, index = 0): AgentObservationEvent | null {
  const e = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!e) return null;
  const hasAction = e.action !== undefined && e.action !== null;
  const hasObs = e.observation !== undefined && e.observation !== null;
  if (!hasAction && !hasObs) return null;
  const kind: 'action' | 'observation' = hasAction ? 'action' : 'observation';

  const discrim = hasAction ? e.action : e.observation;
  // Real SDK: tool_name is the verb. Flattened export: action/observation is a
  // string verb. Last resort: the action/observation object's kind label.
  const toolName = str(e.tool_name) ?? str(e.tool); // `tool_name` is the documented field; `tool` a defensive alt
  const verb = toolName ?? str(discrim) ?? objLabel(discrim) ?? kind;

  const id = str(e.id) ?? str(e.message_id) ?? `openhands:${index}`;
  const riskBasis = `${verb} ${objLabel(discrim) ?? ''}`;

  return {
    id,
    source: 'openhands',
    kind,
    verb,
    tool: toolName,
    riskHint: riskHintFor(riskBasis),
    timestamp: str(e.timestamp) ?? str(e.created_at),
    summary: `${kind}:${verb}`,
  };
}

export interface ObserveResult {
  supported: boolean;
  degraded?: string;
  records: AgentObservationEvent[];
}

/**
 * Observe a sequence of OpenHands events. If a version is given and unsupported,
 * degrade gracefully: surface a notice, map nothing (do not guess at a schema we
 * do not support). Otherwise map all recognizable events.
 */
export function observeOpenHandsRun(events: unknown, version?: string): ObserveResult {
  if (version !== undefined && !isOpenHandsVersionSupported(version)) {
    return { supported: false, degraded: `OpenHands ${version} is outside the supported majors (${OPENHANDS_SUPPORTED_MAJORS.join(', ')}.x); observing disabled.`, records: [] };
  }
  const list = Array.isArray(events) ? events : [];
  const records = list.map((e, i) => mapOpenHandsEvent(e, i)).filter((r): r is AgentObservationEvent => !!r);
  return { supported: true, records };
}

/**
 * The OpenHands tool-policy contract: tools live in the system prompt and cannot
 * change mid-conversation. A policy change therefore starts a new conversation/
 * fork — NEVER a silent mutation of the active run. This helper encodes that as
 * the only legal outcome (asserted by tests); the observer never mutates a run.
 */
export function planToolPolicyChange(): { action: 'new-conversation'; mutatesActiveRun: false } {
  return { action: 'new-conversation', mutatesActiveRun: false };
}
