import * as vscode from 'vscode';
import { ConfigManager } from '../shared/ConfigManager';
import { getLesson } from '../education/lessons';

interface GovernanceCeremonyLike {
  showQuickPick(): Promise<void>;
}

export class FirstRunOnboarding {
  constructor(
    private readonly configManager: ConfigManager,
    private readonly ceremony: GovernanceCeremonyLike,
  ) {}

  async checkAndRun(): Promise<void> {
    if (!this.isFirstRun()) return;

    const action = await vscode.window.showInformationMessage(
      'FailSafe detected AI agents in your workspace. Set up governance?',
      'Set Up Agent Governance',
      'Not Now',
    );

    if (action === 'Set Up Agent Governance') {
      await this.showGovernanceVocabularyStep();
      await this.ceremony.showQuickPick();
    }

    await this.markOnboarded();
  }

  /**
   * Educational Component (v5.2.0): an optional governance-vocabulary step.
   * Surfaces the `governance-mode` micro-lesson from the registry as a native
   * notification before the mode quickpick, so a governance-new operator gets
   * the plain-language framing first. Native surface — no webview expander.
   * Dismissible: the operator can skip it without affecting onboarding flow.
   */
  private async showGovernanceVocabularyStep(): Promise<void> {
    const lesson = getLesson('governance-mode', 'beginner');
    if (!lesson) return;
    await vscode.window.showInformationMessage(lesson, 'Got it');
  }

  private isFirstRun(): boolean {
    return !this.configManager.getGlobalState<boolean>('failsafe.onboarded', false);
  }

  private async markOnboarded(): Promise<void> {
    await this.configManager.setGlobalState('failsafe.onboarded', true);
  }
}
