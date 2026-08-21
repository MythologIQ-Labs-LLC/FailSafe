import * as fs from "fs";

/**
 * #378: shared corrupt-file preservation (extracted from FX923's
 * RiskRegisterManager.preserveCorruptStore). An existing-but-unhealthy JSON
 * store must be preserved aside BEFORE a caller overwrites it — swallowing the
 * parse error and writing fresh state destroys the operator's data.
 *
 * Contract: NEVER throws (all fs ops, the parse, and the caller-supplied
 * predicate are contained; a predicate crash fails toward preservation).
 * Posture: preserve+warn+proceed — failing closed would abort import/save
 * loops mid-run; only a rename AND copy double-failure loses data (disclosed
 * residual). Preservation reflects on-disk state at call time; concurrent-
 * writer lost-updates are the declared out-of-scope RMW hazard.
 */
export function preserveCorruptFile(
  filePath: string,
  isHealthyShape: (parsed: unknown) => boolean,
  label: string,
): void {
  let corrupt = false;
  try {
    if (!fs.existsSync(filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    try {
      corrupt = !isHealthyShape(parsed);
    } catch {
      corrupt = true;
    }
  } catch {
    corrupt = true;
  }
  if (!corrupt) return;
  const bak = `${filePath}.corrupt-${Date.now()}.bak`;
  try {
    fs.renameSync(filePath, bak);
    console.warn(`[FailSafe] ${label} was unparseable; preserved at ${bak}`);
  } catch {
    // Windows EBUSY/EPERM when another process holds the file open: a copy
    // still succeeds against open read handles.
    try {
      fs.copyFileSync(filePath, bak);
      console.warn(`[FailSafe] ${label} was unparseable; copied to ${bak} (rename blocked)`);
    } catch {
      console.warn(`[FailSafe] ${label} was unparseable and could not be preserved; overwriting`);
    }
  }
}
