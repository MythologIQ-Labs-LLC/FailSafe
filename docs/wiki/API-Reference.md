# API Reference

FailSafe's ConsoleServer exposes a REST API for governance operations. The server starts on a dynamic port during extension activation.

## Base URL

```
http://localhost:{dynamicPort}
```

The port is auto-selected at startup and propagated to the extension.

## Authentication

- **Local-only by default**: All endpoints reject non-local connections (`rejectIfRemote`)
- **Remote access**: Possible when the adapter base URL is configured (see Configuration Reference)
- **API key**: Optional via `failsafe.qorelogic.externalRuntime.apiKey` or `QORE_API_KEY` env var

## Endpoints

### Hub & Status

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/hub` | Full hub snapshot (governance state, trust, checkpoints, risks) |
| `GET` | `/api/v1/governance/status` | Current governance status |
| `GET` | `/api/v1/governance/commit-check` | Pre-commit governance check |

### Agent Debugging

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/timeline` | Agent execution timeline entries |
| `GET` | `/api/v1/health` | Agent health metrics |
| `GET` | `/api/v1/genome` | Shadow Genome patterns and unresolved entries |
| `GET` | `/api/v1/runs` | Active and completed agent runs |
| `GET` | `/api/v1/runs/:runId` | Specific run details (UUID format required) |
| `GET` | `/api/v1/runs/:runId/steps` | Steps for a specific run |

### Governance

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/governance/verdicts` | Verdict history |
| `GET` | `/api/v1/governance/provenance/:artifactPath` | AI authorship attribution |
| `POST` | `/api/v1/governance/mode` | Set governance mode |
| `POST` | `/api/v1/governance/break-glass` | Activate break-glass override |

### Checkpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/checkpoints` | Checkpoint history |
| `GET` | `/api/v1/checkpoints/verify` | Verify chain integrity |

### Skills

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/skills` | Discovered skills with tags |
| `POST` | `/api/v1/skills/install` | Install QorLogic skills |
| `GET` | `/api/v1/skills/marketplace` | Marketplace catalog |

### SRE

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/sre/snapshot` | SRE dashboard snapshot |
| `GET` | `/api/v1/sre/fleet` | Fleet health data |
| `GET` | `/api/v1/sre/slo` | SLO compliance data |

### Transparency & Risks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/transparency` | Transparency event stream |
| `GET` | `/api/v1/risks` | Risk register |
| `POST` | `/api/v1/risks` | Add risk to register |

### Actions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/actions/audit` | Trigger file audit |
| `POST` | `/api/v1/actions/show-output` | Focus FailSafe output channel |
| `POST` | `/api/v1/actions/revert` | Revert to checkpoint |

### Brainstorm

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/brainstorm/history` | Brainstorm history |
| `POST` | `/api/v1/brainstorm/export` | Export brainstorm session |
| `POST` | `/api/v1/brainstorm/clear` | Clear brainstorm history |

## WebSocket Events

The ConsoleServer broadcasts real-time events via WebSocket:

| Event | Description |
|-------|-------------|
| `governance.verdict` | Governance verdict issued |
| `sentinel.event` | Sentinel observation |
| `trust.updated` | Trust score changed |
| `skills.install.progress` | Skill installation progress |
| `governance.mode.changed` | Governance mode changed |
| `checkpoint.created` | New checkpoint recorded |
| `run.started` | Agent run started |
| `run.completed` | Agent run completed |

## Hub Snapshot Format

```json
{
  "version": "5.1.0",
  "governance": { "mode": "observe" },
  "trust": { "agents": [...] },
  "checkpointSummary": { "total": 42, "valid": 42 },
  "recentCheckpoints": [...],
  "chainValid": true,
  "risks": [...],
  "workspace": { "id": "...", "compliance": "A" }
}
```

## Error Responses

```json
{
  "error": "Not found",
  "status": 404
}
```

Common HTTP status codes:
- `200` — Success
- `400` — Invalid request (bad UUID, missing params)
- `403` — Remote connection rejected
- `404` — Resource not found
- `500` — Internal error

## Related Pages

- [[Command Center & Monitor]] — UI that consumes this API
- [[Configuration Reference]] — Server configuration
- [[MCP Server & CLI]] — CLI usage of the API
