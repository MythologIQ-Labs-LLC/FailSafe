/**
 * One-time enforce-default notice (LD-6, plan-qor155-align-enforce-default).
 *
 * The governance-mode default flipped observe → enforce (2026-08-19). Existing
 * installs that never chose a mode silently escalate on upgrade; this surfaces
 * that change exactly once, keyed by a globalState flag, with a direct action
 * into the mode picker. Explicitly-configured installs never see it.
 */
import type { GovernanceModeState } from "../governance/types";
import type { INotificationService } from "../core/interfaces/INotificationService";

export const MODE_DEFAULT_NOTICE_KEY = "failsafe.modeDefaultNotice.v1";

export interface ModeDefaultNoticeDeps {
  getModeState: () => GovernanceModeState;
  getGlobalState: (key: string) => boolean | undefined;
  setGlobalState: (key: string, value: boolean) => Thenable<void> | void;
  notifications: INotificationService;
  executeCommand: (command: string) => void;
}

/** Show the notice once per install when the mode is defaulted. Returns true
 *  when the notice was shown (test seam). */
export async function maybeShowModeDefaultNotice(
  deps: ModeDefaultNoticeDeps,
): Promise<boolean> {
  if (deps.getGlobalState(MODE_DEFAULT_NOTICE_KEY)) return false;
  const state = deps.getModeState();
  if (!state.defaulted) return false;

  await deps.setGlobalState(MODE_DEFAULT_NOTICE_KEY, true);
  void deps.notifications
    .showInfo(
      "FailSafe now enforces governance by default. Use 'FailSafe: Set Governance Mode' to choose Observe or Assist.",
      "Set Mode",
      "Dismiss",
    )
    .then((choice) => {
      if (choice === "Set Mode") {
        deps.executeCommand("failsafe.setGovernanceMode");
      }
    });
  return true;
}
