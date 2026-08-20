import type { Verdict, AllowVerdict } from "../types/IntentTypes";
import type { ActionContext, AxiomEnforcer } from "./types";
import type { Logger } from "../../shared/Logger";

export interface EnforceDeps {
  axiom1: AxiomEnforcer;
  axiom2: AxiomEnforcer;
  axiom3: AxiomEnforcer;
  logger: Logger;
}

// Editor-level enforcement is tier-independent by operator ruling (2026-08-19):
// no feature gate participates here. `governance.lockstep` remains a Pro flag
// for OS-level/daemon surfaces only.
export function evaluateEnforceMode(
  context: ActionContext,
  deps: EnforceDeps,
): Verdict {
  const axiom1Result = deps.axiom1.enforce(context);
  if (axiom1Result.status !== "ALLOW") return axiom1Result;

  const axiom3Result = deps.axiom3.enforce(context);
  if (axiom3Result.status !== "ALLOW") return axiom3Result;

  const axiom2Result = deps.axiom2.enforce(context);
  if (axiom2Result.status !== "ALLOW") return axiom2Result;

  return {
    status: "ALLOW",
    reason: `Action permitted within Intent "${context.activeIntent!.id}" scope.`,
    intentId: context.activeIntent!.id,
  } as AllowVerdict;
}
