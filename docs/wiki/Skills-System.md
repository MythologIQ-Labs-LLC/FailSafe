# Skills System

FailSafe's skills system provides cross-agent governance capabilities through the `qor-logic` PyPI package. Skills defined once propagate across Claude Code, Codex CLI, GitHub Copilot, Gemini, Cursor, and Windsurf via standardized adapters.

## Architecture

```
qor-logic (PyPI)
    │
    ├── qorlogic install --host claude --scope repo
    │       │
    │       ▼
    │   .claude/skills/qor-*/SKILL.md    (Claude Code)
    │   .claude/agents/qor-*.md           (Claude Code agents)
    │
    ├── qorlogic install --host codex --scope repo
    │       │
    │       ▼
    │   .codex/commands/                  (Codex CLI)
    │
    ├── qorlogic install --host copilot --scope repo
    │       │
    │       ▼
    │   .github/prompts/                  (GitHub Copilot)
    │
    └── qorlogic install --host gemini --scope repo
            │
            ▼
        .agent/workflows/                 (Gemini/Antigravity)
```

## Skill Format

Each skill lives in its own directory with a `SKILL.md` file containing YAML frontmatter:

```
.claude/skills/qor-bootstrap/
├── SKILL.md          # Skill definition with YAML frontmatter
└── templates/        # Optional templates
```

### SKILL.md Structure

```yaml
---
name: qor-bootstrap
description: Seed project DNA and initialize governance
version: 1.0.0
creator: MythologIQ Labs, LLC
tags: [governance, bootstrap, initialization]
hosts: [claude, codex, copilot, gemini]
---

# Bootstrap Skill

## Purpose
Seed project DNA...

## Steps
1. ...
2. ...
```

## Core Skills

FailSafe ships with 19 governance skills:

| Skill | Phase | Description |
|-------|-------|-------------|
| `qor-bootstrap` | S | Seed project DNA, document the Why |
| `qor-plan` | H | Create blueprints with risk grades |
| `qor-audit` | I | Adversarial tribunal, PASS or VETO |
| `qor-implement` | E | Build under Section 4 Razor constraints |
| `qor-substantiate` | L | Verify Reality matches Promise |
| `qor-release` | D | Deploy with traceability |
| `qor-status` | — | Check current governance state |
| `qor-refactor` | — | Governed refactoring with tech debt tracking |
| `qor-document` | — | Authoring and documentation skill |
| `qor-organize` | — | Workspace structure check and cleanup |
| `qor-repo-audit` | — | Gap analysis against Gold Standard checklist |
| `qor-repo-scaffold` | — | Generate missing community files |
| `qor-repo-release` | — | Release discipline enforcement |
| `qor-technical-writer` | — | Documentation quality specialist |
| `qor-ux-evaluator` | — | UI/UX testing with optional Playwright |

## Installation

### Via Command Palette

```
FailSafe: Install QorLogic Skills (defaults)
```

Installs `claude` and `codex` hosts at `repo` scope without prompting.

### Via Command Center

Settings tab → **Install QorLogic Skills** button:

1. Select hosts (multi-select): `claude`, `codex`, `kilo-code`, `gemini`
2. Select scope: `repo` or `global`
3. Review install report

### Via Bootstrap

```
FailSafe: Bootstrap Workspace
```

Runs skill installation as part of workspace initialization.

## Install Process

The installer follows a structured pipeline:

1. **Python Probe** — Auto-detect Python interpreter (setting → VS Code Python extension → `python3`/`python`/`py -3`)
2. **pip install** — Install `qor-logic` from PyPI (120s timeout)
3. **qorlogic install** — Run per host (180s timeout per host)
4. **Provenance** — Synthesize `SOURCE.yml` for each ingested skill
5. **Refresh** — Rescan workspace and update Command Center

### Install Report

Every install produces a structured `QorLogicInstallReport` with:

| Field | Description |
|-------|-------------|
| `phase` | Current phase (python-probe, pip-install, etc.) |
| `host` | Target host (claude, codex, etc.) |
| `scope` | Installation scope (repo or global) |
| `command` | Exact command executed |
| `installedCount` | Number of skills installed |
| `version` | qor-logic package version |
| `error` | Error details if failed |

## Agent Definitions

Agents are separate from skills and live in `.claude/agents/`:

```
.claude/agents/qor-*.md
```

Each agent definition includes:
- Subagent frontmatter (role, capabilities, constraints)
- Persona definition aligned with QoreLogic governance personas
- Behavioral constraints and trust requirements

## Cross-Agent Portability

Skills defined once propagate across all supported agents:

| Agent | Directory | Adapter |
|-------|-----------|---------|
| Claude Code | `.claude/skills/qor-*/SKILL.md` | Native |
| Codex CLI | `.codex/commands/` | ModelAdapter transpilation |
| GitHub Copilot | `.github/prompts/` | ModelAdapter transpilation |
| Gemini | `.agent/workflows/` | ModelAdapter transpilation |
| Cursor | `.cursor/rules/` | ModelAdapter transpilation |
| Windsurf | `.windsurf/rules/` | ModelAdapter transpilation |

## Python Configuration

Override the Python interpreter used for installation:

```json
{
  "failsafe.qorlogic.pythonPath": "/usr/bin/python3.12"
}
```

Leave empty to auto-detect.

## Related Pages

- [[SHIELD Lifecycle Workflow]] — Skills that drive the governance lifecycle
- [[Command Center & Monitor]] — Where skills are discovered and managed
- [[Configuration Reference]] — qor-logic configuration settings
- [[Troubleshooting & FAQ]] — Common installation issues
