/**
 * #463: frozen Qor-logic 0.176.1 emits "Installed N files to HOST" only
 * after it writes a nonempty receipt. Exit 0 alone is not a write attestation.
 * Bind that line to the requested builtin host, then independently verify
 * the receipt and its on-disk file count.
 */
import type { QorLogicHost } from './hostLayouts';
import type { InstallerRunResult, OutputChannelLike } from './QorLogicPackageInstaller';

const INSTALLED = /^Installed ([1-9][0-9]{0,5}) files to (claude|codex|kilo-code|gemini)$/;
const MAX_RECEIPT_FILES = 2048;

export function parseQorHostInstallCount(stdout: string, host: QorLogicHost): number | null {
  if (typeof stdout !== 'string' || stdout.length > 64 * 1024) return null;
  const lines = stdout.split(/\r?\n/).map((line) => line.trim());
  const confirmations = lines.map((line) => INSTALLED.exec(line)).filter(
    (match): match is RegExpExecArray => match !== null,
  );
  if (confirmations.length !== 1 || confirmations[0][2] !== host) return null;
  const count = Number(confirmations[0][1]);
  return Number.isSafeInteger(count) && count > 0 && count <= MAX_RECEIPT_FILES ? count : null;
}
/** Only a genuine positive frozen-CLI result is eligible for receipt verification. */
export function qualifyQorHostExit(
  result: InstallerRunResult, host: QorLogicHost, output: OutputChannelLike,
): { ok: true; installedCount: number } | { ok: false; error: string } {
  if (result.timedOut) return { ok: false, error: 'timeout' };
  if (result.spawnError) return { ok: false, error: `spawn-failed: ${result.spawnError}` };
  if (result.code !== 0) {
    if (result.stderr) output.appendLine(result.stderr);
    return { ok: false, error: result.stderr.trim() || `exit-code-${result.code}` };
  }
  const installedCount = parseQorHostInstallCount(result.stdout, host);
  if (installedCount === null) return { ok: false, error: 'install-confirmation-missing-or-invalid' };
  return { ok: true, installedCount };
}
