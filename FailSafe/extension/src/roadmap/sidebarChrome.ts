/**
 * Static parts of the Monitor sidebar chrome (FailSafeSidebarProvider), split out for the
 * Section 4 razor. #601: the chrome uses the shared design tokens inlined from disk; the
 * extension host renders the current theme into data-theme and posts failsafe.theme when it
 * changes. Hardcoded values are fallbacks for when the tokens cannot be read.
 */
export const SIDEBAR_CHROME_CSS = `
    /* #601: the chrome uses the shared design tokens inlined above (read from
       disk). The extension host renders the current theme into data-theme and
       posts failsafe.theme when it changes. Hardcoded values are fallbacks for
       when the tokens cannot be read. */
    html, body { margin: 0; padding: 0; height: 100%; background: var(--bg-dark, #071539); color: var(--text-main, #f3f7ff); font-family: var(--font-body, "Segoe UI", sans-serif); }
    .shell { display: grid; grid-template-rows: auto auto 1fr; height: 100%; }
    .toolbar { display: flex; gap: 6px; padding: 6px; border-bottom: 1px solid var(--border-rim, rgba(95, 150, 255, 0.35)); background: var(--bg-panel, #0a1f4a); align-items: center; }
    .btn { border: 1px solid var(--glass-border, #3568d8); color: var(--text-main, #eaf1ff); background: var(--bg-deep, #1f4ea8); padding: 5px 8px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 700; white-space: nowrap; line-height: 1.15; }
    .btn:hover { border-color: var(--primary, #3568d8); }
    .btn.secondary { background: var(--bg-deep, #10357a); border-color: var(--border-rim, #2c5bb9); }
    .btn.init { margin-left: auto; background: var(--primary, #ffffff); color: #ffffff; border-color: var(--primary, #ffffff); box-shadow: 0 0 8px var(--primary-glow, rgba(0,0,0,0.25)); }
    .btn.init:hover { box-shadow: 0 0 12px var(--primary-glow, rgba(0,0,0,0.35)); filter: brightness(1.08); }
    .frame-wrap { position: relative; min-height: 0; }
    iframe { border: 0; width: 100%; height: 100%; display: block; background: var(--bg-dark, #071539); }
    .sre-toggle { display:flex; gap:6px; padding:4px 8px; background:var(--bg-panel, #0a1f4a); border-bottom:1px solid var(--border-rim, rgba(95,150,255,0.35)); justify-content:flex-start; }
    .sre-toggle button { flex:0 0 auto; width:auto; padding:3px 12px; border:1px solid var(--glass-border, #3568d8); border-radius:6px; background:var(--bg-deep, #10357a); font-size:10px; font-weight:600; cursor:pointer; color:var(--text-main, #eaf1ff); line-height:1.2; }
    .sre-toggle button[aria-selected="true"] { background:var(--primary, #2c74f2); border-color:var(--primary, #2c74f2); color:#fff; }
    /* VS Code high-contrast themes: the chrome takes VS Code's contrast colors and
       borders; the Monitor content keeps the selected FailSafe theme. */
    body.vscode-high-contrast, body.vscode-high-contrast-light { background: var(--vscode-sideBar-background); color: var(--vscode-foreground); }
    body.vscode-high-contrast .toolbar, body.vscode-high-contrast .sre-toggle,
    body.vscode-high-contrast-light .toolbar, body.vscode-high-contrast-light .sre-toggle { background: var(--vscode-sideBar-background); border-color: var(--vscode-contrastBorder); }
    body.vscode-high-contrast .btn, body.vscode-high-contrast .sre-toggle button,
    body.vscode-high-contrast-light .btn, body.vscode-high-contrast-light .sre-toggle button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-contrastBorder); box-shadow: none; }
    body.vscode-high-contrast .sre-toggle button[aria-selected="true"],
    body.vscode-high-contrast-light .sre-toggle button[aria-selected="true"] { outline: 2px solid var(--vscode-contrastActiveBorder); }
    @media (max-width: 340px) {
      .toolbar { gap: 4px; padding: 5px; }
      .btn { font-size: 10px; padding: 4px 6px; }
    }
  `;

/** A per-render nonce for the webview script CSP. */
export function sidebarNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
