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
}

export class BrainstormService {
  private nodes: Map<string, BrainstormNode> = new Map();
  private edges: BrainstormEdge[] = [];
  private pendingTranscripts: QueuedTranscript[] = [];

  constructor(private llmEvaluate: LlmEvaluateFn) {}

  async processTranscript(transcript: string): Promise<TranscriptResult> {
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
      for (const edge of parsed.edges) {
        this.edges.push(edge);
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
