/**
 * SkillFrontmatter - Frontmatter parsing, YAML source metadata reading,
 * skill ID resolution, tag normalization, and source credit utilities.
 * Internal helper for SkillParser; extracted to keep file sizes manageable.
 */
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

export function toSlug(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function readFrontmatterValue(fm: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dotted = escaped.replace("\\.", "\\s*\\.\\s*");
  const match = fm.match(new RegExp(`^\\s*${dotted}\\s*:\\s*(.+)$`, "mi"));
  if (!match?.[1]) return "";
  return String(match[1]).trim().replace(/^['"]|['"]$/g, "");
}

export function readFrontmatterList(fm: string, key: string): string[] {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerMatch = fm.match(
    new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)?$`, "mi"),
  );
  if (!headerMatch) return [];
  const trailing = String(headerMatch[1] || "").trim();
  if (trailing.startsWith("[") && trailing.endsWith("]")) {
    return trailing.slice(1, -1).split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  const start = headerMatch.index ?? -1;
  if (start < 0) return [];
  const rest = fm.slice(start + headerMatch[0].length).split("\n");
  const items: string[] = [];
  for (const line of rest) {
    if (!/^\s*-/.test(line)) {
      if (line.trim().length > 0) break;
      continue;
    }
    items.push(line.replace(/^\s*-\s*/, "").trim().replace(/^['"]|['"]$/g, ""));
  }
  return items;
}

export type SourceMeta = {
  creator: string; sourceRepo: string; sourcePath: string;
  sourceType: string; sourcePriority: string;
  admissionState: string; sourceName: string;
};

const EMPTY_SOURCE_META: SourceMeta = {
  creator: "", sourceRepo: "", sourcePath: "",
  sourceType: "", sourcePriority: "", admissionState: "", sourceName: "",
};

export function readSourceMetadata(skillDir: string): SourceMeta {
  const sourceFile = path.join(skillDir, "SOURCE.yml");
  if (!fs.existsSync(sourceFile)) return { ...EMPTY_SOURCE_META };
  let content = "";
  try { content = fs.readFileSync(sourceFile, "utf8"); } catch { return { ...EMPTY_SOURCE_META }; }
  return parseSourceYaml(content);
}

function parseSourceYaml(content: string): SourceMeta {
  const read = (p: RegExp) =>
    (content.match(p)?.[1] || "").trim().replace(/^['"]|['"]$/g, "");
  const parsed = safeYamlLoad(content);
  const src = objNode(parsed, "source");
  const cre = objNode(parsed, "creator");
  const aut = objNode(parsed, "author");
  const imp = objNode(parsed, "imported");
  return {
    creator: pick(cre.name, parsed?.creator, aut.name, read(/^\s*creator\s*:\s*(.+)$/im)),
    sourceRepo: pick(src.repo, src.repository, parsed?.source_repo, read(/^\s*source_repo\s*:\s*(.+)$/im)),
    sourcePath: pick(src.path, src.url, parsed?.source_path, read(/^\s*source_path\s*:\s*(.+)$/im)),
    sourceType: pick(src.type, parsed?.source_type, read(/^\s*source_type\s*:\s*(.+)$/im)),
    sourcePriority: pick(src.source_priority, parsed?.source_priority, read(/^\s*source_priority\s*:\s*(.+)$/im)),
    admissionState: pick(imp.admission_state, parsed?.admission_state, read(/^\s*admission_state\s*:\s*(.+)$/im)),
    sourceName: pick(src.name, src.provider, src.vendor, parsed?.source_name, read(/^\s*source_name\s*:\s*(.+)$/im)),
  };
}

function safeYamlLoad(content: string): Record<string, unknown> | null {
  try { return yaml.load(content) as Record<string, unknown> | null; } catch { return null; }
}

function objNode(parsed: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> {
  if (!parsed) return {};
  const n = parsed[key];
  return n && typeof n === "object" ? (n as Record<string, unknown>) : {};
}

function pick(...values: Array<unknown>): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "";
}

export function humanizeSkillName(value: string): string {
  const slug = toSlug(value);
  const alias: Record<string, string> = {
    music: "Generate Music", "sound-effects": "Generate Sound Effects",
    "speech-to-text": "Transcribe Speech", "text-to-speech": "Synthesize Speech",
    agents: "Intent Assistant",
  };
  if (alias[slug]) return alias[slug];
  return slug.split("-").filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

const STOP_TAGS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into",
  "of", "on", "or", "the", "to", "with", "skill", "skills", "qor",
  "local", "project", "unknown", "unversioned", "admitted", "conditional",
  "quarantined", "general", "cmd", "command", "commands", "source", "type",
]);

export function normalizeSkillTags(values: Array<string | undefined | null>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const raw = String(value || "").replace(/[[\]{}()]/g, " ");
    const parts = raw.split(/[,;|/\\\n]+/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const slug = toSlug(part);
      if (!slug || STOP_TAGS.has(slug)) continue;
      if (slug.length < 2 || slug.length > 48) continue;
      out.add(slug);
    }
  }
  return Array.from(out).slice(0, 8);
}

export function resolveSourceCredit(ctx: {
  creator: string; sourceRepo: string; sourceName: string;
}): string {
  const sn = String(ctx.sourceName || "").trim();
  const cr = String(ctx.creator || "").trim();
  const repo = String(ctx.sourceRepo || "").trim();
  const owner = repo.includes("/") ? repo.split("/")[0] : "";
  const picked = (sn || cr || owner || "Community").replace(/^@+/, "").trim();
  const lower = picked.toLowerCase();
  const repoLower = repo.toLowerCase();
  if (lower.includes("elevenlabs")) return "ElevenLabs";
  // Skills sourced from the Qor-Logic Python package report as "qor-logic".
  if (repoLower.includes("qor-logic") || repoLower.includes("qorelogic")
      || lower === "qorelogic" || lower === "qorlogic" || lower === "qor-logic") {
    return "qor-logic";
  }
  // Skills authored by the FailSafe extension itself report as "FailSafe".
  if (repoLower.includes("failsafe") || lower === "failsafe"
      || lower === "mythologiq" || lower === "community") {
    return "FailSafe";
  }
  return picked;
}

export function resolveQorSkillId(
  base: string,
  context: { creator: string; sourceRepo: string; desc: string },
): string {
  const slug = toSlug(base);
  if (!slug) return "";
  const segments = slug.split("-").filter(Boolean);
  if (segments.length >= 3) {
    return toSlug(`${segments[0]}-${segments[1]}-${segments.slice(2).join("-")}`);
  }
  const source = deriveSkillSourceToken(context);
  const domain = deriveSkillDomainToken(slug, context.desc);
  const action = deriveSkillActionToken(slug, domain);
  return toSlug(`${source}-${domain}-${action}`);
}

export function deriveSkillSourceToken(ctx: {
  creator: string; sourceRepo: string;
}): string {
  const repo = String(ctx.sourceRepo || "");
  if (repo.includes("/")) {
    const owner = toSlug(repo.split("/")[0] || "");
    if (owner) return owner;
  }
  const cs = toSlug(String(ctx.creator || ""));
  return cs || "local";
}

export function deriveSkillDomainToken(slug: string, desc: string): string {
  const t = `${slug} ${desc}`.toLowerCase();
  if (t.includes("tauri")) return "tauri2";
  if (t.includes("governance") || t.includes("compliance")) return "governance";
  if (t.includes("meta") || t.includes("ledger") || t.includes("shadow")) return "meta";
  if (t.includes("docs") || t.includes("writing")) return "docs";
  if (t.includes("web") || t.includes("wcag")) return "web";
  if (t.includes("audio") || t.includes("voice") || t.includes("speech") || t.includes("music") || t.includes("sound")) return "audio";
  return "operations";
}

export function deriveSkillActionToken(slug: string, domain: string): string {
  const m: Record<string, string> = {
    music: "generate-music", "sound-effects": "generate-sound-effects",
    "speech-to-text": "transcribe-speech", "text-to-speech": "synthesize-speech",
    agents: "build-intent-assistant",
  };
  if (m[slug]) return m[slug];
  if (domain === "operations") return slug || "apply-skill";
  return slug || `improve-${domain}`;
}
