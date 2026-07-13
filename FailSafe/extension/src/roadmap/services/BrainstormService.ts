// FailSafe — Brainstorm Graph Service
// Single source of truth for voice-extracted and manual brainstorm nodes.

export interface BrainstormNode {
  id: string;
  label: string;
  type: string;
  confidence: number;
  /** FX889 — provenance of the node. "codebase" = seeded from the repository
   *  knowledge graph (distinct from operator/voice brainstorm nodes, which omit it). */
  source?: string;
}

export interface BrainstormEdge {
  source: string;
  target: string;
  label: string;
}

/** FX894 — collision-proof directed edge identity: JSON-array encoding of
 *  (source, target, label). Twin of `edgeKey` in the UI's
 *  brainstorm-edge-identity.js — keep the formulas byte-identical (#234 LD4);
 *  edge-identity-consistency.test.ts pins them together. LLM-extracted edges
 *  are cast without validation, so `label` may be absent at runtime. */
export function brainstormEdgeKey(e: BrainstormEdge): string {
  return JSON.stringify([e.source, e.target, e.label ?? ""]);
}

export interface ExtractionResult {
  nodes: BrainstormNode[];
  edges: BrainstormEdge[];
  verbalResponse: string;
}

const MINDMAP_EXTRACTOR_PROMPT = `You are a MindMap Extractor. Analyze the transcript and extract:
1. Distinct concepts, features, risks, and technical dependencies as nodes.
2. Relationships between them as edges.
3. Rate each node's confidence (0-100) based on architectural viability,
   completeness, and alignment with project constraints.
4. Generate a brief verbalResponse summarizing what you found and any concerns.

Return ONLY valid JSON matching this schema:
{
  "nodes": [{ "id": "n1", "label": "...", "type": "Feature|Architecture|Risk|Question|Database|Integration", "confidence": 0-100 }],
  "edges": [{ "source": "n1", "target": "n2", "label": "depends on" }],
  "verbalResponse": "..."
}

Use short, unique IDs like n1, n2, etc. Keep labels concise (under 30 chars).
Type must be one of: Feature, Architecture, Risk, Question, Database, Integration.
Do NOT wrap the JSON in markdown code fences.`;

type LlmEvaluateFn = (prompt: string, payload: string) => Promise<string>;

export interface QueuedTranscript {
  id: string;
  transcript: string;
  queuedAt: string;
}

export interface TranscriptResult {
  extraction?: ExtractionResult;
  queued?: QueuedTranscript;
  rejected?: { reason: "placeholder_rejected" };
}

/** FX895 (#238) — placeholder/diagnostic transcript gate. True for
 *  empty-after-trim, the exact STT failure literal, or a bracket-wrapped
 *  diagnostic phrase containing fail/error. Twin of the client mirror in
 *  prep-bay.js (browser/extension boundary, LD6) — keep verdicts identical;
 *  placeholder-matcher-consistency.test.ts pins them together. Input is
 *  bounded upstream by the route's 10,000-char slice. */
export function isPlaceholderTranscript(t: string): boolean {
  const s = (t || "").trim();
  if (!s) return true;
  if (s === "[transcription failed]") return true;
  return /^\[[a-z0-9_ .:-]*(fail|error)[a-z0-9_ .:-]*\]$/i.test(s);
}

export class BrainstormService {
  private nodes: Map<string, BrainstormNode> = new Map();
  private edges: BrainstormEdge[] = [];
  private pendingTranscripts: QueuedTranscript[] = [];

  constructor(private llmEvaluate: LlmEvaluateFn) {}

  async processTranscript(transcript: string): Promise<TranscriptResult> {
    // FX895: failure/diagnostic text never reaches any extraction tier.
    if (isPlaceholderTranscript(transcript)) {
      return { rejected: { reason: "placeholder_rejected" } };
    }
    try {
      const raw = await this.llmEvaluate(MINDMAP_EXTRACTOR_PROMPT, transcript);
      let parsed: ExtractionResult;
      try {
        parsed = this.parseExtraction(raw);
      } catch {
        // First parse failed — retry with stricter prompt
        console.warn(
          "[BrainstormService] First extraction parse failed, retrying with strict prompt...",
        );
        const strictPrompt =
          MINDMAP_EXTRACTOR_PROMPT +
          "\n\nCRITICAL: Your response MUST be raw JSON only. Do NOT wrap it in markdown code fences. Do NOT include any text before or after the JSON object.";
        const retryRaw = await this.llmEvaluate(strictPrompt, transcript);
        parsed = this.parseExtraction(retryRaw);
      }
      for (const node of parsed.nodes) {
        if (!this.nodes.has(node.id)) {
          this.nodes.set(node.id, node);
        }
      }
      // FX894: guard against duplicate edges across repeated extractions.
      const edgeKeys = new Set(this.edges.map(brainstormEdgeKey));
      for (const edge of parsed.edges) {
        const key = brainstormEdgeKey(edge);
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          this.edges.push(edge);
        }
      }
      return { extraction: parsed };
    } catch (err) {
      console.warn("[BrainstormService] All extraction attempts failed:", err);
      const queued = this.queueTranscript(transcript);
      return { queued };
    }
  }

  queueTranscript(transcript: string): QueuedTranscript {
    const entry: QueuedTranscript = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      transcript,
      queuedAt: new Date().toISOString(),
    };
    this.pendingTranscripts.push(entry);
    return entry;
  }

  getPendingTranscripts(): QueuedTranscript[] {
    return [...this.pendingTranscripts];
  }

  async retryPending(): Promise<TranscriptResult[]> {
    const pending = [...this.pendingTranscripts];
    this.pendingTranscripts = [];
    const results: TranscriptResult[] = [];
    for (const entry of pending) {
      const result = await this.processTranscript(entry.transcript);
      results.push(result);
    }
    return results;
  }

  addNode(label: string, type: string, clientId?: string): BrainstormNode {
    const id = clientId || `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (this.nodes.has(id)) return this.nodes.get(id)!;
    const finalLabel = label.length > 200 ? label.slice(0, 200) : label;
    if (label.length > 200) {
      console.info(`[BrainstormService] Node label truncated from ${label.length} to 200 chars`);
    }
    const node: BrainstormNode = { id, label: finalLabel, type, confidence: -1 };
    this.nodes.set(id, node);
    return node;
  }

  updateNode(id: string, label: string, type: string): BrainstormNode | null {
    const node = this.nodes.get(id);
    if (!node) return null;
    node.label = label;
    node.type = type;
    return node;
  }

  removeNode(id: string): boolean {
    if (!this.nodes.delete(id)) return false;
    this.edges = this.edges.filter((e) => e.source !== id && e.target !== id);
    return true;
  }

  getGraph(): { nodes: BrainstormNode[]; edges: BrainstormEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
    };
  }

  reset(): void {
    this.nodes.clear();
    this.edges = [];
  }

  private parseExtraction(raw: string): ExtractionResult {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("LLM returned invalid JSON for brainstorm extraction");
    }
    const obj = json as Record<string, unknown>;
    if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
      throw new Error("LLM response missing nodes or edges arrays");
    }
    return {
      nodes: obj.nodes as BrainstormNode[],
      edges: obj.edges as BrainstormEdge[],
      verbalResponse: String(obj.verbalResponse || ""),
    };
  }
}
