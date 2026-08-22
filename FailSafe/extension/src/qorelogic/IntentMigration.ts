/**
 * IntentMigration - Intent schema v1 to v2 migration (B66/B68).
 * Extracted from WorkspaceMigration for Section 4 compliance.
 */
import * as fs from "fs";
import * as path from "path";

/**
 * Adds planId and agentIdentity defaults to archived intents.
 */
export async function migrateIntentSchemaV2(
  rootPath: string,
): Promise<void> {
  const intentsDir = path.join(rootPath, ".failsafe", "manifest", "intents");
  try {
    await fs.promises.access(intentsDir);
  } catch {
    return;
  }
  const files = (await fs.promises.readdir(intentsDir)).filter((f) =>
    f.endsWith(".json"),
  );
  for (const file of files) {
    const filePath = path.join(intentsDir, file);
    try {
      const content = await fs.promises.readFile(filePath, "utf8");
      const raw = JSON.parse(content);
      if (raw.schemaVersion && raw.schemaVersion >= 2) continue;
      raw.schemaVersion = 2;
      raw.planId = raw.planId ?? null;
      if (!raw.metadata?.agentIdentity) {
        raw.metadata = {
          ...raw.metadata,
          agentIdentity: {
            agentDid: raw.metadata?.author ?? "unknown",
            workflow: "manual",
          },
        };
      }
      await fs.promises.writeFile(
        filePath,
        JSON.stringify(raw, null, 2),
        "utf8",
      );
    } catch (error) {
      // An archived intent left malformed by an interrupted write (crash,
      // disk full, killed process mid-upgrade) must not abort migration for
      // every other archive, and must not abort activation — this loop runs
      // on every activation via WorkspaceMigration.checkAndRepair(), with no
      // caller-side try/catch. Skip the one bad record; the rest still migrate.
      console.warn(
        `[FailSafe] Skipping unreadable archived intent during schema migration: ${file}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
