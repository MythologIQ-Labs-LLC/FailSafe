/**
 * AgentOverlayLoader - loads a workspace-local `.failsafe/agents.json` overlay
 * on top of the built-in agent definitions. Invalid input degrades to an empty
 * list; this function never throws.
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { AgentSystemManifest } from "./types/DetectionTypes";

/** A workspace-relative path: no `..` segments, not absolute, non-empty. */
const SafeRelPath = z
  .string()
  .min(1)
  .refine(
    (p) => !path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."),
    { message: "path must be workspace-relative and contain no '..' segments" },
  );

const DetectionRulesSchema = z.object({
  folderExists: z.array(SafeRelPath).optional(),
  extensionKeywords: z.array(z.string()).optional(),
  hostAppNames: z.array(z.string()).optional(),
  alwaysInstalled: z.boolean().optional(),
  extensionIds: z.array(z.string()).optional(),
  terminalPatterns: z.array(z.string()).optional(),
});

const AgentOverlaySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    targetDir: z.string().nullable().optional(),
    detection: DetectionRulesSchema.optional(),
    governancePaths: z.array(SafeRelPath).optional(),
  })
  .transform(
    (agent): AgentSystemManifest => ({
      ...agent,
      targetDir: agent.targetDir ?? null,
    }),
  );

const AgentOverlayEnvelopeSchema = z.object({
  agents: z.array(z.unknown()),
});

export function loadAgentOverlay(workspaceRoot: string): AgentSystemManifest[] {
  const overlayPath = path.join(workspaceRoot, ".failsafe", "agents.json");
  if (!fs.existsSync(overlayPath)) return [];
  try {
    const envelope = AgentOverlayEnvelopeSchema.safeParse(
      JSON.parse(fs.readFileSync(overlayPath, "utf-8")),
    );
    if (!envelope.success) return [];
    return parseOverlayAgents(envelope.data.agents);
  } catch {
    return [];
  }
}

function parseOverlayAgents(rawAgents: unknown[]): AgentSystemManifest[] {
  const out: AgentSystemManifest[] = [];
  for (const raw of rawAgents) {
    const result = AgentOverlaySchema.safeParse(raw);
    if (result.success) {
      out.push(result.data);
    } else {
      console.warn(
        `[AgentOverlayLoader] skipping invalid agent overlay entry: ${result.error.message}`,
      );
    }
  }
  return out;
}

/**
 * Merge overlay manifests on top of built-ins: entries whose `id` matches a
 * built-in replace it; entries with a new `id` are appended.
 */
export function mergeAgentOverlay(
  builtIns: AgentSystemManifest[],
  overlay: AgentSystemManifest[],
): AgentSystemManifest[] {
  const merged = [...builtIns];
  for (const entry of overlay) {
    const idx = merged.findIndex((m) => m.id === entry.id);
    if (idx >= 0) {
      merged[idx] = entry;
    } else {
      merged.push(entry);
    }
  }
  return merged;
}
