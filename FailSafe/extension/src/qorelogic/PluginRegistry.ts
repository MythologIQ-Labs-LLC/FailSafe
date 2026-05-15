import {
  QorLogicPluginRegistry,
  PluginRegistrationOptions,
  QorLogicSystem,
} from "./types/QorLogicSystem";

export class PluginRegistry implements QorLogicPluginRegistry {
  private plugins: Map<string, { plugin: QorLogicSystem; priority: number }> =
    new Map();

  register(options: PluginRegistrationOptions): string {
    const id = options.plugin.getManifest().id;
    const priority = options.priority ?? 100;
    this.plugins.set(id, { plugin: options.plugin, priority });
    return id;
  }

  unregister(id: string): void {
    this.plugins.delete(id);
  }

  get(id: string): QorLogicSystem | undefined {
    return this.plugins.get(id)?.plugin;
  }

  getAll(): QorLogicSystem[] {
    return Array.from(this.plugins.values()).map((entry) => entry.plugin);
  }

  getSorted(): QorLogicSystem[] {
    return Array.from(this.plugins.entries())
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([, entry]) => entry.plugin);
  }
}
