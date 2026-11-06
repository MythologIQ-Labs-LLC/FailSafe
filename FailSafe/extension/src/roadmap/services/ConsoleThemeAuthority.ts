/**
 * #601: the single source of the FailSafe app theme shared by the Console, the Monitor and
 * the Monitor sidebar chrome.
 *
 * The preference lives in the extension host (the `failsafe.console.theme` setting in
 * production; see bootstrapServers). Browser storage cannot be the authority: the external
 * Console runs in the system browser, the Monitor runs in VS Code's Electron webview, and
 * the two never share storage. Pages read the theme from the Console server and receive
 * changes over its WebSocket; they never keep a competing copy.
 */

export const CONSOLE_THEMES = ["pegasus", "mythiq", "midnight", "aurora", "crimson", "atmosphere"] as const;
export type ConsoleTheme = (typeof CONSOLE_THEMES)[number];
export const DEFAULT_CONSOLE_THEME: ConsoleTheme = "mythiq";

export function isConsoleTheme(value: unknown): value is ConsoleTheme {
  return typeof value === "string" && (CONSOLE_THEMES as readonly string[]).includes(value);
}

/** Where the preference is persisted. `explicit` is false while the user has never chosen one. */
export interface ConsoleThemeStore {
  read(): { value: unknown; explicit: boolean };
  write(theme: ConsoleTheme): Promise<void>;
  /** Called when the stored value changes outside this authority (e.g. the Settings UI). */
  onExternalChange?(listener: () => void): { dispose(): void };
}

/** In-memory store for tests and hosts without persistence. */
export function memoryThemeStore(initial?: ConsoleTheme): ConsoleThemeStore {
  let value: ConsoleTheme | undefined = initial;
  return {
    read: () => ({ value, explicit: value !== undefined }),
    write: async (theme) => { value = theme; },
  };
}

export interface ConsoleThemeState { theme: ConsoleTheme; explicit: boolean }

export class ConsoleThemeAuthority {
  private readonly listeners = new Set<(theme: ConsoleTheme) => void>();
  private last: ConsoleTheme;
  private readonly external: { dispose(): void } | undefined;

  constructor(private readonly store: ConsoleThemeStore) {
    this.last = this.current().theme;
    this.external = store.onExternalChange?.(() => this.publishIfChanged());
  }

  /** The effective theme. An unknown stored value falls back to the default. */
  current(): ConsoleThemeState {
    const { value, explicit } = this.store.read();
    return isConsoleTheme(value) ? { theme: value, explicit } : { theme: DEFAULT_CONSOLE_THEME, explicit: false };
  }

  /** Persist a supported theme and notify listeners. Returns null (and changes nothing) for anything else. */
  async set(value: unknown): Promise<ConsoleTheme | null> {
    if (!isConsoleTheme(value)) return null;
    const state = this.current();
    if (state.explicit && state.theme === value) return value;
    await this.store.write(value);
    this.publishIfChanged();
    return value;
  }

  onDidChange(listener: (theme: ConsoleTheme) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  }

  dispose(): void {
    this.external?.dispose();
    this.listeners.clear();
  }

  private publishIfChanged(): void {
    const theme = this.current().theme;
    if (theme === this.last) return;
    this.last = theme;
    for (const listener of [...this.listeners]) {
      try { listener(theme); } catch { /* one listener must not starve the others */ }
    }
  }
}
