/**
 * B340 (plan-b340-enforce-approval LD1, LD6): `failsafe.intent.decide` ("FailSafe: Approve or Veto
 * the Active Intent") and `failsafe.intent.seal` ("FailSafe: Seal the Active Intent").
 *
 * The only way an intent decision is recorded in enforce mode. The plan is built from server state,
 * the operator approves a bound modal VS Code dialog (confirmBoundCommand over the shared confirmer,
 * one busy guard with the Console routes), and only then are the sealed intent-decision ledger row and its
 * intent-history mirror written (intentDecision). Confirmation is never skipped.
 *
 * From the command palette decide asks for the verdict and a note. Any extension can also call it
 * with arguments ({ verdict, note }); those values are shown "as requested" with a footer saying a
 * command call asked, and recorded exactly as shown. Declined, busy, unwired and expired write
 * nothing. Seal works only from an effective PASS, or finishes an interrupted seal.
 */

import * as vscode from "vscode";
import type { IntentService } from "../governance/IntentService";
import {
  buildDecisionPlan, buildSealPlan, INTENT_NOTE_LIMIT, parseDecisionRequest, recordIntentDecision, recordIntentSeal,
  type DecisionRequest, type IntentDecisionContext, type RecordedDecision,
} from "../governance/intentDecision";
import { confirmBoundCommand, intentDecisionRequest, intentSealRequest, type ConfirmOperatorAction } from "./operatorConfirmation";

export const INTENT_DECIDE_COMMAND = "failsafe.intent.decide";
export const INTENT_SEAL_COMMAND = "failsafe.intent.seal";

/** The palette prompts (injectable for tests). Each returns undefined when the operator dismisses it. */
export interface IntentDecisionUi {
  pickVerdict(): Promise<"PASS" | "VETO" | undefined>;
  inputNote(): Promise<string | undefined>;
  info(message: string): void;
}

export interface IntentDecisionCommandDeps {
  workspaceRoot: string;
  intents: IntentService;
  getLedger: () => unknown;
  /** The shared modal confirmer (bootstrapServers); absent -> unwired, nothing written. */
  confirm: ConfirmOperatorAction | undefined;
  ui?: IntentDecisionUi;
  deadlineMs?: number;
  hooks?: IntentDecisionContext["hooks"];
  /** The delivery review step, shown read-only in the seal dialog. */
  reviewState?: (intentId: string) => Promise<string>;
  /** Called after a decision or seal was recorded (refreshes the status bar). */
  onRecorded?: () => void;
}

export type IntentDecisionOutcome =
  | "recorded" | "refused" | "invalid" | "dismissed" | "declined" | "busy" | "unwired" | "expired";

export interface IntentDecisionCommandResult {
  outcome: IntentDecisionOutcome;
  detail: string;
  status?: number;
  operationId?: string | null;
  ledgerEntryId?: number;
}

const vscodeUi: IntentDecisionUi = {
  pickVerdict: async () => {
    const pick = await vscode.window.showQuickPick(
      [{ label: "PASS", description: "approve the intent for implementation" }, { label: "VETO", description: "reject the intent" }],
      { title: "Approve or Veto the Active Intent: verdict", ignoreFocusOut: true },
    );
    return pick?.label === "PASS" || pick?.label === "VETO" ? pick.label : undefined;
  },
  inputNote: async () => vscode.window.showInputBox({
    title: "Approve or Veto the Active Intent: note (optional)",
    prompt: `At most ${INTENT_NOTE_LIMIT} characters; recorded exactly as the dialog shows it.`,
    ignoreFocusOut: true,
  }),
  info: (message) => { void vscode.window.showInformationMessage(message); },
};

const hasArguments = (args: unknown): args is Record<string, unknown> =>
  !!args && typeof args === "object" && ["verdict", "note"].some((k) => k in (args as Record<string, unknown>));

function contextOf(deps: IntentDecisionCommandDeps): IntentDecisionContext {
  return { workspaceRoot: deps.workspaceRoot, intents: deps.intents, ledger: deps.getLedger(), hooks: deps.hooks, reviewState: deps.reviewState };
}

function confirmationText(failure: "unwired" | "busy" | "expired" | "declined"): string {
  return failure === "unwired" ? "operator confirmation is not available; nothing was recorded."
    : failure === "busy" ? "another confirmation is open in VS Code; nothing was recorded."
      : failure === "expired" ? "the confirmation expired; nothing was recorded. Run the command again to be asked again."
        : "not confirmed in VS Code; nothing was recorded.";
}

function outcomeOf(recorded: RecordedDecision, operationId: string, success: string): IntentDecisionCommandResult {
  const body = recorded.body as { error?: string; ledgerEntryId?: number };
  if (recorded.status !== 200) {
    return { outcome: "refused", status: recorded.status, detail: String(body.error ?? "nothing was recorded."), operationId, ledgerEntryId: body.ledgerEntryId };
  }
  return { outcome: "recorded", status: 200, detail: success.replace("#N", `#${body.ledgerEntryId}`), operationId, ledgerEntryId: body.ledgerEntryId };
}

/** The decide command body; registerIntentDecisionCommands wires it to VS Code. */
export async function runIntentDecisionCommand(deps: IntentDecisionCommandDeps, args?: unknown): Promise<IntentDecisionCommandResult> {
  const ui = deps.ui ?? vscodeUi;
  const finish = (r: IntentDecisionCommandResult): IntentDecisionCommandResult => { ui.info(`FailSafe: ${r.detail}`); return r; };
  const source = hasArguments(args) ? "command-arguments" : "command-palette";
  let request: DecisionRequest;
  if (source === "command-arguments") {
    const a = args as Record<string, unknown>;
    const parsed = parseDecisionRequest({ verdict: a.verdict, note: a.note });
    if (typeof parsed === "string") return finish({ outcome: "invalid", detail: `nothing was recorded: ${parsed}.` });
    request = parsed;
  } else {
    const verdict = await ui.pickVerdict();
    if (!verdict) return { outcome: "dismissed", detail: "nothing was recorded." };
    const note = await ui.inputNote();
    if (note === undefined) return { outcome: "dismissed", detail: "nothing was recorded." };
    const parsed = parseDecisionRequest({ verdict, note });
    if (typeof parsed === "string") return finish({ outcome: "invalid", detail: `nothing was recorded: ${parsed}.` });
    request = parsed;
  }
  const ctx = contextOf(deps);
  const built = await buildDecisionPlan(ctx, request);
  if (!built.ok) return finish({ outcome: "refused", status: built.status, detail: built.error });
  const confirmed = await confirmBoundCommand(deps.confirm, built.plan, (plan, id) => intentDecisionRequest(plan, id, source),
    { deadlineMs: deps.deadlineMs });
  if (!confirmed.ok) return finish({ outcome: confirmed.failure, detail: confirmationText(confirmed.failure), operationId: confirmed.operationId });
  const recorded = await recordIntentDecision(ctx, request, confirmed.bound.operation, { operationId: confirmed.bound.operationId });
  const result = outcomeOf(recorded, confirmed.bound.operationId, `intent ${request.verdict} recorded as ledger entry #N.`);
  deps.onRecorded?.();
  return finish(result);
}

/** The seal command body: seal from an effective PASS, or finish an interrupted seal. */
export async function runIntentSealCommand(deps: IntentDecisionCommandDeps, args?: unknown): Promise<IntentDecisionCommandResult> {
  const ui = deps.ui ?? vscodeUi;
  const finish = (r: IntentDecisionCommandResult): IntentDecisionCommandResult => { ui.info(`FailSafe: ${r.detail}`); return r; };
  const source = args && typeof args === "object" ? "command-arguments" : "command-palette";
  const ctx = contextOf(deps);
  const built = await buildSealPlan(ctx);
  if (!built.ok) return finish({ outcome: "refused", status: built.status, detail: built.error });
  const confirmed = await confirmBoundCommand(deps.confirm, built.plan, (plan, id) => intentSealRequest(plan, id, source),
    { deadlineMs: deps.deadlineMs });
  if (!confirmed.ok) return finish({ outcome: confirmed.failure, detail: confirmationText(confirmed.failure), operationId: confirmed.operationId });
  const recorded = await recordIntentSeal(ctx, confirmed.bound.operation, { operationId: confirmed.bound.operationId });
  const result = outcomeOf(recorded, confirmed.bound.operationId,
    built.plan.kind === "finish" ? "the seal was finished; the intent is archived." : "the intent was sealed as ledger entry #N and archived.");
  deps.onRecorded?.();
  return finish(result);
}

export function registerIntentDecisionCommands(context: vscode.ExtensionContext, deps: IntentDecisionCommandDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(INTENT_DECIDE_COMMAND, (args?: unknown) => runIntentDecisionCommand(deps, args)),
    vscode.commands.registerCommand(INTENT_SEAL_COMMAND, (args?: unknown) => runIntentSealCommand(deps, args)),
  );
}
