/**
 * #538 (plan-538b LD5-LD7): Console install routes run only an operation the server built,
 * after the operator approves exactly that operation in a modal VS Code dialog.
 *
 * Each route resolves its operation from an allowlist of request keys (catalog entry by id,
 * constant pip specs, validated hosts), hands it to `authorizeOperatorAction`, and executes
 * only the frozen copy that comes back. The approval is recorded in the FailSafe ledger
 * before anything runs: with a usable ledger a failed write stops the run; with no ledger
 * the run proceeds and the response says it was not recorded. The install's outcome is in
 * the response and the broadcasts, not in a second ledger entry.
 */
import type { Response } from "express";
import { rateLimit } from "express-rate-limit";
import type { McpCatalogEntry } from "../../integrations/mcp-catalog/mcp-catalog";
import { buildMcpServerEntry } from "../../integrations/mcp-catalog/mcp-installer";
import type { InstallMode } from "../../integrations/bicameral";
import { QOR_LOGIC_HOSTS, type QorLogicHost } from "../../qorlogic/hostLayouts";
import type { QorLogicScope } from "../../qorlogic/QorLogicSkillIngestor";
import {
  BATCH_LIST_LIMIT, confirmBoundOperation, sanitizeDialogText, withFooter,
  type ConfirmOperatorAction, type OperatorActionRequest,
} from "../../extension/operatorConfirmation";
import { usableLedger } from "../../governance/architecture/ArchitectureIndexBootstrap";
import { describeOperatorAuthentication } from "../../shared/types/operatorAuthentication";

/** Deps every gated install route reads at request time. */
export interface OperatorActionDeps {
  confirmOperatorAction?: ConfirmOperatorAction;
  getLedgerManager?: () => unknown;
  /** Test seam; defaults to CONFIRMATION_DEADLINE_MS. */
  confirmationDeadlineMs?: number;
}

export type InstallOperation =
  | { kind: "mcp-install"; entry: McpCatalogEntry; configFile: string }
  | { kind: "bicameral-install"; mode: InstallMode; pipSpec: string; setupCommand: string }
  | { kind: "qorlogic-skills-install"; hosts: QorLogicHost[]; scope: QorLogicScope; skillFilter?: Record<string, string[]> }
  | { kind: "qorlogic-skills-prompt" }
  | { kind: "adapter-install"; upgrade: boolean; installToolkit: boolean; commands: string[][] }
  | { kind: "adapter-uninstall"; commands: string[][] }
  | { kind: "agt-terminal-prefill"; moduleId: string; label: string; command: string };

export const CONSOLE_AGENT_DID = "did:failsafe:console";

/** Five requests a minute per route family; mounted after the Console request guard. */
export function newInstallLimiter() {
  return rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: false, legacyHeaders: false });
}

const pip3 = (args: readonly string[]) => `pip3 ${args.join(" ")}`;
const list = (items: string[], limit = BATCH_LIST_LIMIT) =>
  items.length > limit ? `${items.slice(0, limit).join(", ")} and ${items.length - limit} more` : items.join(", ");

function operationLines(op: InstallOperation): { title: string; approveLabel: string; lines: string[] } {
  switch (op.kind) {
    case "mcp-install": {
      const server = buildMcpServerEntry(op.entry);
      return {
        title: "Add this MCP server to .mcp.json?", approveLabel: "Install",
        lines: [
          `Server: ${op.entry.name} (${op.entry.id})`,
          `File: ${op.configFile} in this workspace`,
          `Entry: ${server.command} ${server.args.join(" ")}`,
          "FailSafe merges this one entry into the file; the other servers in it are kept.",
        ],
      };
    }
    case "bicameral-install":
      return {
        title: "Install Bicameral MCP?", approveLabel: "Install",
        lines: [
          `Mode (as requested): ${op.mode}`,
          `Step 1: pip install '${op.pipSpec}' (run in a new temporary folder)`,
          op.mode === "team"
            ? `Step 2: opens a terminal pre-filled with ${op.setupCommand}; it runs when you press Enter`
            : `Step 2: ${op.setupCommand} (run in this workspace; writes .bicameral/config.yaml)`,
        ],
      };
    case "qorlogic-skills-install":
      return {
        title: "Install Qor-logic skills?", approveLabel: "Install",
        lines: [
          `Hosts (as requested): ${op.hosts.join(", ")}`,
          `Scope (as requested): ${op.scope}`,
          ...op.hosts.map((h) => `Skills for ${h}: ${op.skillFilter?.[h]?.length ? list(op.skillFilter[h]) : "all"}`),
          "FailSafe first installs or upgrades the qor-logic Python package when it is below the minimum version, then runs qor install for each host.",
        ],
      };
    case "qorlogic-skills-prompt":
      return {
        title: "Install Qor-logic skills?", approveLabel: "Continue",
        lines: [
          "You choose the hosts and the scope next, in VS Code.",
          "FailSafe first installs or upgrades the qor-logic Python package when it is below the minimum version.",
        ],
      };
    case "adapter-install":
      return {
        title: "Install the agent-failsafe adapter?", approveLabel: "Install",
        lines: [
          ...op.commands.map((c) => `Runs: ${pip3(c)}`),
          ...(op.installToolkit ? ["A toolkit package that fails to install does not stop the adapter install."] : []),
        ],
      };
    case "adapter-uninstall":
      return { title: "Uninstall the agent-failsafe adapter?", approveLabel: "Uninstall", lines: op.commands.map((c) => `Runs: ${pip3(c)}`) };
    case "agt-terminal-prefill":
      return {
        title: "Open a terminal with this AGT install command?", approveLabel: "Open terminal",
        lines: [
          `Module: ${op.label} (${op.moduleId})`,
          `Terminal: AGT: ${op.label}`,
          `Command: ${op.command}`,
          "The command is pre-filled; it runs only when you press Enter in the terminal.",
        ],
      };
  }
}

/** The modal for `op`: every value is server-side except those marked "as requested". */
export function describeInstallOperation(op: InstallOperation, operationId: string): OperatorActionRequest {
  const { title, approveLabel, lines } = operationLines(op);
  return {
    title, approveLabel,
    detail: withFooter([
      ...lines.map((l) => sanitizeDialogText(l, 400)),
      "",
      `Operation: ${operationId}`,
      "This request expires in 2 minutes; approving it later does nothing.",
    ]),
  };
}

export type ActionLedgerRecord = { entryId: number } | "unavailable" | "failed";

interface ActionLedger {
  appendEntry(request: {
    eventType: "SYSTEM_EVENT"; agentDid: string; agentTrustAtAction: number;
    overseerDecision: string; payload: Record<string, unknown>;
  }): Promise<{ id: number; entryHash?: string }>;
}

/** Append the authorization; a stub entry (disabled ledger) counts as unavailable. */
export async function recordOperatorAction(
  ledger: unknown, operationId: string, operation: InstallOperation, channel: string,
): Promise<ActionLedgerRecord> {
  const usable = usableLedger(ledger) as unknown as ActionLedger | null;
  if (!usable) return "unavailable";
  try {
    const entry = await usable.appendEntry({
      eventType: "SYSTEM_EVENT", agentDid: CONSOLE_AGENT_DID, agentTrustAtAction: 0, overseerDecision: "APPROVED",
      payload: {
        kind: "operator-action-authorized", operationId, operation,
        authentication: describeOperatorAuthentication({ method: "vscode-modal-confirmation", channel }),
      },
    });
    if (!entry || !(entry.id > 0) || entry.entryHash === "STUB_DISABLED") return "unavailable";
    return { entryId: entry.id };
  } catch {
    return "failed";
  }
}

export interface AuthorizedOperation<T extends InstallOperation> {
  operationId: string;
  operation: T;
  ledger: "recorded" | "unavailable";
  ledgerEntryId?: number;
}

/** The response fields every gated install answer carries. */
export function authorizationFields(a: AuthorizedOperation<InstallOperation>): Record<string, unknown> {
  return { operationId: a.operationId, ledger: a.ledger, ...(a.ledgerEntryId ? { ledgerEntryId: a.ledgerEntryId } : {}) };
}

/**
 * Confirm `operation` in VS Code, then record the approval. Returns the frozen operation to
 * execute, or null when the request has been answered (not approved, expired, cancelled,
 * or the ledger write failed).
 */
export async function authorizeOperatorAction<T extends InstallOperation>(
  deps: OperatorActionDeps, res: Response, operation: T, routePath: string,
): Promise<AuthorizedOperation<T> | null> {
  const bound = await confirmBoundOperation(
    deps.confirmOperatorAction, operation, describeInstallOperation, res, { deadlineMs: deps.confirmationDeadlineMs },
  );
  if (!bound) return null;
  const record = await recordOperatorAction(deps.getLedgerManager?.(), bound.operationId, bound.operation, `console:${routePath}`);
  if (record === "failed") {
    res.status(500).json({
      ok: false, ledger: "failed", operationId: bound.operationId,
      error: "The approved operation could not be recorded in the FailSafe ledger; nothing was run.",
    });
    return null;
  }
  return record === "unavailable"
    ? { ...bound, ledger: "unavailable" }
    : { ...bound, ledger: "recorded", ledgerEntryId: record.entryId };
}

/** A mutable copy of a frozen operation value, for callees that may change what they get. */
export function thaw<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

type Resolved<T> = { ok: true; operation: T } | { ok: false; status: number; error: string };
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_SKILLS_PER_HOST = 200;

/** Scaffold request -> operation. Hosts from QOR_LOGIC_HOSTS only; no hosts -> the VS Code prompt. */
export function resolveScaffoldOperation(
  body: unknown,
): Resolved<Extract<InstallOperation, { kind: "qorlogic-skills-install" | "qorlogic-skills-prompt" }>> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const bad = (error: string) => ({ ok: false as const, status: 400, error });
  if (b.hosts === undefined || (Array.isArray(b.hosts) && b.hosts.length === 0)) {
    return { ok: true, operation: { kind: "qorlogic-skills-prompt" } };
  }
  if (!Array.isArray(b.hosts)) return bad("hosts must be a list of Qor-logic hosts");
  const hosts: QorLogicHost[] = [];
  for (const h of b.hosts) {
    if (typeof h !== "string" || !QOR_LOGIC_HOSTS.includes(h as QorLogicHost)) {
      return bad(`unknown Qor-logic host: ${sanitizeDialogText(h, 40)}`);
    }
    if (!hosts.includes(h as QorLogicHost)) hosts.push(h as QorLogicHost);
  }
  const scope = b.scope === undefined ? "repo" : b.scope;
  if (scope !== "repo" && scope !== "global") return bad('scope must be "repo" or "global"');
  if (b.skillFilter === undefined) return { ok: true, operation: { kind: "qorlogic-skills-install", hosts, scope } };
  if (!b.skillFilter || typeof b.skillFilter !== "object" || Array.isArray(b.skillFilter)) {
    return bad("skillFilter must map hosts to skill names");
  }
  const skillFilter: Record<string, string[]> = {};
  for (const [host, names] of Object.entries(b.skillFilter as Record<string, unknown>)) {
    if (!hosts.includes(host as QorLogicHost)) return bad(`skillFilter names a host that is not selected: ${sanitizeDialogText(host, 40)}`);
    if (!Array.isArray(names) || names.length > MAX_SKILLS_PER_HOST
      || names.some((n) => typeof n !== "string" || !SKILL_NAME.test(n))) {
      return bad(`skillFilter for ${host} must be at most ${MAX_SKILLS_PER_HOST} skill names`);
    }
    skillFilter[host] = [...(names as string[])];
  }
  return { ok: true, operation: { kind: "qorlogic-skills-install", hosts, scope, skillFilter } };
}
