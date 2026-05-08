# Command Center & Monitor

FailSafe provides two primary UI surfaces that separate observation from control, mirroring real-world operations environments: observe first, act deliberately.

## UI Surfaces

| Surface | Type | Purpose |
|---------|------|---------|
| **FailSafe Monitor** | Sidebar (compact) | Real-time visibility into governance state |
| **FailSafe Command Center** | Webview / Browser | Full governance control surface |

## FailSafe Monitor

The Monitor is a compact sidebar view that provides continuous, low-effort awareness of governance posture.

### Access

Click the FailSafe icon in the Activity Bar, or run:

```
FailSafe: Open Sidebar
```

### Display Elements

| Element | Description |
|---------|-------------|
| **SHIELD Phase** | Current lifecycle phase with step progression |
| **Governance Mode** | Active mode badge (Observe/Assist/Enforce) |
| **Trust Summary** | Agent trust scores and stages |
| **Risk Distribution** | L1/L2/L3 file counts |
| **Recent Activity** | Latest governance events |
| **Build/Debug Status** | Active IDE session tracking |

### SRE Toggle

The Monitor includes an SRE toggle to switch between Monitor and SRE views:

- **Monitor view**: Governance-focused display
- **SRE view**: Active policies, agent trust scores, OWASP ASI coverage, SLI compliance

## FailSafe Command Center

The Command Center is the primary control surface where teams plan, execute, and govern AI workflows.

### Access Methods

| Command | Behavior |
|---------|----------|
| `FailSafe: Open Command Center (Editor Tab)` | Opens in an editor tab |
| `FailSafe: Open Command Center (Browser)` | Opens in embedded browser |
| `FailSafe: Open Command Center (Browser Popout)` | Opens in external browser |
| `Ctrl+Alt+F` | Opens in external browser |

### Tabs

| Tab | Description |
|-----|-------------|
| **Home** | Overview with governance summary, latest audit, recent releases |
| **Skills** | Installed skills, skill discovery, tag filtering, marketplace toggle |
| **Governance** | Audit log, verdict history, transparency stream |
| **Risks** | Risk register, risk breakdown by grade |
| **Operations** | SHIELD phases, plan tracking, recent completions |
| **Timeline** | Agent execution timeline with governance overlay |
| **Genome** | Shadow Genome browser for failure pattern analysis |
| **Replay** | Agent run replay with step-by-step execution traces |
| **SRE** | SLO dashboard, fleet health, error budgets |
| **Settings** | Configuration, QorLogic installation, workspace bootstrap |

### Home Tab

The Home tab reads workspace truth from:

- **META_LEDGER** — Operations phases, recent verdicts, recent completions
- **BACKLOG** — Risks and blockers
- **Plan files** — Active plans with status
- **CHANGELOG** — Latest release information

Cards on the Home tab:
- Governance summary (mode, compliance grade)
- Latest audit result
- Recent releases
- Risk distribution
- Trust summary

### Skills Tab

- **Installed skills**: All skills with type-ahead tag filter and autocomplete
- **Marketplace toggle**: Curated catalog of external agent repositories with HITL security gates
- **Tags**: Each skill carries tags and source credit
- **Install button**: Direct access to QorLogic skill installation

### Governance Tab

- **Audit log**: Scrollable audit trail from SOA Ledger
- **Verdict history**: PASS/WARN/BLOCK/ESCALATE timeline
- **Decision contracts**: Typed decision pipeline with risk categorization
- **Sentinel events**: Real-time event subscription

### Operations Tab

- **SHIELD phases**: Visual phase tracker parsing META_LEDGER
- **Plan cards**: Active plans with status (capped at 10 + summary row)
- **Recent completions**: Falls through to checkpoint history when plan data is empty

### Settings Tab

- **Install QorLogic Skills**: Host/scope picker with install report
- **Bootstrap Workspace**: Initialize governance directories and Q-DNA
- **Governance mode selector**: Quick mode switch
- **About FailSafe Pro**: Product information and download link
- **Notifications configuration**: Severity gating for toasts
- **Voice settings**: Whisper model picker, language selector, TTS voice
- **Brainstorm settings**: History limit, export

### Brainstorm Panel

The right panel of the Command Center includes a Brainstorm Prep Bay for voice-assisted ideation:

- **Voice input**: Whisper STT with multilingual support
- **Text-to-speech**: Piper TTS with 12-language catalog
- **Brainstorm history**: Configurable limit (1-100, default 10)
- **Export**: JSON download with timestamp

## ConsoleServer

The Command Center is served by the Express-based ConsoleServer:

- **Dynamic port**: Auto-selected at startup, propagated to extension
- **REST API**: 20+ route modules for governance operations
- **WebSocket**: Real-time broadcast of governance events
- **Static assets**: Command Center HTML/CSS/JS

### Route Modules

| Route | Path | Description |
|-------|------|-------------|
| `HomeRoute` | `/` | Command Center entry point |
| `AgentApiRoute` | `/api/v1/timeline`, `/api/v1/health`, `/api/v1/genome` | Agent debugging data |
| `GovernanceKPIRoute` | `/api/v1/governance/*` | Governance metrics |
| `SkillsApiRoute` | `/api/v1/skills/*` | Skill management |
| `SreApiRoute` | `/api/v1/sre/*` | SRE dashboard data |
| `CheckpointRoute` | `/api/v1/checkpoints/*` | Checkpoint history |
| `TransparencyRiskRoute` | `/api/v1/transparency/*` | Transparency stream |
| `BrainstormRoute` | `/api/v1/brainstorm/*` | Brainstorm panel data |

## Related Pages

- [[Architecture Overview]] — ConsoleServer in the overall architecture
- [[API Reference]] — Complete REST API documentation
- [[Configuration Reference]] — ConsoleServer configuration
- [[Skills System]] — Skill discovery and management
