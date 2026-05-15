# Getting Started

## Prerequisites

- **VS Code** 1.90.0+ or compatible editor (Cursor, VSCodium, Gitpod)
- **Node.js** 18+ (for local development)
- **Git** (required for checkpoint and ledger features)
- **Python 3.8+** (optional, for qor-logic skill ingestion)

## Installation

### From VS Code Marketplace

```
ext install MythologIQ.mythologiq-failsafe
```

Or search for "FailSafe" in the Extensions panel (`Ctrl+Shift+X`).

### From Open VSX (VSCodium, Gitpod, etc.)

```
ext install MythologIQ.mythologiq-failsafe
```

### From Source (Development)

```bash
git clone https://github.com/MythologIQ-Labs-LLC/FailSafe.git
cd FailSafe/FailSafe/extension
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host with FailSafe loaded.

## First-Run Experience

When FailSafe activates for the first time:

1. **Governance Mode** defaults to `observe` (zero-friction — no blocking, just visibility and logging)
2. **Sentinel** starts in `heuristic` mode, monitoring file changes
3. **SOA Ledger** initializes at `.failsafe/ledger/soa_ledger.db`
4. **ConsoleServer** starts on a dynamic port and serves the Command Center UI

FailSafe will create a `.failsafe/` directory in your workspace root on first activation:

```
.failsafe/
├── config/
│   ├── failsafe.json
│   ├── personas/
│   └── policies/
├── ledger/
│   ├── soa_ledger.db
│   └── shadow_genome.db
├── rag/
│   └── sentinel-rag.db
├── governance/
│   └── plans/
└── feedback/
```

## Quick Start in 5 Minutes

### 1. Open the Monitor

Click the FailSafe icon in the Activity Bar, or run:

```
FailSafe: Open Sidebar
```

The Monitor shows real-time governance state, SHIELD phase, and trust scores.

### 2. Open the Command Center

```
FailSafe: Open Command Center (Editor Tab)
```

Or press `Ctrl+Alt+F` to open in a browser popout.

The Command Center provides the full governance surface: Overview, Skills, Governance, Risks, Operations, and Settings.

### 3. Bootstrap Your Workspace

```
FailSafe: Bootstrap Workspace (install qor-logic + scaffold)
```

This command:
- Installs qor-logic skills from PyPI
- Scaffolds `.claude/skills/` and `.claude/agents/`
- Creates governance directories
- Initializes the SOA Ledger

### 4. Install QorLogic Skills

In the Command Center Settings tab, click **Install QorLogic Skills**, or run:

```
FailSafe: Install QorLogic Skills (defaults)
```

This installs skills for Claude Code and Codex CLI. Supports hosts: `claude`, `codex`, `kilo-code`, `gemini`.

### 5. Configure Risk Grading (Optional)

Create or edit `.failsafe/config/policies/risk_grading.json`:

```json
{
  "filePathTriggers": {
    "L3": ["auth", "payment", "credential"]
  },
  "contentTriggers": {
    "L3": ["DROP TABLE", "api_key"]
  }
}
```

Top-level sections replace defaults. Include full sections if you want to preserve default triggers.

## Governance Modes

Switch modes at any time via command palette:

```
FailSafe: Set Governance Mode
```

| Mode | Behavior | Best For |
|------|----------|----------|
| **Observe** | No blocking, just visibility and logging | New users, exploration |
| **Assist** | Smart defaults, auto-intent, gentle prompts | Most development workflows |
| **Enforce** | Full control, intent-gated saves, L3 approvals | Compliance, regulated industries |

New installations default to `observe`. See [[Governance Modes]] for detailed mode documentation.

## Key Commands

| Command | Description |
|---------|-------------|
| `FailSafe: Open Command Center (Editor Tab)` | Full governance UI in editor |
| `FailSafe: Open Sidebar` | Compact Monitor sidebar |
| `FailSafe: Audit Current File` | Run Sentinel audit on active file |
| `FailSafe: Set Governance Mode` | Switch Observe/Assist/Enforce |
| `FailSafe: Secure Workspace` | Full workspace security scan |
| `FailSafe: Panic Stop` | Emergency halt all monitoring |
| `FailSafe: Token Economics Dashboard` | Token usage and cost metrics |
| `FailSafe: Revert to Checkpoint` | Time-travel rollback |
| `FailSafe: Agent Health Status` | Agent health and stability indicators |
| `FailSafe: Agent Run Replay` | Step-by-step agent execution replay |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+F` / `Cmd+Alt+F` | Open Command Center |
| `Ctrl+Alt+A` / `Cmd+Alt+A` | Audit Current File |

## @failsafe Chat Participant

FailSafe registers a VS Code chat participant accessible as `@failsafe`:

| Command | Description |
|---------|-------------|
| `@failsafe /intent` | Create or view active intent |
| `@failsafe /audit` | Audit current file for risks |
| `@failsafe /trust` | Check agent trust score |
| `@failsafe /status` | Show governance status |
| `@failsafe /seal` | Seal the active intent |

## Next Steps

- Read the [[Architecture Overview]] to understand FailSafe's layer model
- Configure [[Risk Grading & Policies]] for your project
- Learn the [[SHIELD Lifecycle Workflow]] for governed AI development
- Explore [[Skills System]] for cross-agent skill portability
