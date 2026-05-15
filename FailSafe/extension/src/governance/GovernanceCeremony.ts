import * as vscode from 'vscode';
import { SystemRegistry } from '../qorelogic/SystemRegistry';
import { AgentConfigInjector } from '../qorelogic/AgentConfigInjector';
import { QorLogicSystem } from '../qorelogic/types/QorLogicSystem';

export class GovernanceCeremony {
  constructor(
    private readonly registry: SystemRegistry,
    private readonly injector: AgentConfigInjector,
  ) {}

  async showQuickPick(): Promise<void> {
    const ungoverned = await this.getUngoverned();

    if (ungoverned.length === 0) {
      vscode.window.showInformationMessage('All detected AI systems are governed.');
      return;
    }

    const items = ungoverned.map((s) => ({
      label: s.getManifest().name,
      description: s.getManifest().id,
      system: s,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select AI systems to govern',
      title: 'Agent Governance Setup',
    });

    if (!selected || selected.length === 0) return;

    for (const item of selected) {
      await this.injector.inject(item.system);
    }

    vscode.window.showInformationMessage(
      `Governance applied to ${selected.length} system(s).`,
    );
  }

  async removeGovernance(): Promise<void> {
    const systems = await this.registry.getSystems();
    const governed = systems.filter((s) => this.registry.hasGovernance(s));

    if (governed.length === 0) {
      vscode.window.showInformationMessage('No governed AI systems found.');
      return;
    }

    const items = governed.map((s) => ({
      label: s.getManifest().name,
      description: s.getManifest().id,
      system: s,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Select AI systems to remove governance from',
      title: 'Remove Agent Governance',
    });

    if (!selected || selected.length === 0) return;

    for (const item of selected) {
      await this.injector.remove(item.system);
    }

    vscode.window.showInformationMessage(
      `Governance removed from ${selected.length} system(s).`,
    );
  }

  private async getUngoverned(): Promise<QorLogicSystem[]> {
    const systems = await this.registry.getSystems();
    const results: QorLogicSystem[] = [];
    for (const system of systems) {
      const detection = await this.registry.detect(system);
      if (detection.detected && !this.registry.hasGovernance(system)) {
        results.push(system);
      }
    }
    return results;
  }
}
