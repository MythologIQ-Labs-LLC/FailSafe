# Agent CLI wrappers integration (Continue + Aider)

> One-line: FailSafe runs headless coding-agent CLIs (Continue `cn`, Aider) in a disposable git worktree, holds whatever they change as a quarantined change set, and writes it to your workspace only when you choose Apply in the same command.

- **Pattern:** wrapper
- **Direction:** governed execution
- **Status:** worktree isolation with operator-approved promotion (#475)
- **Official docs:** Continue — https://docs.continue.dev/ · Continue headless — https://docs.continue.dev/cli/headless-mode · Aider — https://aider.chat/docs/ · Aider scripting — https://aider.chat/docs/scripting.html
- **Backlog:** #104 (Continue) · #107 (Aider) · #475 (isolation)

## What it does
1. **Preconditions (fail closed, agent never started).** The workspace must be a git work tree whose `HEAD` resolves, with no uncommitted or untracked files and no skip-worktree / assume-unchanged entries. Process tracking must start. Write authorization (`allowWrites`) must be on, and a Continue allowlist that grants shell/exec tools is refused.
2. **Isolated run.** FailSafe snapshots the repository, adds a detached worktree of `HEAD` under the OS temp directory, and starts the agent there (argv-form, `shell: false`). Every process the agent starts is tracked; when the agent exits or times out (`failsafe.integrations.agentCli.timeoutMs`, default 15 min) the whole tree is killed.
3. **Checks.** The repository is snapshotted again and compared: tracked and untracked files (by content, independent of file timestamps), `HEAD`, every ref, the index flags, `.git/config`, `config.worktree`, `packed-refs`, `.git/hooks/`, `.git/info/`, top-level ignored files, and the worktree's own link files. Any difference is `WORKSPACE_CHANGED_DURING_RUN` and nothing is promotable.
4. **Capture.** FailSafe's own git calls ignore the system and global git config (an agent can rewrite `~/.gitconfig`) and disable hooks, fsmonitor, excludes and attribute files; the user's EOL, `safe.directory`, long-path and LFS settings are read before the run and carried explicitly. The change set is captured byte-for-byte (`--binary --full-index`) and validated: symlinks, submodules, `.git` / `.gitmodules` paths, traversal, drive letters, alternate data streams and Windows device names are rejected (`REJECTED_PATCH`).
5. **Promotion.** The operator chooses **Discard**, **Review diff** (a read-only document built from the in-memory bytes) or **Apply**; Escape or closing the dialog discards. Apply re-checks the bytes' hash, the validation, that `HEAD` has not moved and that the repository still matches the pre-run snapshot, then runs `git apply --check` and `git apply` on the same bytes and re-derives the result through a throwaway index. A difference is `APPLY_MISMATCH` (changes are left uncommitted for you; no automatic revert). Every quarantine, apply, refusal, mismatch and discard is written to the ledger; an audit copy goes to the extension's global storage (newest 20 kept) and is never read back.

Run outcomes: `BLOCKED_PRE_EXECUTION`, `NO_CHANGES`, `QUARANTINED_PENDING_APPROVAL`, `REJECTED_PATCH`, `WORKSPACE_CHANGED_DURING_RUN`, `FAILED_INCONCLUSIVE` (git or worktree failure, non-zero exit, timeout, surviving process). Only `QUARANTINED_PENDING_APPROVAL` can be applied, and only in the command invocation that produced it.

## Boundary — what this does not cover
A git worktree is not a process sandbox. The agent runs with your user account.
- Direct writes to this repository and its git state are **detected after the run and never promoted, but they have already happened.**
- **Not detected:** writes outside the repository (including your global git config), writes inside ignored directories, and writes made after the post-run check by a process that left the agent's process tree (through a short-lived intermediate between samples, `setsid`, a service, a scheduler or WMI).
- Real `aider` / `cn` acceptance needs the CLIs and a model API key; the test suites drive a scripted agent through the same runner. The npm `cn.cmd` shim on Windows cannot be started without a shell and is reported unavailable.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.continue.enabled` | `false` | no | Master on/off for the Continue wrapper. |
| `failsafe.integrations.continue.apiKey` | — | yes | Continue API key; overlaid onto the child env as `CONTINUE_API_KEY` only — never argv, never the receipt. |
| `failsafe.integrations.continue.allow` | `[]` | no | The `--allow <tool>` allowlist passed to `cn`; shell/exec → L3 (refused before running), file-write → L2, else L1. The tier is a pre-run signal, not an isolation control. |
| `failsafe.integrations.continue.allowWrites` | `false` | no | Permit an isolated Continue run whose changes can be reviewed for promotion. When false, `cn` is never started. |
| `failsafe.integrations.aider.enabled` | `false` | no | Master on/off for the Aider wrapper. |
| `failsafe.integrations.aider.allowWrites` | `false` | no | Permit an isolated Aider run whose changes can be reviewed for promotion. When false, `aider` is never started. |
| `failsafe.integrations.agentCli.timeoutMs` | `900000` | no | Maximum run time; on expiry the agent's process tree is killed and nothing is promotable. |

`failsafe.integrations.aider.allowDirty` and `failsafe.integrations.aider.autoCommit` were removed in #475: the tree must be clean, and Aider always runs with `--no-auto-commits`.

## Security
The only secret is Continue's API key, overlaid onto the child environment and nowhere else (tests assert argv and receipt carry no key). Spawns are argv-form with `shell: false`. Risk is classified with the live PolicyEngine over every touched path (max with the allowlist tier) and shown in the review dialog; the L3 HTTP approval routes are not used (see #514).

## Command / wiring
- `FailSafe: Run Continue (governed)` (`failsafe.continue.run`) and `FailSafe: Run Aider (governed)` (`failsafe.aider.run`), defined in `src/extension/agent-cli-command.ts`.

## Files
- `agent-cli-core.ts` — binary detection, risk classification, receipts, run outcomes, the argv-form runner.
- `isolated-run.ts` — preconditions, worktree, agent run, checks, capture (LD5).
- `git-safety.ts` — hardened git for every FailSafe git call (LD2).
- `workspace-snapshot.ts` — repository snapshot and comparison (LD3).
- `process-tree.ts` — process-tree tracking and kill (LD4).
- `patch-paths.ts` — change-set validation (LD6).
- `agent-run-promotion.ts` — Apply, checks, post-apply equality, audit copy (LD8).
- `continue-wrapper.ts`, `aider-wrapper.ts` — per-agent argv and pre-run gates.
- tests: `src/test/integrations/agent-cli/{isolated-run,agent-run-promotion,patch-paths,agent-cli}.test.ts`, `src/test/extension/agent-cli-command.test.cjs`

## Verified surface
Continue (issue #104, https://docs.continue.dev/cli/headless-mode):
- `cn -p <prompt>` — headless prompt invocation
- `--allow <tool>` — repeatable per-tool permission flag
- `--version` — used for binary detection
- `CONTINUE_API_KEY` — auth via environment variable (child env only)

Aider (issue #107, https://aider.chat/docs/scripting.html + https://aider.chat/docs/config/options.html, cross-checked against upstream `aider/args.py`):
- `--message` / `-m` — one-shot scripting message
- `--no-auto-commits` — commit behaviour (always passed)
- `--yes-always` — non-interactive confirmation (NOTE: it is `--yes-always`, not `--yes`; no `--yes` flag exists)
- `--version` — used for binary detection

Both wrappers spawn argv-form only (`shell: false`); no shell command string is ever constructed, and the Continue API key never appears in argv or the receipt.
