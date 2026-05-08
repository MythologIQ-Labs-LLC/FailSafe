# Troubleshooting & FAQ

## Common Issues

### Installation

#### "FailSafe doesn't activate after install"

FailSafe uses targeted activation events (not startup-wide). Trigger activation by:

1. Opening the FailSafe sidebar
2. Running any `FailSafe:` command from the command palette
3. Using the `@failsafe` chat participant

#### "Node.js version mismatch / native module errors"

FailSafe requires Node.js 18+. The extension uses `better-sqlite3` which requires matching Node ABI versions:

```bash
# Check your Node version
node --version

# Required: v18+
# Recommended: v20.18.1 (see .nvmrc)
```

If using VS Code with a different Node version, the extension will attempt to download pre-built binaries automatically.

#### "Python not found for qor-logic installation"

The installer probes for Python in this order:

1. `failsafe.qorlogic.pythonPath` setting
2. VS Code Python extension's configured interpreter
3. System `python3` / `python` / `py -3`

Fix: Set the path explicitly:

```json
{
  "failsafe.qorlogic.pythonPath": "/usr/bin/python3"
}
```

#### "pip install timeout during skill installation"

The installer has built-in timeouts:
- `pip install`: 120 seconds
- `qorlogic install` per host: 180 seconds

For slow connections, retry. If persistent, check network/firewall settings.

### Monitor & Command Center

#### "Monitor doesn't see my work / shows stale data"

Known issue fixed in v5.1.0 (B191). The root cause was a missing `type="module"` on the Monitor's bootstrap script. Ensure you're on v5.1.0+.

Additional checks:
- The Monitor reads from `META_LEDGER.md` for SHIELD state
- WebSocket connection must be active (check browser console)
- Try refreshing the Monitor (Reload button)

#### "Command Center shows empty/placeholder state"

The Command Center reads workspace truth from:

- `META_LEDGER.md` — Operations phases, verdicts, completions
- `BACKLOG.md` — Risks
- `.failsafe/governance/plans/` — Active plans

If these don't exist, bootstrap the workspace first:

```
FailSafe: Bootstrap Workspace
```

#### "ConsoleServer 404 on static assets"

Fixed in v4.6.2/v4.6.3. If you're on an older version, update. The fix adds `dotfiles: "allow"` to Express static serving.

### Governance

#### "Saves blocked unexpectedly in Enforce mode"

In Enforce mode, all L2+ changes require explicit intent:

1. Check your governance mode: `FailSafe: Set Governance Mode`
2. If testing, switch to `observe` or `assist` mode
3. For L3 blocks, check the L3 approval queue in the Command Center

#### "L3 approval queue not processing"

The L3 queue auto-prunes expired items based on the SLA setting:

```json
{
  "failsafe.qorelogic.l3SLA": 120
}
```

Check if the SLA is too aggressive for your workflow.

#### "Trust score stuck at low value"

Trust recovery is intentionally asymmetric (hard to earn, easy to lose):

- Probationary period: 5 verifications or 30 days
- 48-hour cooldown after violations
- Trust floor: 0.35 (prevents permanent blocking)

### Sentinel

#### "Sentinel not detecting changes"

Verify:
- `failsafe.sentinel.enabled` is `true`
- The workspace root has a `.failsafe/` directory
- The file is in a watched directory

#### "Too many false positives from heuristics"

Heuristic patterns have configurable false positive rates. You can:

1. Adjust risk grading in `.failsafe/config/policies/risk_grading.json`
2. Switch to a less aggressive governance mode
3. Use `llm-assisted` mode for secondary analysis (reduces FPs)

## Frequently Asked Questions

### General

**Q: Does FailSafe require an internet connection?**
A: No. FailSafe is local-first. All governance decisions are made locally. Internet is only needed for extension installation and qor-logic skill ingestion.

**Q: Does FailSafe slow down my editor?**
A: Minimal impact. Heuristic checks are sub-millisecond. The Sentinel daemon runs asynchronously. LLM-assisted mode adds latency only for flagged events.

**Q: Can I use FailSafe with multiple AI agents simultaneously?**
A: Yes. FailSafe's Multi-Agent Governance Fabric detects and governs Claude, Copilot, Codex, and other agents concurrently via terminal correlation.

### Governance

**Q: What happens if I skip the SHIELD lifecycle?**
A: In `observe` mode, nothing blocks you. In `assist` and `enforce` modes, the EnforcementEngine will warn or block saves that don't comply with governance requirements.

**Q: Can I disable governance entirely?**
A: You can set governance mode to `observe` for zero-friction visibility, or uninstall the extension. The `observe` mode gives you logging without any blocking.

**Q: How do I recover from a bad checkpoint?**
A: Use the time-travel rollback:
```
FailSafe: Revert to Checkpoint (Time-Travel)
FailSafe: Undo Last Attempt
```

### Data & Privacy

**Q: Where is governance data stored?**
A: All data is stored locally in `.failsafe/` within your workspace. Nothing is sent to external servers by default.

**Q: Can I export the audit trail?**
A: Yes. The SOA Ledger is a standard SQLite database. You can also use the REST API to extract data, or run `tools/export-governance-context.sh` for CI exports.

**Q: What happens to data if I uninstall FailSafe?**
A: The `.failsafe/` directory remains in your workspace. You can delete it manually if desired.

## Getting Help

- **Wiki**: You're here! Browse the sidebar for detailed documentation
- **GitHub Issues**: https://github.com/MythologIQ-Labs-LLC/FailSafe/issues
- **GitHub Discussions**: https://github.com/MythologIQ-Labs-LLC/FailSafe/discussions
- **Security issues**: security@mythologiq.dev
