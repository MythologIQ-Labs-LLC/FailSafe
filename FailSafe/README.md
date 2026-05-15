[![Socket Badge](https://badge.socket.dev/openvsx/package/mythologiq.mythologiq-failsafe/4.9.0?platform=universal)](https://badge.socket.dev/openvsx/package/mythologiq.mythologiq-failsafe/4.9.0?platform=universal)

# FailSafe - AI Governance Extension

**Current Release**: v4.9.0

**Physical Isolation**: This directory contains **100% application/extension code**. Workspace governance operates at the parent level.

---

## Structure

```
FailSafe/                           # APP CONTAINER
├── Antigravity/                    # Gemini/Antigravity source
│   ├── Genesis/                    # Bootstrap & initialization
│   ├── Qorelogic/                  # Core governance
│   └── Sentinel/                   # Monitoring & enforcement
│
├── Claude/                         # Claude CLI source (merged into both builds)
│   ├── Genesis/
│   ├── Qorelogic/
│   └── Sentinel/
│
├── VSCode/                         # VSCode Copilot source
│   ├── Genesis/
│   ├── Qorelogic/
│   └── Sentinel/
│
├── ROAD/                           # Universal/shared
│   ├── visuals/                    # UI assets, diagrams
│   ├── scripts/                    # Cross-environment utilities
│   └── schemas/                    # Shared data schemas
│
├── PROD-Extension/                 # Production packages (unified builds)
│   ├── Antigravity/                # Gemini + Claude (→ OpenVSX)
│   └── VSCode/                     # Copilot + Claude (→ VS Code Marketplace)
│
├── build/                          # Build & validation scripts
├── targets/                        # Environment constraints
└── docs/                           # App-specific documentation

```

**Claude Integration (v3.0.0):** Claude Code is no longer a separate build. Both PROD-Extension folders include `.claude/commands/` alongside their native AI environment files.

---

## Isolation Principle

### Workspace Level (Parent Directory)

```
G:\MythologIQ\FailSafe\            # WORKSPACE ROOT
├── .agent/                         # Active workspace workflows
├── .claude/                        # Active workspace commands
├── .qorelogic/                     # Workspace configuration
└── docs/                           # Workspace governance
    ├── META_LEDGER.md
    ├── SYSTEM_STATE.md
    ├── CONCEPT.md
    └── ARCHITECTURE_PLAN.md
```

**Purpose**: Governance, session state, active AI instructions

### App Level (This Directory)

```
G:\MythologIQ\FailSafe\FailSafe\   # APP CONTAINER
├── Antigravity/                    # Extension source for Gemini
├── Claude/                         # Extension source for Claude
├── VSCode/                         # Extension source for VSCode
└── [build infrastructure]
```

**Purpose**: Extension development, source code, build artifacts

---

## Key Benefits

✅ **Zero Confusion**: Workspace operations cannot accidentally touch app code  
✅ **Physical Boundary**: Different directory trees = different concerns  
✅ **Clear Gitignore**: Public repos can exclude `FailSafe/` entirely  
✅ **Mental Model**: "Am I in FailSafe/? Then I'm doing app development."

---

## Build & Deployment Pipeline

### Two Variants, Two Marketplaces (Claude Unified)

**Architecture Change (v3.0.0):** Claude Code is no longer a separate build. Claude-specific skills, commands, and file structures are folded into both Antigravity and VSCode extensions.

| Variant         | Source                                       | Artifact | Destination                                                                                              | Includes         |
| --------------- | -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| **Antigravity** | `FailSafe/Antigravity/` + `FailSafe/Claude/` | `.vsix`  | [OpenVSX](https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe)                                 | Gemini + Claude  |
| **VSCode**      | `FailSafe/VSCode/` + `FailSafe/Claude/`      | `.vsix`  | [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe) | Copilot + Claude |

### Pipeline Steps

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. SOURCE                    2. DEPLOY                   3. BUILD          │
│  ────────                     ────────                    ───────           │
│                                                                             │
│  FailSafe/Antigravity/  ──┐                                                 │
│  FailSafe/Claude/       ──┼──►  PROD-Extension/Antigravity/  ──►  .vsix    │
│                           │     (Gemini + Claude unified)                   │
│                                                                             │
│  FailSafe/VSCode/       ──┐                                                 │
│  FailSafe/Claude/       ──┼──►  PROD-Extension/VSCode/       ──►  .vsix    │
│                           │     (Copilot + Claude unified)                  │
│                                                                             │
│  (Environment-specific       (Unified deployment           (Publishable    │
│   source code)                structure)                    artifacts)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Edit Source Files

Source files organized by AI environment:

```
FailSafe/Antigravity/           # For Gemini/Cursor (Antigravity extension)
├── Genesis/workflows/          # ql-bootstrap.md, ql-status.md, ql-help.md
├── Genesis/agents/             # ql-governor.md, ql-judge.md, ql-specialist.md
├── Qorelogic/workflows/        # ql-audit.md, ql-plan.md, ql-implement.md, etc.
└── skills/                     # SKILL.md files

FailSafe/Claude/                # Shared Claude CLI resources (merged into both)
├── Genesis/workflows/          # Same structure, Claude format
├── Genesis/agents/
├── Qorelogic/workflows/
└── commands/                   # ql-repo-*.md, agents/, references/

FailSafe/VSCode/                # For VSCode Copilot
├── prompts/                    # *.prompt.md files
├── agents/                     # *.agent.md files
├── instructions/               # *.instructions.md files
└── skills/                     # SKILL.md files
```

### Step 2: Deploy to PROD-Extension

```powershell
cd FailSafe/build
.\deploy.ps1                    # Copies sources to deployment structure
```

This transforms source files into the unified folder structure:

```
PROD-Extension/Antigravity/     # .agent/workflows/, .qorelogic/orbits/, .claude/commands/
PROD-Extension/VSCode/          # .github/prompts/, .github/copilot-instructions/, .claude/commands/
```

**Key:** Both production folders now include `.claude/commands/` for Claude Code integration.

### Step 3: Build Artifacts

```powershell
cd FailSafe/build
.\build-release.ps1             # Creates publishable artifacts
```

Output in `FailSafe/artifacts/`:

```
mythologiq-failsafe-X.X.X-openvsx.vsix    # → OpenVSX (Gemini + Claude)
mythologiq-failsafe-X.X.X-vscode.vsix     # → VSCode Marketplace (Copilot + Claude)
```

### Step 4: Inspect Packaged Artifacts Before Publish

Inspect the built VSIX payloads directly before upload:

```powershell
tar -xOf artifacts/mythologiq-failsafe-X.X.X-openvsx.vsix extension/readme.md | Select-Object -First 60
tar -xOf artifacts/mythologiq-failsafe-X.X.X-openvsx.vsix extension.vsixmanifest | Select-String '<Description'
tar -xOf artifacts/mythologiq-failsafe-X.X.X-vscode.vsix extension/readme.md | Select-Object -First 60
tar -xOf artifacts/mythologiq-failsafe-X.X.X-vscode.vsix extension.vsixmanifest | Select-String '<Description'
```

Required checks:

- README version and `What's New` content match the intended release
- packaged manifest description matches current marketplace copy
- packaged payload reflects current repo state, not a stale artifact

If any packaged file is stale, abort publish, rebuild, and re-inspect.

### Step 5: Publish

```powershell
# Antigravity → OpenVSX
npx ovsx publish artifacts/mythologiq-failsafe-X.X.X-openvsx.vsix -p $OVSX_TOKEN

# VSCode → VSCode Marketplace
npx vsce publish --packagePath artifacts/mythologiq-failsafe-X.X.X-vscode.vsix --pat $VSCE_TOKEN
```

---

## Development Workflows

### Working on Extension

```bash
cd FailSafe/
# Now in app container - edit Antigravity/, Claude/, VSCode/ source
```

### Using QoreLogic Governance

```bash
cd ..  # Back to workspace root
/qor-bootstrap
/qor-plan
/qor-implement
# Governance operates at workspace level, never enters FailSafe/
```

---

## Agent Definitions

Built-in agent definitions are now declared in-code at `extension/src/qorelogic/AgentDefinitions.ts`. Supported agents: Claude Code, GitHub Copilot, Cursor, OpenAI Codex, Windsurf, Gemini CLI.

---

_This container ensures complete physical isolation between workspace governance and application development._

<!-- CHECKPOINT-DEEP-DIVE:START -->

## UI Snapshot

![FailSafe UI Preview](https://raw.githubusercontent.com/MythologIQ/FailSafe/main/FailSafe/extension/media/FailSafe-Overview.PNG)

## Checkpoint Integrity and Local Memory

FailSafe tracks more than Git state. It records governance checkpoints as signed metadata records, then stores Sentinel observations in a local retrieval store so operators can recover the _what_, _why_, and _how_ of runtime decisions.

### Process Reality

1. Git readiness is enforced at bootstrap (`ensureGitRepositoryReady`), including optional auto-install and `git init` when needed.
2. Governance events are checkpointed into `failsafe_checkpoints` with run/phase/status context and deterministic hashes.
3. Each checkpoint carries `git_hash`, `payload_hash`, `entry_hash`, and `prev_hash` so chain integrity can be recomputed.
4. Hub and API surfaces expose both summary and recent checkpoint records for operational visibility.
5. Sentinel writes local memory records to `.failsafe/rag/sentinel-rag.db` (or JSONL fallback), including `payload_json`, `metadata_json`, and retrieval text.

### Technical Advantages

- Tamper evidence via hash-chained checkpoint records.
- Git-linked governance state for repository-correlated audit trails.
- Local-first memory retention for security and low-latency recall.
- Deterministic fallback paths when SQLite is unavailable.

### Claim-to-Source Map

| Claim                                                                                       | Status      | Source                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkpoints persist in `failsafe_checkpoints` with typed governance fields.                 | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:1381`                                                                                                           |
| Checkpoint records include hash-chain material (`payload_hash`, `entry_hash`, `prev_hash`). | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:1395`                                                                                                           |
| Each checkpoint captures current Git head/hash context.                                     | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:1494`                                                                                                           |
| Checkpoint history and chain validity are exposed over API.                                 | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:265`                                                                                                            |
| Hub snapshot includes `checkpointSummary` and `recentCheckpoints`.                          | implemented | `FailSafe/extension/src/roadmap/RoadmapServer.ts:590`                                                                                                            |
| Sentinel local RAG persists observation payload + metadata + retrieval text.                | implemented | `FailSafe/extension/src/sentinel/SentinelRagStore.ts:61`                                                                                                         |
| Sentinel RAG can fall back to JSONL when SQLite is unavailable.                             | implemented | `FailSafe/extension/src/sentinel/SentinelRagStore.ts:89`                                                                                                         |
| RAG writes are controlled by `failsafe.sentinel.ragEnabled` (default `true`).               | implemented | `FailSafe/extension/src/sentinel/SentinelDaemon.ts:341`                                                                                                          |
| Checkpoint and Sentinel RAG tables are independent (no foreign-key link).                   | **false**   | Confirmed: `failsafe_checkpoints` (ledger DB) and `sentinel_observations` (RAG DB) are in separate databases with no shared keys. `evidenceRefs` is always `[]`. |

<!-- CHECKPOINT-DEEP-DIVE:END -->

