import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { decideSidebarClick, sanitizeConsoleRoute } from "./sidebarInitializeLogic";
import { resolveUiDir } from "./services/ConsoleServerSupport";
import { CONSOLE_THEMES, DEFAULT_CONSOLE_THEME, isConsoleTheme, type ConsoleThemeAuthority } from "./services/ConsoleThemeAuthority";
import { SIDEBAR_CHROME_CSS, sidebarNonce } from "./sidebarChrome";

type SidebarMessage =
  | { command: "openPopout" }
  | { command: "openEditor" }
  | { command: "reload" }
  | { command: "openConsole"; route: string }
  | { command: "sidebar.click"; currentLabel: string };

export class FailSafeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "failsafe.sidebarView";

  private view: vscode.WebviewView | undefined;
  private readonly baseUrl: string;

  /** #601: the shared app theme; absent in tests, which then render the default theme. */
  constructor(port: number = 9376, private readonly themeAuthority?: ConsoleThemeAuthority) {
    this.baseUrl = `http://localhost:${port}`;
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((message: SidebarMessage) => {
      void this.handleMessage(message);
    });
    // #601: the chrome follows the shared theme live. The Monitor iframe gets the same change
    // from the Console server's WebSocket.
    const themeSubscription = this.themeAuthority?.onDidChange((theme) => {
      void webviewView.webview.postMessage({ type: "failsafe.theme", theme });
    });
    webviewView.onDidDispose(() => themeSubscription?.dispose());
  }

  private currentTheme(): string {
    const theme = this.themeAuthority?.current().theme;
    return isConsoleTheme(theme) ? theme : DEFAULT_CONSOLE_THEME;
  }

  private async handleMessage(message: SidebarMessage): Promise<void> {
    switch (message.command) {
      case "openPopout":
        await vscode.commands.executeCommand("failsafe.openPlannerHub");
        break;
      case "openEditor":
        await vscode.commands.executeCommand("failsafe.openPlannerHubEditor");
        break;
      case "reload":
        this.refresh();
        break;
      case "openConsole":
        await this.openConsoleFromSidebar(message.route);
        break;
      case "sidebar.click":
        await this.runSidebarClick(message.currentLabel);
        break;
    }
  }

  /** The Initialize/Organize button: the host decides, then posts any label change back. */
  private async runSidebarClick(currentLabel: string): Promise<void> {
    const allCmds = new Set(await vscode.commands.getCommands(true));
    const decision = decideSidebarClick(currentLabel, allCmds);
    switch (decision.kind) {
      case "run-organize":
        if (allCmds.has("failsafe.organize")) {
          await vscode.commands.executeCommand("failsafe.organize");
        } else {
          vscode.window.showWarningMessage(
            "Organize command is not yet registered. The extension may still be activating — try again in a moment.",
          );
        }
        break;
      case "run-bootstrap":
        await vscode.commands.executeCommand("failsafe.bootstrap");
        this.view?.webview.postMessage(decision.postUpdate);
        break;
      case "bootstrap-not-ready":
        vscode.window.showWarningMessage(
          "Bootstrap command is not yet registered. The extension may still be activating — try again in a moment.",
        );
        break;
    }
  }

  /** Monitor-iframe deep link (FX916): sanitize the relayed route, then open
   *  the Console externally at that hash via the host command. Invalid routes
   *  are dropped fail-closed — no fallback open. */
  private async openConsoleFromSidebar(route: unknown): Promise<void> {
    const safe = sanitizeConsoleRoute(route);
    if (!safe) return;
    await vscode.commands.executeCommand("failsafe.openConsoleRoute", safe);
  }

  private refresh(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.getHtml();
  }

  /** The shared Console design tokens, read from disk so they can be inlined
   *  into the sidebar chrome. The provider runs in the Node extension host, so
   *  a direct file read avoids a cross-origin fetch to the Console server (the
   *  webview origin differs from the localhost server, and no CORS headers are
   *  served). Returns "" on any miss — the chrome's hardcoded var() fallbacks
   *  then apply, so the sidebar degrades to the default look. */
  private readThemeTokens(): string {
    try {
      const uiDir = resolveUiDir(__dirname);
      return fs.readFileSync(path.join(uiDir, "theme-tokens.css"), "utf8");
    } catch {
      return "";
    }
  }

  private getHtml(): string {
    const nonce = sidebarNonce();
    const compactUrl = `${this.baseUrl}/?ui=compact`;
    const themeTokens = this.readThemeTokens();
    return `<!DOCTYPE html>
<html lang="en" data-theme="${this.currentTheme()}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view?.webview.cspSource ?? ""} data: https:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src ${this.baseUrl};" />
  <style>${themeTokens}</style>
  <style>${SIDEBAR_CHROME_CSS}</style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button class="btn" id="open-popout" type="button">Console</button>
      <button class="btn secondary" id="reload" type="button">Reload</button>
      <button class="btn init" id="init-workspace" type="button" title="Initialize Workspace">Initialize</button>
    </div>
    <div class="sre-toggle" role="tablist" aria-label="View mode">
      <button id="btn-monitor" role="tab" aria-selected="true">Monitor</button>
      <button id="btn-sre"     role="tab" aria-selected="false">SRE</button>
    </div>
    <div class="frame-wrap">
      <iframe id="main-frame" title="FailSafe Monitor" src="${compactUrl}"></iframe>
    </div>
  </div>
  <script nonce="${nonce}">
${chromeSetupScript()}
${messageRelayScript()}
${viewToggleScript(this.baseUrl, compactUrl)}
  </script>
</body>
</html>`;
  }
}

/** Webview prelude. The theme names come from the one registry (#601, V2 of #917). */
function chromeSetupScript(): string {
  return `    const vscode = acquireVsCodeApi();
    const initBtn = document.getElementById('init-workspace');
    const mainFrame = document.getElementById('main-frame');

    // #601: the extension host renders the current theme into <html data-theme>
    // and posts failsafe.theme when it changes. Only the host may set it: the
    // embedded Monitor page is not trusted to choose the chrome's theme, and
    // the value must be one of the supported names before it reaches a selector.
    const supportedThemes = new Set(${JSON.stringify(CONSOLE_THEMES)});
    const state = vscode.getState() || { initDone: false };
    if (state.initDone && initBtn) {
        initBtn.textContent = 'Organize';
        initBtn.title = 'Organize Workspace Structure';
    }

    document.getElementById('open-popout')?.addEventListener('click', () => vscode.postMessage({ command: 'openPopout' }));
    document.getElementById('reload')?.addEventListener('click', () => vscode.postMessage({ command: 'reload' }));

    initBtn?.addEventListener('click', () => {
        // Send only the current label; host decides what happens next and
        // posts back a button.update message when DOM should mutate.
        vscode.postMessage({ command: 'sidebar.click', currentLabel: initBtn.textContent });
    });
`;
}

/** Host-to-chrome messages and the FX916 deep-link relay from the Monitor iframe. */
function messageRelayScript(): string {
  return `    window.addEventListener('message', (event) => {
      const data = event && event.data ? event.data : null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'failsafe.theme') {
        if (event.source === mainFrame.contentWindow || event.origin !== window.origin) return;
        if (!supportedThemes.has(data.theme)) return;
        document.documentElement.setAttribute('data-theme', data.theme);
        return;
      }
      if (data.type === 'failsafe.button.update' && initBtn) {
        initBtn.textContent = data.text;
        initBtn.title = data.title;
        if (data.persistState) {
            vscode.setState({ ...vscode.getState(), initDone: true });
        }
        return;
      }
      if (data.type === 'failsafe.openPopout') {
        vscode.postMessage({ command: 'openPopout' });
        return;
      }
      // FX916 deep-link relay: only the embedded Monitor iframe may drive it.
      if (data.type === 'failsafe.openConsole' && typeof data.route === 'string'
          && event.source === mainFrame.contentWindow) {
        vscode.postMessage({ command: 'openConsole', route: data.route });
      }
    });
`;
}

function viewToggleScript(baseUrl: string, compactUrl: string): string {
  return `    const sreUrl = '${baseUrl}/console/sre';
    const compactUrl = '${compactUrl}';
    const btnMonitor = document.getElementById('btn-monitor');
    const btnSre = document.getElementById('btn-sre');

    function switchView(isSre) {
      mainFrame.src = isSre ? sreUrl : compactUrl;
      btnMonitor.setAttribute('aria-selected', String(!isSre));
      btnSre.setAttribute('aria-selected', String(isSre));
      vscode.setState({ ...vscode.getState(), sreMode: isSre });
    }

    btnMonitor.addEventListener('click', () => switchView(false));
    btnSre.addEventListener('click', () => switchView(true));
    if (state.sreMode) { switchView(true); }`;
}
