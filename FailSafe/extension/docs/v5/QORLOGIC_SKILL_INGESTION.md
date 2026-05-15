# QorLogic Skill Ingestion (v5)

## What changed in v5

The v4 extension shipped governance skills bundled inside the VSIX (`dist/extension/skills/`) and copied them into the workspace on demand. v5 retires that path.

In v5, skills come from the [`qor-logic`](https://pypi.org/project/qor-logic/) PyPI package. The extension is the install surface, not the source of truth.

## Flow

1. User clicks **Install QorLogic Skills** in the Command Center (or on the first-run banner).
2. The extension resolves a Python interpreter (see "Interpreter resolution" below).
3. If `qor-logic` is not present, runs `<python> -m pip install qor-logic`.
4. Runs `<python> -m qor.cli install --host claude --scope repo`, then the same for `--host codex`.
5. Walks the resulting skill directories and writes a synthesized `SOURCE.yml` for each skill that doesn't already have one.
6. Triggers a discovery rescan so the Skills tab picks up the new entries.

All subprocess calls use list-form `spawn(cmd, args)` — never shell strings. The pip install is bounded by a 120 s timeout; per-host `qorlogic install` has a 180 s timeout. Output streams to the "FailSafe (QorLogic)" output channel.

## Interpreter resolution

`PythonInterpreterResolver` resolves Python in this priority order:

1. The `failsafe.qorlogic.pythonPath` setting if non-empty.
2. The interpreter selected by the VS Code Python extension (`ms-python.python`) if installed and active.
3. Probe `python3` → `python` → `py -3`. First candidate that returns Python ≥ 3.11 wins.

Result is cached for the session; cache is invalidated when the user changes the `failsafe.qorlogic.pythonPath` setting.

## Host targets

v5.0.0 default hosts: `claude`, `codex`. The ingestor accepts the full qor-logic enum:

| Host        | Install path                |
|-------------|-----------------------------|
| `claude`    | `<workspace>/.claude/skills/` |
| `codex`     | `<workspace>/.codex/skills/`  |
| `kilo-code` | `<workspace>/.kilo-code/skills/` |
| `gemini`    | `<workspace>/.gemini/commands/` |

Repo scope is the default. Global scope (writes to `~/.<host>/...`) requires explicit opt-in.

## Provenance synthesis

`qor-logic` does not ship a `SOURCE.yml` per skill, so the ingestor synthesizes one when missing:

```yaml
source_type: qorlogic-package
source_name: qor-logic
source_url: https://pypi.org/project/qor-logic/
installed_by: failsafe-v5
admission_state: admitted
trust_tier: curated
```

Existing `SOURCE.yml` files are never overwritten — user-edited skills retain their provenance.

## Failure modes

| Error                 | Cause                                                              | User action                                |
|-----------------------|--------------------------------------------------------------------|--------------------------------------------|
| `no-python-found`     | None of the resolution paths yielded Python 3.11+                  | Set `failsafe.qorlogic.pythonPath` or install Python 3.11+ |
| `version-too-old`     | Resolved interpreter is < 3.11                                     | Upgrade Python or pick a different interpreter |
| `user-path-invalid`   | `failsafe.qorlogic.pythonPath` points to a non-executable path     | Fix the setting                             |
| `timeout`             | pip install or qorlogic install exceeded the bounded timeout        | Retry; check network                        |
| `pip-failed`          | `pip install qor-logic` exited non-zero                             | See output channel for stderr               |
| `spawn-failed`        | OS-level failure to start the child process (e.g. ENOENT)           | See output channel                          |

Per-host failures do not abort sibling hosts. The result aggregates `installedHosts` and `failures` separately.

## Trust boundary

`qor-logic` is published by MythologIQ Labs, LLC (first-party). The extension does not pin a version constraint in v5.0.0 — the latest `qor-logic` is installed on each invocation. Provenance carries `trust_tier: curated`.

## Files

- `src/qorlogic/PythonInterpreterResolver.ts` — interpreter resolution and caching
- `src/qorlogic/QorLogicPackageInstaller.ts` — `pip install qor-logic` and version detection
- `src/qorlogic/QorLogicSkillIngestor.ts` — host install orchestration and provenance synthesis
- `src/extension/installSkillsHandler.ts` — wires the ingestor into the existing Install Skills UI entry point
- `src/extension/bootstrapServers.ts` — constructs the dependency graph at activation time
