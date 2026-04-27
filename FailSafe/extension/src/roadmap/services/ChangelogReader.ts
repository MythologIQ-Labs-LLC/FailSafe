import * as fs from "fs";
import * as path from "path";

export interface ReleaseEntry {
  version: string;
  date: string | null;
  sectionPreview: string;
}

const VERSION_HEADING_RE = /^##\s+\[(?<version>[^\]]+)\](?:\s+-\s+(?<date>[^\s]+))?/;
const DEFAULT_LIMIT = 5;
const PREVIEW_CAP = 120;

/**
 * Reads `CHANGELOG.md` (Keep-a-Changelog format) and returns the most-recent
 * N version entries. Each release exposes the first non-empty content line
 * as a short preview.
 */
export class ChangelogReader {
  constructor(private readonly workspaceRoot: string) {}

  recentReleases(limit: number = DEFAULT_LIMIT): ReleaseEntry[] {
    const filePath = this.changelogPath();
    if (!fs.existsSync(filePath)) return [];
    let content: string;
    try { content = fs.readFileSync(filePath, "utf8"); }
    catch { return []; }
    return parseReleasesFromText(content, limit);
  }

  private changelogPath(): string {
    return path.join(this.workspaceRoot, "CHANGELOG.md");
  }
}

export function parseReleasesFromText(
  content: string, limit: number = DEFAULT_LIMIT,
): ReleaseEntry[] {
  const headings = locateVersionHeadings(content);
  const releases: ReleaseEntry[] = [];
  for (let i = 0; i < headings.length && releases.length < limit; i += 1) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : content.length;
    const body = content.slice(start, end);
    releases.push({
      version: headings[i].version,
      date: headings[i].date,
      sectionPreview: pickPreview(body),
    });
  }
  return releases;
}

interface HeadingHit {
  index: number;
  version: string;
  date: string | null;
}

function locateVersionHeadings(content: string): HeadingHit[] {
  const hits: HeadingHit[] = [];
  const lines = content.split(/\r?\n/);
  let cursor = 0;
  for (const line of lines) {
    const match = VERSION_HEADING_RE.exec(line);
    if (match && match.groups) {
      hits.push({
        index: cursor,
        version: match.groups.version,
        date: match.groups.date ?? null,
      });
    }
    cursor += line.length + 1;
  }
  return hits;
}

function pickPreview(body: string): string {
  const lines = body.split(/\r?\n/).slice(1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#/.test(trimmed) || /^---/.test(trimmed)) continue;
    return trimmed.length > PREVIEW_CAP ? `${trimmed.slice(0, PREVIEW_CAP - 1)}…` : trimmed;
  }
  return "";
}
