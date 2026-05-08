# MCP Server & CLI Integration

FailSafe provides a Model Context Protocol (MCP) server for integration with MCP-compatible AI systems, and supports headless/CLI operation.

## MCP Server

### Overview

FailSafe includes an MCP server (`src/mcp/FailSafeServer.ts`) built on the `@modelcontextprotocol/sdk` package. It exposes governance operations to any MCP-compatible client.

### Capabilities

The MCP server provides tools for:

| Tool | Description |
|------|-------------|
| Governance status | Query current governance state |
| Intent management | Create, view, and seal intents |
| Sentinel audit | Trigger file audits |
| Trust queries | Check agent trust scores |
| Ledger access | Query SOA Ledger entries |

### Connection

The MCP server operates alongside the ConsoleServer, using the same governance substrate. MCP clients connect through the standard MCP protocol.

## Headless / CLI Operation

FailSafe supports headless operation for CI/CD and scripting:

### REST API

The ConsoleServer exposes a full REST API that can be accessed without the VS Code UI:

```bash
# Check governance status
curl http://localhost:{port}/api/v1/governance/status

# Get hub snapshot
curl http://localhost:{port}/api/v1/hub

# Query checkpoints
curl http://localhost:{port}/api/v1/checkpoints

# Query timeline
curl http://localhost:{port}/api/v1/timeline
```

See [[API Reference]] for complete endpoint documentation.

### CI/CD Integration

#### Pre-Commit Guard

FailSafe can install an authenticated git pre-commit hook:

```
FailSafe: Install Commit Hook
```

The hook queries `GET /api/v1/governance/commit-check` before allowing commits.

#### Governance Context Export

Export governance context for CI validation:

```bash
bash tools/export-governance-context.sh
```

This script exports the governance state as CI artifacts for validation during pull requests.

### Upcoming: CI/CD Pipeline Enforcer

Planned for a future release:
- Headless Judge verification validating `failsafe_checkpoints` via cryptography during PRs
- Automated VETO detection blocking merge

### Upcoming: CLI Overseer Lite

Planned for a future release:
- Lightweight CLI-compatible FailSafe for direct website integration
- No VS Code dependency required

## Related Pages

- [[API Reference]] — Complete REST API documentation
- [[Architecture Overview]] — How MCP fits into the architecture
- [[Security Model]] — MCP security considerations
