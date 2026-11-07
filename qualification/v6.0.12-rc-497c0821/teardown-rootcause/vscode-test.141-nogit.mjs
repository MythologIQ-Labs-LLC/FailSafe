// EXPERIMENT config (not committed): the repository's test configurations on stable VS Code 1.141.1
// with VS Code's built-in Git extensions disabled. Copied into the extension folder for one run,
// then deleted. Tests and assertions are unchanged; only the host's extensions differ.
import base from './.vscode-test.mjs';
const fromPath = 'C:/dev/mythologiq/FailSafe-rc611-qual/disposable-vscode/VSCode-1.141.1/Code.exe';
const off = ['--disable-extension', 'vscode.git', '--disable-extension', 'vscode.git-base', '--disable-extension', 'vscode.github'];
export default base.map(({ version: _version, launchArgs = [], ...config }) => ({
  ...config, launchArgs: [...launchArgs, ...off], useInstallation: { fromPath },
}));
