import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { GovernanceCeremony } from '../../governance/GovernanceCeremony';
import { QorLogicSystem } from '../../qorelogic/types/QorLogicSystem';

type WindowPatchTarget = {
  showQuickPick: typeof vscode.window.showQuickPick;
  showInformationMessage: typeof vscode.window.showInformationMessage;
};

function makeSystem(id: string, name: string): QorLogicSystem {
  return {
    getManifest: () => ({
      id,
      name,
      description: `${name} governance`,
      sourceDir: undefined,
      targetDir: null,
    }),
  };
}

interface MockRegistry {
  getSystems(): Promise<QorLogicSystem[]>;
  detect(system: QorLogicSystem): Promise<{ detected: boolean }>;
  hasGovernance(system: QorLogicSystem): boolean;
}

function createMockRegistry(
  systems: QorLogicSystem[],
  detectedIds: string[],
  governedIds: string[],
): MockRegistry {
  return {
    async getSystems() { return systems; },
    async detect(system: QorLogicSystem) {
      return { detected: detectedIds.includes(system.getManifest().id) };
    },
    hasGovernance(system: QorLogicSystem) {
      return governedIds.includes(system.getManifest().id);
    },
  };
}

interface MockInjector {
  inject(system: QorLogicSystem): Promise<void>;
  remove(system: QorLogicSystem): Promise<void>;
  injectCalls(): QorLogicSystem[];
  removeCalls(): QorLogicSystem[];
}

function createMockInjector(): MockInjector {
  const injectLog: QorLogicSystem[] = [];
  const removeLog: QorLogicSystem[] = [];
  return {
    async inject(system: QorLogicSystem) { injectLog.push(system); },
    async remove(system: QorLogicSystem) { removeLog.push(system); },
    injectCalls: () => injectLog,
    removeCalls: () => removeLog,
  };
}

function patchQuickPick(returnValue: unknown): () => void {
  const windowTarget = vscode.window as unknown as WindowPatchTarget;
  const original = windowTarget.showQuickPick;
  windowTarget.showQuickPick = (async () => returnValue) as unknown as typeof vscode.window.showQuickPick;
  return () => { windowTarget.showQuickPick = original; };
}

function patchInfoMessage(returnValue: unknown): () => void {
  const windowTarget = vscode.window as unknown as WindowPatchTarget;
  const original = windowTarget.showInformationMessage;
  windowTarget.showInformationMessage = (async () => returnValue) as typeof vscode.window.showInformationMessage;
  return () => { windowTarget.showInformationMessage = original; };
}

describe('GovernanceCeremony', () => {
  describe('showQuickPick()', () => {
    it('shows only ungoverned detected systems in the quick pick', async () => {
      const claudeSystem = makeSystem('claude', 'Claude Code');
      const cursorSystem = makeSystem('cursor', 'Cursor');
      const registry = createMockRegistry(
        [claudeSystem, cursorSystem],
        ['claude', 'cursor'],
        ['cursor'],
      );
      const injector = createMockInjector();
      let capturedItems: unknown[] = [];
      const windowTarget = vscode.window as unknown as WindowPatchTarget;
      const originalQP = windowTarget.showQuickPick;
      const originalInfo = windowTarget.showInformationMessage;
      windowTarget.showQuickPick = (async (items: readonly unknown[]) => {
        capturedItems = [...items];
        return [];
      }) as unknown as typeof vscode.window.showQuickPick;
      windowTarget.showInformationMessage = (async () => undefined) as typeof vscode.window.showInformationMessage;

      try {
        const ceremony = new GovernanceCeremony(registry as any, injector as any);
        await ceremony.showQuickPick();
      } finally {
        windowTarget.showQuickPick = originalQP;
        windowTarget.showInformationMessage = originalInfo;
      }

      assert.strictEqual(capturedItems.length, 1, 'only ungoverned systems should appear');
      assert.strictEqual((capturedItems[0] as { label: string }).label, 'Claude Code');
    });

    it('shows all-governed message when no ungoverned systems exist', async () => {
      const claudeSystem = makeSystem('claude', 'Claude Code');
      const registry = createMockRegistry([claudeSystem], ['claude'], ['claude']);
      const injector = createMockInjector();
      let capturedMsg = '';
      let quickPickCalled = false;
      const windowTarget = vscode.window as unknown as WindowPatchTarget;
      const originalQP = windowTarget.showQuickPick;
      const originalInfo = windowTarget.showInformationMessage;
      windowTarget.showQuickPick = (async () => {
        quickPickCalled = true;
        return [];
      }) as unknown as typeof vscode.window.showQuickPick;
      windowTarget.showInformationMessage = (async (msg: string) => {
        capturedMsg = msg;
        return undefined;
      }) as typeof vscode.window.showInformationMessage;

      try {
        const ceremony = new GovernanceCeremony(registry as any, injector as any);
        await ceremony.showQuickPick();
      } finally {
        windowTarget.showQuickPick = originalQP;
        windowTarget.showInformationMessage = originalInfo;
      }

      assert.strictEqual(quickPickCalled, false, 'showQuickPick should not be called');
      assert.ok(capturedMsg.includes('governed'), 'info message should mention governed');
    });

    it('calls injector.inject() for each selected system', async () => {
      const claudeSystem = makeSystem('claude', 'Claude Code');
      const cursorSystem = makeSystem('cursor', 'Cursor');
      const registry = createMockRegistry(
        [claudeSystem, cursorSystem],
        ['claude', 'cursor'],
        [],
      );
      const injector = createMockInjector();
      const windowTarget = vscode.window as unknown as WindowPatchTarget;
      const originalQP = windowTarget.showQuickPick;
      const originalInfo = windowTarget.showInformationMessage;
      windowTarget.showQuickPick = (async (items: readonly { label: string; system: QorLogicSystem }[]) => [...items]) as unknown as typeof vscode.window.showQuickPick;
      windowTarget.showInformationMessage = (async () => undefined) as typeof vscode.window.showInformationMessage;

      try {
        const ceremony = new GovernanceCeremony(registry as any, injector as any);
        await ceremony.showQuickPick();
      } finally {
        windowTarget.showQuickPick = originalQP;
        windowTarget.showInformationMessage = originalInfo;
      }

      assert.strictEqual(injector.injectCalls().length, 2, 'inject should be called for each selection');
      const ids = injector.injectCalls().map((s) => s.getManifest().id);
      assert.ok(ids.includes('claude'));
      assert.ok(ids.includes('cursor'));
    });

    it('does not call injector.inject() when user cancels quick pick', async () => {
      const claudeSystem = makeSystem('claude', 'Claude Code');
      const registry = createMockRegistry([claudeSystem], ['claude'], []);
      const injector = createMockInjector();
      const restoreQP = patchQuickPick(undefined);
      const restoreInfo = patchInfoMessage(undefined);

      try {
        const ceremony = new GovernanceCeremony(registry as any, injector as any);
        await ceremony.showQuickPick();
      } finally {
        restoreQP();
        restoreInfo();
      }

      assert.strictEqual(injector.injectCalls().length, 0, 'inject should not be called on cancel');
    });
  });

  describe('removeGovernance()', () => {
    it('calls injector.remove() for each selected governed system', async () => {
      const claudeSystem = makeSystem('claude', 'Claude Code');
      const registry = createMockRegistry([claudeSystem], ['claude'], ['claude']);
      const injector = createMockInjector();
      const windowTarget = vscode.window as unknown as WindowPatchTarget;
      const originalQP = windowTarget.showQuickPick;
      const originalInfo = windowTarget.showInformationMessage;
      windowTarget.showQuickPick = (async (items: readonly { label: string; system: QorLogicSystem }[]) => [...items]) as unknown as typeof vscode.window.showQuickPick;
      windowTarget.showInformationMessage = (async () => undefined) as typeof vscode.window.showInformationMessage;

      try {
        const ceremony = new GovernanceCeremony(registry as any, injector as any);
        await ceremony.removeGovernance();
      } finally {
        windowTarget.showQuickPick = originalQP;
        windowTarget.showInformationMessage = originalInfo;
      }

      assert.strictEqual(injector.removeCalls().length, 1, 'remove should be called once');
      assert.strictEqual(injector.removeCalls()[0].getManifest().id, 'claude');
    });

    it('shows no-governed-systems message when none are governed', async () => {
      const claudeSystem = makeSystem('claude', 'Claude Code');
      const registry = createMockRegistry([claudeSystem], ['claude'], []);
      const injector = createMockInjector();
      let capturedMsg = '';
      let quickPickCalled = false;
      const windowTarget = vscode.window as unknown as WindowPatchTarget;
      const originalQP = windowTarget.showQuickPick;
      const originalInfo = windowTarget.showInformationMessage;
      windowTarget.showQuickPick = (async () => {
        quickPickCalled = true;
        return [];
      }) as unknown as typeof vscode.window.showQuickPick;
      windowTarget.showInformationMessage = (async (msg: string) => {
        capturedMsg = msg;
        return undefined;
      }) as typeof vscode.window.showInformationMessage;

      try {
        const ceremony = new GovernanceCeremony(registry as any, injector as any);
        await ceremony.removeGovernance();
      } finally {
        windowTarget.showQuickPick = originalQP;
        windowTarget.showInformationMessage = originalInfo;
      }

      assert.strictEqual(quickPickCalled, false, 'showQuickPick should not be called');
      assert.ok(capturedMsg.length > 0, 'an info message should be shown');
    });

    it('does not call injector.remove() when user cancels', async () => {
      const claudeSystem = makeSystem('claude', 'Claude Code');
      const registry = createMockRegistry([claudeSystem], ['claude'], ['claude']);
      const injector = createMockInjector();
      const restoreQP = patchQuickPick(undefined);
      const restoreInfo = patchInfoMessage(undefined);

      try {
        const ceremony = new GovernanceCeremony(registry as any, injector as any);
        await ceremony.removeGovernance();
      } finally {
        restoreQP();
        restoreInfo();
      }

      assert.strictEqual(injector.removeCalls().length, 0, 'remove should not be called on cancel');
    });
  });
});
