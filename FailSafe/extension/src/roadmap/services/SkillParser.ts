/**
 * SkillParser - Parses skill and command markdown files into InstalledSkill objects.
 * Extracted from ConsoleServer.ts for modularity.
 */
import * as fs from "fs";
import * as path from "path";
import {
  toSlug, readFrontmatterValue, readFrontmatterList, readSourceMetadata,
  humanizeSkillName, normalizeSkillTags, resolveSourceCredit,
  resolveQorSkillId, deriveSkillDomainToken, type SourceMeta,
} from "./SkillFrontmatter";

export type InstalledSkill = {
  id: string; displayName: string; localName: string; key: string;
  label: string; desc: string; creator: string; sourceRepo: string;
  sourcePath: string; versionPin: string; trustTier: string;
  sourceType: string; sourcePriority: number; admissionState: string;
  requiredPermissions: string[]; category: string; tags: string[];
  name: string; description: string; installed: boolean;
  origin: string; sourceCredit: string;
};

export type SkillRoot = {
  root: string; sourceType: string; sourcePriority: number; admissionState: string;
};

export function toComparablePath(inputPath: string): string {
  const normalized = path.resolve(inputPath);
  return process.platform === "win32"
    ? normalized.replace(/\//g, "\\").toLowerCase() : normalized;
}

function collectMarkdownFiles(root: string, nameTest: (n: string) => boolean): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !entry.name.startsWith("_")) stack.push(full);
      } else if (entry.isFile() && nameTest(entry.name)) {
        files.push(full);
      }
    }
  }
  return files;
}

export function collectSkillMarkdownFiles(root: string): string[] {
  return collectMarkdownFiles(root, (n) => n.toLowerCase() === "skill.md");
}

export function collectCommandMarkdownFiles(root: string): string[] {
  return collectMarkdownFiles(root, (n) => n.endsWith(".md"));
}

export function parseCommandFile(
  filePath: string, rootMeta: SkillRoot, workspaceRoot: string,
): InstalledSkill | null {
  let content = "";
  try { content = fs.readFileSync(filePath, "utf8"); } catch { return null; }
  const baseName = path.basename(filePath, ".md");
  const dirName = path.basename(path.dirname(filePath));
  const isGovernance = baseName.startsWith("qor-") || baseName.startsWith("ql-");
  const category = isGovernance ? "governance" : dirName;
  const skillMatch = content.match(/<skill>[\s\S]*?<\/skill>/);
  const triggerMatch = skillMatch ? skillMatch[0].match(/<trigger>([^<]+)<\/trigger>/) : null;
  const displayName = triggerMatch
    ? triggerMatch[1].replace(/^\//, "").trim() : humanizeSkillName(baseName);
  const descMatch = content.match(/^##\s+Purpose\s*\n+(.*)/m);
  const desc = descMatch ? descMatch[1].trim().slice(0, 120) : "Command skill";
  const id = `cmd:${baseName}`;
  const tags = normalizeSkillTags([category, baseName, rootMeta.sourceType, "command"]);
  const origin = path.relative(workspaceRoot, path.dirname(filePath)).replace(/\\/g, "/");
  return {
    id, displayName, localName: baseName, key: id, label: displayName, desc,
    creator: "FailSafe", sourceRepo: "local", sourcePath: filePath,
    versionPin: "unversioned", trustTier: "admitted",
    sourceType: rootMeta.sourceType, sourcePriority: rootMeta.sourcePriority,
    admissionState: rootMeta.admissionState, requiredPermissions: [],
    category, tags, name: displayName, description: desc,
    installed: true, origin, sourceCredit: "FailSafe",
  };
}

export function parseSkillFile(
  filePath: string, rootMeta: SkillRoot, workspaceRoot: string,
): InstalledSkill | null {
  let content = "";
  try { content = fs.readFileSync(filePath, "utf8"); } catch { return null; }
  const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
  const fm = fmMatch ? fmMatch[1] : "";
  const rawName = (readFrontmatterValue(fm, "name") || path.basename(path.dirname(filePath))).trim();
  const desc = (readFrontmatterValue(fm, "description") || "Installed skill").trim();
  const sm = readSourceMetadata(path.dirname(filePath));
  const p = resolvePartials(fm, rootMeta, sm, filePath);
  const resolvedId = resolveQorSkillId(p.explicitSkillId || rawName, {
    creator: String(p.creator || "").trim(),
    sourceRepo: String(p.sourceRepo || "").trim(), desc,
  });
  if (!resolvedId) return null;
  const category = pickCategory(fm, rawName, desc);
  const sc = resolveSourceCredit({ creator: p.creator, sourceRepo: p.sourceRepo, sourceName: p.sourceName });
  const tags = buildTags(fm, category, rootMeta, p, sm, sc);
  const dn = pickDisplayName(fm, rawName, resolvedId);
  const vp = readFrontmatterValue(fm, "version") || readFrontmatterValue(fm, "metadata.version") || "unversioned";
  const tt = readFrontmatterValue(fm, "trustTier") || readFrontmatterValue(fm, "trust_tier") || "conditional";
  const perms = readFrontmatterList(fm, "requiredPermissions")
    .concat(readFrontmatterList(fm, "required_permissions"));
  const label = String(dn || rawName || resolvedId).trim();
  return {
    id: resolvedId, displayName: label, localName: rawName, key: resolvedId, label, desc,
    creator: String(p.creator || "Unknown").trim(),
    sourceRepo: String(p.sourceRepo || "unknown").trim(),
    sourcePath: String(p.sourcePath || filePath).trim(),
    versionPin: String(vp || "unversioned").trim(),
    trustTier: String(tt || "conditional").trim(),
    sourceType: String(p.sourceType || rootMeta.sourceType).trim(),
    sourcePriority: p.sourcePriority,
    admissionState: String(p.admissionState || rootMeta.admissionState).trim(),
    requiredPermissions: Array.from(new Set(perms.map((i) => i.trim()).filter(Boolean))),
    category, tags, name: label, description: desc, installed: true,
    origin: path.relative(workspaceRoot, rootMeta.root).replace(/\\/g, "/"), sourceCredit: sc,
  };
}

// --- Internal helpers ---

function pickDisplayName(fm: string, raw: string, id: string): string {
  return String(readFrontmatterValue(fm, "displayName") ||
    readFrontmatterValue(fm, "display_name") || humanizeSkillName(raw) || raw || id).trim();
}

function pickCategory(fm: string, raw: string, desc: string): string {
  return readFrontmatterValue(fm, "category") || readFrontmatterValue(fm, "domain") ||
    deriveSkillDomainToken(toSlug(raw), desc);
}

function buildTags(
  fm: string, cat: string, rm: SkillRoot,
  p: { admissionState: string; sourceName: string },
  sm: SourceMeta, sc: string,
): string[] {
  return normalizeSkillTags([
    ...readFrontmatterList(fm, "tags"), ...readFrontmatterList(fm, "categories"),
    ...readFrontmatterList(fm, "keywords"), ...readFrontmatterList(fm, "topics"),
    readFrontmatterValue(fm, "tags"), readFrontmatterValue(fm, "category"),
    readFrontmatterValue(fm, "domain"), cat, rm.sourceType, p.admissionState, sm.sourceName, sc,
  ]);
}

type Partials = {
  creator: string; sourceRepo: string; sourcePath: string; sourceType: string;
  sourcePriority: number; admissionState: string; explicitSkillId: string; sourceName: string;
};

function resolvePartials(fm: string, rm: SkillRoot, sm: SourceMeta, fp: string): Partials {
  const fv = readFrontmatterValue;
  const author = fv(fm, "author") || fv(fm, "publisher") || fv(fm, "metadata.author") || "Unknown";
  const spRaw = sm.sourcePriority || fv(fm, "sourcePriority") || fv(fm, "source_priority");
  const spNum = Number.parseInt(spRaw, 10);
  return {
    creator: sm.creator || author,
    sourceRepo: sm.sourceRepo || fv(fm, "sourceRepo") || fv(fm, "source_repo") || "unknown",
    sourcePath: sm.sourcePath || fv(fm, "sourcePath") || fv(fm, "source_path") || fp,
    sourceType: sm.sourceType || fv(fm, "sourceType") || fv(fm, "source_type") || rm.sourceType,
    sourcePriority: Number.isFinite(spNum) ? spNum : rm.sourcePriority,
    admissionState: sm.admissionState || fv(fm, "admissionState") || fv(fm, "admission_state") || rm.admissionState,
    explicitSkillId: fv(fm, "id") || fv(fm, "skill_id") || fv(fm, "qor_id"),
    sourceName: sm.sourceName || fv(fm, "source") || fv(fm, "provider") || fv(fm, "publisher"),
  };
}

// Re-export commonly needed helpers so consumers don't need SkillFrontmatter
export {
  toSlug, humanizeSkillName, normalizeSkillTags, readFrontmatterValue,
  readFrontmatterList, readSourceMetadata, resolveSourceCredit,
  resolveQorSkillId, deriveSkillSourceToken, deriveSkillDomainToken,
  deriveSkillActionToken,
} from "./SkillFrontmatter";
