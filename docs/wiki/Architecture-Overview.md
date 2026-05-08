# Architecture Overview

FailSafe uses a layered architecture with strict separation of concerns. Each layer has a defined responsibility and communicates through typed interfaces.

## Layer Model

```
┌─────────────────────────────────────────────────────┐
│                  GENESIS (Experience)                │
│   Monitor • Command Center • Cortex Stream • Dojo   │
├─────────────────────────────────────────────────────┤
│              QORELOGIC (Governance)                  │
│   Policies • Intent • Ledger • Trust • Planning     │
├─────────────────────────────────────────────────────┤
│              SENTINEL (Enforcement)                  │
│   File Watcher • Heuristics • Verdicts • RAG        │
├─────────────────────────────────────────────────────┤
│              SHARED INFRASTRUCTURE                   │
│   EventBus • CryptoService • Logger • ConfigManager │
└─────────────────────────────────────────────────────┘
```

| Layer | Source Directory | Description |
|-------|-----------------|-------------|
| **Genesis** | `src/genesis/` | UI surfaces: Monitor, Command Center, panels, decorators |
| **QoreLogic** | `src/qorelogic/` | Governance engine: policies, ledger, trust, planning |
| **Sentinel** | `src/sentinel/` | Enforcement: file watching, heuristic analysis, verdicts |
| **Governance** | `src/governance/` | Cross-cutting governance: intent, enforcement, RBAC, revert |
| **Shared** | `src/shared/` | Infrastructure: EventBus, crypto, logging, config |
| **Roadmap** | `src/roadmap/` | ConsoleServer, routes, Command Center UI assets |
| **MCP** | `src/mcp/` | Model Context Protocol server |
| **Economics** | `src/economics/` | Token cost calculation and ROI metrics |

## Core Systems

| System | Layer | Description |
|--------|-------|-------------|
| **Genesis** | Experience | FailSafe Monitor + FailSafe Command Center |
| **QoreLogic** | Governance | Intent gating, policies, ledger, and trust |
| **Sentinel** | Enforcement | File watcher audits and verdicts |

## Directory Structure

### Workspace Root (Governance)

```
/ (root)
├── .agent/                   # Active workspace workflows
├── .claude/                  # Active commands + secure tokens
│   ├── skills/qor-*/SKILL.md # Governance skills
│   └── agents/qor-*.md       # Agent definitions
├── .failsafe/                # Runtime artifacts (gitignored)
│   ├── config/               # User configuration
│   ├── ledger/               # SOA Ledger + Shadow Genome
│   ├── governance/           # Plans, state
│   └── rag/                  # Sentinel RAG store
├── .qorelogic/               # Workspace configuration (locked)
├── docs/                     # Workspace governance docs
├── FailSafe/                 # Extension source container
│   ├── extension/            # VS Code Extension TypeScript project
│   └── build/                # Build & validation tooling
└── tools/                    # Reliability & validation scripts
```

### Extension Source

```
FailSafe/extension/src/
├── extension/          # Bootstrap modules + main.ts entry point
├── genesis/            # UI components, panels, views, chat
├── governance/         # Intent, enforcement, RBAC, revert, provenance
├── qorelogic/          # Manager, policies, ledger, trust, planning, shadow
├── sentinel/           # Daemon, engines, verdicts, RAG store, health
├── roadmap/            # ConsoleServer, routes, UI assets
├── mcp/                # MCP server
├── economics/          # Token economics
├── shared/             # EventBus, crypto, logger, config, types
├── webui/              # Web UI components
├── core/               # Core utilities
├── types/              # Shared TypeScript types
└── test/               # Test suites
```

## Bootstrap Sequence

```
ACTIVATION
    │
    ├── 1. INITIALIZE CORE
    │   ├── Load configuration from .failsafe/config/
    │   ├── Initialize logging
    │   └── Verify workspace permissions
    │
    ├── 2. START QORELOGIC LAYER
    │   ├── Load policies
    │   ├── Initialize SOA Ledger connection
    │   └── Load trust scores
    │
    ├── 3. START SENTINEL DAEMON
    │   ├── Initialize file system watcher
    │   ├── Load heuristic patterns
    │   ├── Connect to local LLM (if configured)
    │   └── Begin continuous monitoring
    │
    ├── 4. START CONSOLESERVER
    │   ├── Bind to dynamic port
    │   ├── Register REST API routes
    │   └── Start WebSocket broadcast
    │
    ├── 5. START GENESIS UI
    │   ├── Register sidebar views
    │   ├── Initialize Monitor webview
    │   └── Register commands and keybindings
    │
    └── 6. READY
        └── Emit 'failsafe.ready' event
```

## Key Components

### ConsoleServer (`src/roadmap/ConsoleServer.ts`)

The Express-based HTTP server that powers the Command Center. Serves static UI assets and provides a REST API for governance operations. Runs on a dynamic port with WebSocket broadcast for real-time updates.

Extracted route modules:
- `AgentApiRoute` — Timeline, health, genome, run replay
- `GovernanceKPIRoute` — Governance metrics and KPIs
- `SkillsApiRoute` — Skill discovery and management
- `SreApiRoute` — SRE dashboard data
- `CheckpointRoute` — Checkpoint history and integrity
- `TransparencyRiskRoute` — Transparency stream and risk register
- And 15+ additional route modules

### EventBus (`src/shared/EventBus.ts`)

Central event bus connecting all systems. Supports typed event subscriptions, fan-out, and cache-and-replay for late subscribers.

### CryptoService (`src/shared/CryptoService.ts`)

Cryptographic operations including Ed25519 signing, SHA-256 hashing, and HMAC. Keys are stored in VS Code SecretStorage.

### EnforcementEngine (`src/governance/EnforcementEngine.ts`)

The save-time governance gate. Evaluates file saves against policies, risk grades, and governance mode to allow, warn, or block changes.

## Physical Isolation Model

FailSafe uses **Physical Isolation** to separate workspace governance from application development:

- **Workspace Root**: Governance artifacts, docs, configuration
- **FailSafe/ Container**: Extension source code and build tooling

This ensures governance files don't pollute the extension build and vice versa.

## Section 4 Razor

All FailSafe code follows the Section 4 Razor complexity constraints:

- **40 lines** maximum per function
- **250 lines** maximum per file
- **3 levels** maximum nesting depth

When a module exceeds these limits, it is decomposed into smaller modules. This discipline keeps the codebase maintainable and auditable. See v4.6.0 changelog for the major decomposition pass that reduced ConsoleServer from 3265 lines to 1124 lines across 16 extracted modules.
