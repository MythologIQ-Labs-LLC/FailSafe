# Agent CLI wrappers integration (Continue + Aider)

> One-line: FailSafe spawns headless coding-agent CLIs (Continue `cn`, Aider) in argv form, gates them before they run, classifies the diff they produce against the live PolicyEngine, and escalates any L3-risk change to the human approval queue — so an autonomous agent's writes are governed instead of trusted.

- **Pattern:** wrapper
- **Direction:** governed execution
- **Status:** in review (#151)
- **Official docs:** Continue — https://docs.continue.dev/ · Continue headless — https://docs.continue.dev/cli/headless-mode · Aider — https://aider.chat/docs/ · Aider scripting — https://aider.chat/docs/scripting.html
- **Backlog:** #104 (Continue) · #107 (Aider)

## What it does
On demand, FailSafe detects the agent binary, decides whether the requested run is permitted, and only then spawns it — argv-form with `shell: false`, so there is no shell-injection surface and no command string is ever assembled. The gate is two-phase: a dangerous requested permission (a shell/exec allowlist for Continue) or an unsafe precondition (a dirty worktree for Aider) is refused **before** any process starts; runs are configured so their changes stay uncommitted, and after the run the produced `git diff` is re-classified with the injected PolicyEngine. A change that lands at L3 ESCALATES to the real L3 approval queue rather than auto-applying. Every run — spawned or refused — emits a FailSafe receipt recording argv, verdict, risk grade, exit code, and a diff summary. Secrets (Continue's `CONTINUE_API_KEY`) travel only in the child process environment; they are never placed in argv and never recorded in the receipt.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.continue.enabled` | `false` | no | Master on/off for the Continue wrapper. When off, no `cn` process is spawned. |
| `failsafe.integrations.continue.apiKey` | — | yes | Continue API key; overlaid onto the child env as `CONTINUE_API_KEY` only — never argv, never the receipt. |
| `failsafe.integrations.continue.allow` | `[]` | no | The `--allow <tool>` permission allowlist passed to `cn`; each entry maps to a FailSafe risk tier (shell/exec → L3, file-write → L2, else L1). |
| `failsafe.integrations.continue.allowWrites` | `false` | no | Whether write-tier (L2) changes may auto-apply. When false, any write is BLOCKED before spawn. |
| `failsafe.integrations.aider.enabled` | `false` | no | Master on/off for the Aider wrapper. When off, no `aider` process is spawned. |
| `failsafe.integrations.aider.allowDirty` | `false` | no | Allow running against a worktree with uncommitted changes. When false (default), a dirty worktree is BLOCKED before spawn. |
| `failsafe.integrations.aider.autoCommit` | `false` | no | Pass `--auto-commits` instead of `--no-auto-commits`. Default false keeps changes uncommitted so the gate can inspect the diff. |
| `failsafe.integrations.aider.allowWrites` | `false` | no | Whether write-tier (L2) changes may auto-apply. When false, any write is BLOCKED. |

Both wrappers are off by default and degrade to a no-op (no process spawned) when disabled or when the binary is not found on `PATH`.

## Security
The only secret in this family is Continue's API key. It is overlaid onto the spawned child's environment (`CONTINUE_API_KEY`) by the runner and nowhere else — it is never an argv element and is never written into the receipt (a masking test asserts argv/receipt carry no key). All spawns are argv-form with `shell: false`; command strings are never constructed. The gate runs before the process: a shell/exec allowlist, a write when writes are disallowed, or (for Aider) a dirty worktree never reaches a live spawn. The PolicyEngine classifier is injected, so the pure decision logic is deterministically testable with no live process. The receipt records argv (safe by construction), verdict, risk grade, exit code, and a diff summary — never raw secrets.

## Command / wiring
- `FailSafe: Run Continue (governed)` (command id `failsafe.continue.run`) — gates the requested `--allow` tier, runs `cn -p <prompt>` argv-form with the API key in the child env, then re-classifies the diff and escalates a surprise L3 change.
- `FailSafe: Run Aider (governed)` (command id `failsafe.aider.run`) — refuses a dirty worktree unless `allowDirty`, runs `aider --message <prompt>` with auto-commit off, then classifies the resulting diff and escalates L3.

Both commands are thin glue defined in `src/extension/agent-cli-command.ts` over the pure wrappers in this folder.

## Files
- `agent-cli-core.ts` — pure shared substrate: binary detection, dirty-worktree check, diff capture + summary, risk classification, the deterministic ALLOW/BLOCK/ESCALATE decision, and receipt construction. Holds the production argv-form runner (`defaultAgentRun`, `shell: false`); the runner is injected as `AgentRunFn` in tests so no live process spawns.
- `continue-wrapper.ts` — pure Continue logic: maps the `--allow` allowlist to a risk tier, builds argv (`-p <prompt>` + repeatable `--allow <tool>`), and orchestrates the two-phase governed run with `CONTINUE_API_KEY` in the child env only.
- `aider-wrapper.ts` — pure Aider logic: builds argv (`--message <prompt>`, `--yes-always`, `--no-auto-commits`/`--auto-commits`), enforces the dirty-worktree pre-run gate, and governs the run.
- command: `src/extension/agent-cli-command.ts` — VS Code command wiring for `failsafe.continue.run` + `failsafe.aider.run`
- test: `src/test/integrations/agent-cli/agent-cli.test.ts`

## Verified surface
Continue (issue #104, https://docs.continue.dev/cli/headless-mode):
- `cn -p <prompt>` — headless prompt invocation
- `--allow <tool>` — repeatable per-tool permission flag
- `--version` — used for binary detection
- `CONTINUE_API_KEY` — auth via environment variable (child env only)

Aider (issue #107, https://aider.chat/docs/scripting.html + https://aider.chat/docs/config/options.html, cross-checked against upstream `aider/args.py`):
- `--message` / `-m` — one-shot scripting message
- `--no-auto-commits` / `--auto-commits` — commit behaviour toggle
- `--yes-always` — non-interactive confirmation (NOTE: it is `--yes-always`, not `--yes`; no `--yes` flag exists)
- `--version` — used for binary detection

Both wrappers spawn argv-form only (`shell: false`); no shell command string is ever constructed, and the Continue API key never appears in argv or the receipt.
