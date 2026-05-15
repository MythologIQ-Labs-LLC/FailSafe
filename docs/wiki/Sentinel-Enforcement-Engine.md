# Sentinel Enforcement Engine

Sentinel is FailSafe's continuous enforcement system. It watches the file system, analyzes changes through heuristic and optional LLM-assisted engines, and produces verdicts that drive governance actions.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     SENTINEL DAEMON                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  EVENT SOURCES                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │   File   │ │  Agent   │ │  Editor  │ │   MCP    │      │
│  │ Watcher  │ │ Messages │ │  Events  │ │ Protocol │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│       └────────────┴────────────┴────────────┘             │
│                          │                                  │
│  EVENT QUEUE (priority: CRITICAL > HIGH > NORMAL > LOW)    │
│                          │                                  │
│  HEURISTIC ENGINE (100+ patterns, CWE-mapped)              │
│       ┌──────────┴──────────┐                              │
│       CLEAR             FLAGGED                             │
│       │                     │                               │
│       │          LLM EVALUATOR (optional)                   │
│       │              ┌──────┴──────┐                       │
│       │           CLEAR        FLAGGED                      │
│       ▼              ▼           ▼                          │
│                                                             │
│  VERDICT ENGINE                                             │
│  PASS / WARN / BLOCK / ESCALATE / QUARANTINE               │
│                          │                                  │
│  ACTION DISPATCHER                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │  SOA    │ │  Trust  │ │ Shadow  │ │ Genesis │         │
│  │ Ledger  │ │ Update  │ │ Genome  │ │  Event  │         │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
└────────────────────────────────────────────────────────────┘
```

## Source Modules

| Module | Path | Description |
|--------|------|-------------|
| `SentinelDaemon` | `src/sentinel/SentinelDaemon.ts` | Main daemon orchestrating all sentinel operations |
| `HeuristicEngine` | `src/sentinel/engines/HeuristicEngine.ts` | Pattern matching against 100+ rules |
| `ExistenceEngine` | `src/sentinel/engines/ExistenceEngine.ts` | Structural claim verification |
| `ArchitectureEngine` | `src/sentinel/engines/ArchitectureEngine.ts` | Macro-KISS enforcement (complexity, bloat detection) |
| `VerdictEngine` | `src/sentinel/engines/VerdictEngine.ts` | Final verdict synthesis from all engine outputs |
| `VerdictRouter` | `src/sentinel/VerdictRouter.ts` | Routes verdicts to appropriate handlers |
| `VerdictArbiter` | `src/sentinel/VerdictArbiter.ts` | Resolves conflicting verdicts |
| `SentinelRagStore` | `src/sentinel/SentinelRagStore.ts` | Local RAG persistence for observations |
| `AgentHealthIndicator` | `src/sentinel/AgentHealthIndicator.ts` | Composite health score computation |
| `AgentTimelineService` | `src/sentinel/AgentTimelineService.ts` | Timeline event tracking |
| `AgentRunRecorder` | `src/sentinel/AgentRunRecorder.ts` | Agent execution trace capture |

## Operating Modes

| Mode | Setting | Description |
|------|---------|-------------|
| **Heuristic** | `failsafe.sentinel.mode: "heuristic"` | Pattern matching only (default). Sub-millisecond latency. |
| **LLM-Assisted** | `failsafe.sentinel.mode: "llm-assisted"` | Routes flagged events to a local LLM via Ollama for deeper analysis. |
| **Hybrid** | `failsafe.sentinel.mode: "hybrid"` | Both heuristic and LLM analysis, combined by the VerdictEngine. |

### LLM Configuration

When using LLM-assisted or hybrid mode:

```json
{
  "failsafe.sentinel.mode": "llm-assisted",
  "failsafe.sentinel.localModel": "llama3.2:1b",
  "failsafe.sentinel.ollamaEndpoint": "http://localhost:11434"
}
```

## Heuristic Pattern Library

Sentinel ships with 100+ CWE-mapped patterns across these categories:

| Category | CWE Range | Examples |
|----------|-----------|---------|
| **Injection** | CWE-89, CWE-78 | SQL injection, command injection |
| **Authentication** | CWE-287 | Hardcoded credentials, weak auth |
| **Cryptography** | CWE-327 | Weak algorithms, hardcoded keys |
| **Secrets** | CWE-798 | Hardcoded API keys, passwords |
| **PII** | CWE-359 | SSN, credit card numbers, email addresses |
| **Resource** | CWE-400 | Unbounded allocations, missing rate limiting |
| **Logic** | CWE-670 | Dead code, unreachable branches |
| **Complexity** | — | Functions exceeding 40 lines, deep nesting |
| **Existence** | — | File claims that don't match disk state |
| **Dependency** | CWE-1104 | Outdated packages, known vulnerabilities |

### Pattern Schema

```typescript
interface HeuristicPattern {
  id: string;          // e.g., "INJ001", "SEC001"
  name: string;        // e.g., "SQL Injection Risk"
  category: PatternCategory;
  severity: "critical" | "high" | "medium" | "low";
  cwe?: string;        // CWE ID
  pattern: RegExp | ASTMatcher;
  description: string;
  falsePositiveRate: number;
  remediation: string;
}
```

## Verdicts

| Verdict | Meaning | Action |
|---------|---------|--------|
| **PASS** | No issues detected | Allow, record to ledger |
| **WARN** | Non-blocking issue found | Allow with warning, record to ledger |
| **BLOCK** | Critical issue found | Block in Enforce mode, record to Shadow Genome |
| **ESCALATE** | Requires human review | Queue for L3 approval |
| **QUARANTINE** | Agent is untrusted | Quarantine agent, block all actions |

## RAG Store

Sentinel persists observations to a local RAG store for low-latency retrieval:

- **Primary**: SQLite at `.failsafe/rag/sentinel-rag.db`
- **Fallback**: JSONL when SQLite is unavailable
- **Controlled by**: `failsafe.sentinel.ragEnabled` (default: `true`)

Each observation includes `payload_json`, `metadata_json`, and retrieval text.

## Shadow Genome

Failed actions and detected patterns are archived to the Shadow Genome for evolutionary learning:

| Failure Mode | Description |
|-------------|-------------|
| `HALLUCINATION` | Agent claimed something false |
| `INJECTION_VULNERABILITY` | Code injection detected |
| `LOGIC_ERROR` | Logical error in generated code |
| `SPEC_VIOLATION` | Violation of project specification |
| `HIGH_COMPLEXITY` | Exceeded Section 4 Razor limits |
| `SECRET_EXPOSURE` | Secrets or credentials detected |
| `PII_LEAK` | PII detected in output |
| `TRUST_VIOLATION` | Agent violated trust constraints |

Shadow Genome entries track remediation status: `UNRESOLVED` → `IN_PROGRESS` → `RESOLVED` / `WONT_FIX` / `SUPERSEDED`.

## Related Pages

- [[QoreLogic Governance Layer]] — How Sentinel verdicts feed into governance decisions
- [[Risk Grading & Policies]] — How patterns map to risk grades
- [[Trust Engine & Agents]] — How Sentinel verdicts affect agent trust
- [[SRE Dashboard]] — How Sentinel feeds the SRE monitoring surface
