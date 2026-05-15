# SRE Dashboard & Monitoring

FailSafe includes a Site Reliability Engineering (SRE) dashboard for operational visibility into governance health, agent fleet status, and service level objectives.

## SRE Panel

### Access

- **Monitor sidebar**: Toggle between Monitor and SRE views using the SRE toggle
- **Command Center**: SRE tab with full dashboard

### Components

#### SLO Dashboard

Multi-SLI grid with error budget gauges showing:

| Metric | Description |
|--------|-------------|
| **Governance SLI** | Percentage of actions with PASS verdict |
| **Sentinel SLI** | Sentinel scan success rate |
| **Trust SLI** | Agent trust score health |
| **Error budget** | Remaining error budget before SLO breach |

Error budgets exclude resolved verdicts — VETO→PASS cycles no longer inflate the burn gauge.

#### Fleet Health

Per-agent status display with:

| Field | Description |
|-------|-------------|
| **Agent ID** | DID of the agent |
| **Trust score** | Current trust score and stage |
| **Circuit breaker** | Open/closed/half-open state |
| **Success rate** | Recent action success rate |
| **Last active** | Timestamp of last activity |

#### Activity Feed

SRE Activity Feed with ALLOW/DENY/AUDIT badges showing governance decisions in real-time.

### Agent-Failsafe Bridge

SRE data is available via the `agent-failsafe` Python package:

```bash
pip install agent-failsafe[server]
```

Provides a FastAPI `/sre/snapshot` endpoint for external SRE tool integration.

## Monitoring Configuration

### Adapter Base URL

```json
{
  "failsafe.qorelogic.externalRuntime.baseUrl": "http://127.0.0.1:7777"
}
```

Configurable adapter base URL for connecting to external monitoring systems.

### SRE Types

SRE types are defined in `SreTypes.ts` with v2 schema, supporting:

- Multi-SLI definitions
- Error budget tracking
- Circuit breaker states
- Fleet health aggregation

## Related Pages

- [[Command Center & Monitor]] — Where the SRE dashboard is displayed
- [[Trust Engine & Agents]] — Agent trust data feeding SRE metrics
- [[Sentinel Enforcement Engine]] — Sentinel data feeding SRE metrics
- [[API Reference]] — SRE API endpoints
