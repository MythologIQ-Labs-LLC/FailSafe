# Configuration Reference

Complete reference for all FailSafe configuration options.

## VS Code Settings

Access via: File → Preferences → Settings → Search "failsafe"

### Governance

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `failsafe.governance.mode` | `enum` | `"observe"` | Governance mode: `observe`, `assist`, or `enforce` |
| `failsafe.governance.overseerId` | `string` | `"did:myth:overseer:local"` | DID identity for the governance overseer |

### Sentinel

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `failsafe.sentinel.enabled` | `boolean` | `true` | Enable Sentinel monitoring daemon |
| `failsafe.sentinel.mode` | `enum` | `"heuristic"` | Operating mode: `heuristic`, `llm-assisted`, `hybrid` |
| `failsafe.sentinel.localModel` | `string` | `"llama3.2:1b"` | Ollama model for LLM-assisted mode |
| `failsafe.sentinel.ollamaEndpoint` | `string` | `"http://localhost:11434"` | Ollama API endpoint |
| `failsafe.sentinel.ragEnabled` | `boolean` | `true` | Persist Sentinel events to local RAG store |

### QoreLogic

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `failsafe.qorlogic.ledgerPath` | `string` | `".failsafe/ledger/soa_ledger.db"` | Path to SOA Ledger database |
| `failsafe.qorlogic.strictMode` | `boolean` | `false` | Block on all warnings |
| `failsafe.qorlogic.l3SLA` | `number` | `120` | L3 first response SLA in seconds |
| `failsafe.qorlogic.pythonPath` | `string` | `""` | Override Python interpreter for qor-logic |

### External Runtime

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `failsafe.qorelogic.externalRuntime.enabled` | `boolean` | `false` | Enable Qore runtime integration |
| `failsafe.qorelogic.externalRuntime.baseUrl` | `string` | `"http://127.0.0.1:7777"` | Runtime API base URL |
| `failsafe.qorelogic.externalRuntime.apiKey` | `string` | `""` | Optional API key |
| `failsafe.qorelogic.externalRuntime.apiKeyEnvVar` | `string` | `"QORE_API_KEY"` | Fallback env var for API key |
| `failsafe.qorelogic.externalRuntime.timeoutMs` | `number` | `4000` | API call timeout (500–30000ms) |

### Genesis UI

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `failsafe.genesis.livingGraph` | `boolean` | `true` | Enable Living Graph visualization |
| `failsafe.genesis.cortexOmnibar` | `boolean` | `true` | Enable Cortex Omnibar NLP interface |
| `failsafe.genesis.theme` | `enum` | `"starry-night"` | UI theme: `starry-night`, `light`, `high-contrast` |

### Bootstrap

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `failsafe.bootstrap.autoInstallGit` | `boolean` | `true` | Auto-install Git and init repo at bootstrap |

### Feedback

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `failsafe.feedback.outputDir` | `string` | `".failsafe/feedback"` | Directory for session feedback reports |

## File-Based Configuration

### Risk Grading Policy

**File**: `.failsafe/config/policies/risk_grading.json`

```json
{
  "filePathTriggers": {
    "L3": ["auth", "payment", "credential"],
    "L2": ["service", "handler"]
  },
  "contentTriggers": {
    "L3": ["DROP TABLE", "api_key", "private_key"],
    "L2": ["TODO", "HACK"]
  }
}
```

See [[Risk Grading & Policies]] for full documentation.

### Main Configuration

**File**: `.failsafe/config/failsafe.json`

General workspace configuration. Created on first activation.

### Persona Overrides

**Directory**: `.failsafe/config/personas/`

Override default QoreLogic persona settings (Scrivener, Sentinel, Judge, Overseer).

## Governance Artifacts

| Path | Description |
|------|-------------|
| `.failsafe/ledger/soa_ledger.db` | SOA Ledger (Merkle-chained audit trail) |
| `.failsafe/ledger/shadow_genome.db` | Shadow Genome (failure archive) |
| `.failsafe/rag/sentinel-rag.db` | Sentinel RAG store |
| `.failsafe/governance/plans/` | Governance plan files |
| `.failsafe/governance/META_LEDGER.md` | Workspace governance state |
| `.failsafe/risks/risks.json` | Risk register |
| `.failsafe/feedback/` | Session evaluation reports |

## Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Alt+F` / `Cmd+Alt+F` | Open Command Center (popout) |
| `Ctrl+Alt+A` / `Cmd+Alt+A` | Audit Current File |
| `Ctrl+Alt+Shift+R` / `Cmd+Alt+Shift+R` | Open Command Center (popout) |

## Related Pages

- [[Getting Started]] — Initial setup guide
- [[Governance Modes]] — Mode configuration details
- [[Risk Grading & Policies]] — Risk policy configuration
- [[Troubleshooting & FAQ]] — Configuration-related issues
