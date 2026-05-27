# FailSafe Component Help

Audience: operators using the packaged VS Code extension (`v5.2.2`).

Scope: shipped UI surfaces, governance components, and Voice + Mindmap Status in the current release.

## At a Glance

| Surface | Purpose | Use It When |
| --- | --- | --- |
| FailSafe Monitor | Compact live status inside the VS Code sidebar | You need quick health and posture checks while coding |
| FailSafe Console | Full control surface in browser or editor tab | You need actions, workflows, governance review, or history |
| Console: Overview | Trust snapshot, operation stream, threat and chain status | You need fast situational awareness |
| Console: Operations | Mission strip, phase progress, integrity and rollback actions | You are actively running execution workflows |
| Console: Transparency | Real-time event stream | You are debugging why FailSafe did something |
| Console: Risks | Risk register CRUD | You are tracking durable project risks |
| Console: Skills | Skill discovery, relevance, and intent shell | You are selecting governance-aware execution skills |
| Console: Governance | Sentinel status, policies, L3 queue, protocol audit log | You are reviewing control and approval state |
| Console: Mindmap | Manual node-based ideation canvas with local session export | You are mapping ideas before implementation |
| Console: Settings | Theme and local console preferences | You need presentation or workspace preference changes |
| Agent Health Status | Status bar health indicator | You need at-a-glance agent risk awareness |
| Agent Execution Timeline | Categorized event timeline | You are debugging agent actions or governance decisions |
| Shadow Genome Debugger | Failure pattern browser | You are investigating recurring agent failure modes |

## Monitor vs Console

### FailSafe Monitor

The Monitor is an awareness surface. Keep it open while editing to track status without context switching.

Expected use:

1. Confirm Sentinel is active.
2. Watch queue and confidence-related indicators.
3. Open Console when you need to act.

### FailSafe Console

The Console is the control surface. Use it for actions, state transitions, governance work, and deeper inspection.

Open paths:

- `FailSafe: Open Command Center (Browser Popout)`
- `FailSafe: Open Command Center (Editor Tab)`

## Console Tabs

### Overview

Shows a summary card layer (trust, events, threats, chain status) and a recent operations stream.

Operator note: some secondary widgets are presentation-only and should not be treated as policy evidence.

### Operations

Shows phase and adherence metrics, then exposes key operational actions:

- `Resume`
- `Panic Stop`
- `Verify Chain`
- `Rollback`

Use this tab as the day-to-day execution cockpit.

### Transparency

Streams runtime events for governance and prompt lifecycle visibility.

Use this first when behavior seems unexpected before escalating to deeper audits.

### Risks

Stores durable risk records with severity and lifecycle fields.

Use this for multi-session risk ownership, not transient warnings.

### Skills

Supports:

- auto/manual ingest
- phase-filtered relevance
- tabbed skill views (`Recommended`, `All Relevant`, `Installed`, `Other`)

Use this to choose execution scaffolds that match current phase and governance context.

### Governance

Combines:

- Sentinel live status
- active policy list
- L3 verification queue
- protocol audit log

Use this tab when decisions require human review, overrides, or chain verification.

### Mindmap

Current release behavior:

- add and categorize nodes
- drag nodes on SVG/3D canvas
- save session in local state
- export JSON (filename includes timestamp + timezone offset)
- voice-assisted ideation: multilingual Whisper STT (tiny/base/small) + Piper TTS, both local; per-language voice auto-match
- voice substrate state visible via the voice status badge in the right panel

Voice capture and spoken response require vendor runtime assets per `src/roadmap/ui/vendor/*/VENDOR.md`. When Piper assets are absent the TTS engine surfaces an `error:piper_not_vendored` state to the badge instead of failing silently.

### Settings

Console-level preferences organized into cards:

- **Theme** — light/dark/contrast variants with per-theme accent colors.
- **Voice & Audio** — audio device selection, Whisper model picker, STT language, auto-match voice toggle, Piper voice selection, push-to-talk key, wake word, silence timeout.
- **Notifications** — independent toggles for info-tier and error-tier toasts.
- **Brainstorm** — ideation history limit (1-100; default 10).
- **QorLogic Skills** — install / refresh / show output.
- **FailSafe Pro** — discovery card linking to <https://mythologiq.studio/products/failsafe-pro>.

Use this for UI preference and substrate configuration; governance policy configuration remains code/config based.

## Governance Components

### Sentinel

Sentinel produces runtime verdicts with confidence and risk context.

- `PASS`: no blocking issue detected
- `WARN`: proceed with review
- `BLOCK`: stop and remediate
- `ESCALATE`: human review required

### QoreLogic

QoreLogic is deterministic governance logic (policy by code, not prompt compliance).

Use governance settings for mode and thresholds, then use ledger and transparency views for validation.

### SOA Ledger

The local ledger is the audit source of truth for decisions, overrides, checkpoints, and provenance events.

If a claim is not traceable to code plus ledger evidence, treat it as unverified.

## Voice + Mindmap Status

| Capability | Status | Notes |
| --- | --- | --- |
| Mindmap tab shell in Console | implemented | Shipped in `command-center.html` + `modules/brainstorm*.js` |
| Manual node canvas + export | implemented | Local ideation and JSON export are active |
| Mic capture (MediaRecorder) | implemented | `SttEngine` records audio in browser and drives transcript flow |
| STT/TTS roundtrip | implemented | `stt-engine.js` + `tts-engine.js` integrated in the Mindmap (`brainstorm`) renderer |
| Confidence-based node coloring by extraction | implemented | `brainstorm-canvas.js` maps `confidence` to semantic colors |

## Agent Debugging Surfaces (v4.9.2)

### Agent Health Status

Status bar indicator showing composite agent health. Aggregates open risks, trust scores, and queue depth into a single traffic-light level.

| Level | Meaning | Trigger |
| --- | --- | --- |
| Healthy | No actionable issues | No critical/high risks, trust >= 0.4, queue <= 3 |
| Elevated | Watch queue depth | Queue depth > 3 |
| Warning | Active risks or low trust | Open high-severity risks or avg trust < 0.4 |
| Critical | Immediate attention | Open critical risks or quarantined agents |

Access: `FailSafe: Agent Health Status` or click the status bar item.

### Agent Execution Timeline

Real-time timeline of agent actions with governance decision overlay. Shows verdicts, trust updates, approvals, and DiffGuard events.

Features:

- Category filter tabs (All, Verdicts, Trust, Approvals, DiffGuard)
- Severity toggles with visual indicators
- Expandable detail with file navigation
- Bounded to 500 entries, newest-first

Access: `FailSafe: Agent Execution Timeline`.

### Shadow Genome Debugger

Interactive browser for failure patterns recorded by the Shadow Genome. Shows pattern cards with count badges, causal vectors, unresolved entries with inline remediation, and negative constraints per agent.

Access: `FailSafe: Shadow Genome Debugger`.

## Claim Map

| Claim | Status | Source |
| --- | --- | --- |
| Monitor and Console are both shipped UI surfaces | implemented | `FailSafe/extension/package.json`, `FailSafe/extension/src/roadmap/FailSafeSidebarProvider.ts`, `FailSafe/extension/src/extension/commands.ts` |
| Console includes 8 tabs including Mindmap and Governance | implemented | `FailSafe/extension/src/roadmap/ui/command-center.html`, `FailSafe/extension/src/roadmap/ui/command-center.js` |
| Mindmap in `v4.4.0` supports voice + manual flows | implemented | `FailSafe/extension/src/roadmap/ui/modules/brainstorm.js`, `FailSafe/extension/src/roadmap/ui/modules/stt-engine.js`, `FailSafe/extension/src/roadmap/ui/modules/tts-engine.js` |
| Transcript-backed graph extraction endpoint is shipped | implemented | `FailSafe/extension/src/roadmap/ConsoleServer.ts` (`POST /api/v1/brainstorm/transcript`) |
| Voice runtime needs vendored engine assets | implemented | `FailSafe/extension/src/roadmap/ui/vendor/whisper/VENDOR.md`, `FailSafe/extension/src/roadmap/ui/vendor/piper/VENDOR.md` |
| Agent Health Status indicator in status bar | implemented | `FailSafe/extension/src/sentinel/AgentHealthIndicator.ts`, `FailSafe/extension/src/extension/main.ts` |
| Agent Execution Timeline with category filters | implemented | `FailSafe/extension/src/genesis/panels/AgentTimelinePanel.ts`, `FailSafe/extension/src/sentinel/AgentTimelineService.ts` |
| Shadow Genome Debugger with pattern cards | implemented | `FailSafe/extension/src/genesis/panels/ShadowGenomePanel.ts`, `FailSafe/extension/src/genesis/panels/ShadowGenomePanelHelpers.ts` |
