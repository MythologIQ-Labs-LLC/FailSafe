# Changelog

All notable changes to FailSafe will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- For contributors: the README now links an Architecture Index that names the one canonical document for each design area, and a repository check fails when a new architecture document is added without registering it, pointing to the existing documents to amend instead (#530).
- A new Architecture view under Workspace in the Console finds your repository's architecture index (docs/ARCHITECTURE_INDEX.md by default, or the failsafe.architecture.indexPath setting), validates it, and lists architecture documents that have no registry row, with similarly named documents to use instead. You can open a suggested document, or propose registering a new one for an L3 decision, which is recorded in the FailSafe ledger and edits no file. If there is no index, Bootstrap index (also **FailSafe: Bootstrap Architecture Index**) creates one after you confirm in VS Code and never overwrites an existing file. Documents written by editors, agents or other tools are found when the view refreshes; FailSafe cannot block them (#531).
- For contributors and the owner: each integration now has a contract page (what it does for you, what leaves your machine, which capabilities are real and how they are tested), with an Integration Portfolio of recommended dispositions and the planned issue-to-receipt scenarios; a repository check holds every page to the code (#532).
- A new Delivery view under Workspace in the Console shows, for an intent, what it delivered in five steps: the issue it was imported from, the architecture documents it implements, the commits it was committed under, governance evidence already in the FailSafe ledger, and a receipt. You link a registered architecture document, or HEAD or one of its 50 most recent commits, to the active intent; each link is recorded in the intent's history only after you confirm in VS Code. A linked document that changed since you linked it shows as stale, and one that is gone or no longer registered as missing. Sealed intents are shown read-only. **FailSafe: Assess Delivery of the Active Intent** gives the same assessment. "Recorded" means the evidence is present, not that it passed; nothing is inferred and nothing leaves your machine. Receipts stay unavailable until the ledger repair (#467) (#532).

### Fixed

- Voice Pack install downloads from the current repository (MythologIQ-Labs-LLC/FailSafe) and follows redirects one hop at a time: a hop that is not HTTPS on a GitHub download host (including the host GitHub now uses for release files) is refused before it is requested, a download stops after five redirects, and a response the network layer redirected on its own is refused. The install result and the FailSafe output log record the requested address, the final address without its signed query, and the archive's SHA-256, and error messages never include a signed download link. The checksum is published in the same release as the archive, so it detects a damaged download, not a replaced release. No Voice Pack release has been published yet, so Install still reports that the download was not found (#538).
- Slack and Teams L3-decision notices now show the file path. Paths in all Slack and Teams notices are shown relative to the workspace; a path outside it shows only the file name, control and invisible characters are removed, long paths are shortened, and Slack formatting characters in a path are escaped. No file content, diff, approval conditions or token is sent (#538).
- The extension's repository link (shown on the marketplace listing) names the current repository, MythologIQ-Labs-LLC/FailSafe (#538).
- With the FailSafe pre-commit hook installed in enforce mode, every commit was refused, even with an active intent, because the check looked for the intent in the wrong place. Commits are now allowed when an intent is active (#532).
- Compliance exports now state the FailSafe ledger's integrity as intact, partial seal (naming each weaker property), failed (with the failing rows and reasons) or unavailable (with the reason), instead of a single true/false value that read true for a partially sealed ledger. A ledger that cannot be read still exports, with no entries and the read error (#473).
- For when Agent Marketplace installs return (they remain switched off): an item is reported installed only after its install is recorded in the FailSafe ledger, and an install that cannot be recorded is shown as failed. The record names the scan result, the scanner and its version, and the source repository, ref and commit. A scanner that runs past its time limit is stopped along with everything it started and reported as timed out; one that fails to run is reported as a scanner error; neither counts as a pass, so the item is quarantined. Uninstalls are recorded the same way (#469).

### Security

- Installing from the Console now asks you to confirm in VS Code first, and shows exactly what will run: an MCP Catalog server written to `.mcp.json`, Bicameral MCP (its pip package and setup command), the Qor-logic skills (the hosts, scope and skills you chose), the agent-failsafe adapter and its removal (the pip3 commands), and an Agent Governance command pre-filled in a terminal. Only what the dialog showed is run. A request you do not confirm within 2 minutes, or one whose page has gone, runs nothing; every request asks again. Each confirmed install is recorded in the FailSafe ledger when it is available, and the Console tells you while it waits and why nothing ran (#538).
- The Console refuses these requests, the voice-pack install, the Bicameral connect and auto-connect actions, and the Workspace › Taxonomy save (which a web page could otherwise have emptied), when they come from another web page or are not addressed to this machine. A Console opened through a browser-based remote (Codespaces, vscode.dev, code-server behind https) or through the workspace switcher on another port is refused too; use the FailSafe commands in VS Code there (#538).
- For scripts and other local clients of these Console routes: the six install routes (MCP Catalog install, Bicameral install, Qor-logic skills install, adapter install and uninstall, Agent Governance terminal pre-fill) answer 415 unless the request has `Content-Type: application/json`, the adapter uninstall included; the skills install answers 400 for an unknown host, scope or skill name; and every install now waits for the VS Code dialog for up to 2 minutes before it answers (#538).
- L3 approvals and rejections now record in the FailSafe ledger how they were confirmed: a VS Code dialog for Console decisions, a click in the L3 approval panel, or unverified. The record says that a dialog proves a person clicked in VS Code, not which local program asked (#538).

## [6.0.8] - 2026-10-16

### Added

- Jira and Linear issues open as an unsaved preview and become a governed intent draft only when you approve. You can edit the purpose, and in enforce mode you pick the plan. The draft's history entry records the source, key, URL, fetch and update times, and a content hash. Repeats are reported as already imported, stale, or unknown when no content hash was stored. Nothing is written to the tracker and nothing is synced (#480).
- Importing an exported OpenHands run now saves its events, after you confirm, as historical evidence. Events are deduplicated within their run, signed for this install and folder, and shown under "Imported" in the Agent Timeline and the Console Timeline (the most recent 500 imported events per folder). The transparency log gets one summary line. Exports over 20 MB or 10,000 events are refused (#477).
- Integration catalog cards show the result of each integration's last real call: Verified, Connected, Failing with a reason, or Stale after 7 days, plus the capabilities the adapter claims. Configuration alone shows "Configured · unverified" (#479).
- A conformance suite holds every catalog adapter to the capabilities it claims (#474).

### Changed

- FailSafe Pro is canceled. It is no longer promoted anywhere in the repository: issue templates, the bundled Component Help, the wiki, the integration READMEs, the roadmap and the Development Tracker manifest. Historical records keep their text.
- The Integrations documentation now says what the extension does. 24 documentation references to renamed or removed commands now use the registered titles (for example, **FailSafe: Open Console**).
- FailSafe no longer uses a Python interpreter inside a workspace folder or inside the repository that contains it, such as a workspace .venv chosen in the Python extension, or a failsafe.qorlogic.pythonPath that points into the workspace. To use a specific interpreter, set failsafe.qorlogic.pythonPath in your user settings to an interpreter outside the workspace. The setting is now read only from user settings.
- If you turned on Bicameral auto-connect with the Console toggle before this release, it was saved in the workspace settings and is now ignored. Turn it on again; the toggle now writes your user settings.
- The unused failsafe.integrations.bicameral.pipCommand setting is removed.
- On Windows, an Open Design launch command that is not an .exe is refused.
- The ACP proxy no longer accepts a relative agent path such as ./agent. Give the agent's name or an absolute path.
- SARIF import warns when findings could not be written to the Risk Register, and the MCP-policy audit warning gives the reason.

### Fixed

- A security scanner result that failed, timed out, produced no results, or gave no verdict for an entry no longer counts as a pass. It is an inconclusive result that needs review (#469).
- An Agent Marketplace install whose security scan did not pass is quarantined and is never reported as installed or recorded as a successful install (#469).
- FailSafe never runs an Agent Marketplace item's package setup (pip or npm) on your machine. A request for setup is refused before anything is cloned or removed; installs stay disabled (#468).
- The Agent Marketplace no longer starts promptfoo through npx, which downloaded and ran promptfoo from the npm registry when it was missing, and no longer runs a scanner from an item's folder (#468).
- gh, PowerShell, Python, py, pip, the Git installers (winget, choco, brew, apt-get, dnf, yum, pacman), Bicameral MCP, its installer's pip and the ACP proxy's agent are started from validated absolute paths, so a program with the same name planted in the workspace, its repository or the current folder never runs. The MCP connection refuses any command that is not an absolute, existing executable (.exe on Windows), so a planted .cmd is never run through cmd.exe.
- Python started by FailSafe (python -m and python -c) no longer imports modules from the workspace or the current folder. A Microsoft Store Python can be used, and on macOS and Linux a Python virtual environment runs as itself instead of as its base interpreter.
- failsafe.bootstrap.autoInstallGit and the Bicameral command, extra command roots and auto-connect settings are read only from user settings, so a workspace can no longer turn on a system-wide Git install or choose what FailSafe launches.
- A SHIELD history read that times out now stops git and the processes it started.
- The Console startup checkpoint records status `proposed`, not `validated`: a bound listener is transport readiness and no policy was evaluated. Its verdict stays UNKNOWN, and it now names the host and port the server actually bound (#471).
- Two FailSafe processes on one workspace could both accept the same replay nonce, and each process could erase nonces the other issued. The nonce store is now one shared file updated under a cross-process lock. A nonce is accepted only by the process that first records it as used, so even two processes that both believe they hold the lock cannot both accept it. Writes are fsynced, the lock is re-checked before every rename, and a process that stalls past its lock writes nothing (#472).
- A brief read error on the nonce store (a scan or another program holding the file) no longer turns off governance checks until reload. Only that call is refused. A read-only `.failsafe/security` folder is reported as such.
- The replay-nonce store refuses a `.failsafe` or `.failsafe/security` folder that is a link or resolves outside the workspace, before it creates or writes any file there, as the risk register already does. A repository can no longer send the nonce store, its lock and queue files or its markers to another folder.
- A risk update from another window no longer waits out a whole SARIF, Sentry or MCP-policy import. Updates to the risk register queue in arrival order (best effort: a waiter that has waited long enough, or whose queue entry cannot be written, tries the lock unqueued), and imports write 500 findings per update instead of one (#528).
- Publishing a release no longer stops with "expected one release … found 0" when GitHub is slow to list a new draft, and it never publishes a release this run did not create. The draft is created through the API, checked, waited for (up to 30 s), and published by its id; the tag's releases are listed again before each upload.
- OpenHands import (#477): the export is read through one non-blocking read into a buffer sized from the file, so directories, FIFOs, files over 20 MB and files that change while they are read are refused. The evidence file and the transparency log are refused when they are links, not regular files, or hard-linked, and both are checked on the open file and written through it. Duplicate keys are built from an encoded tuple, so run or event ids that contain separators cannot collide. Multi-byte text across read chunks is no longer corrupted, and imported events keep three severity tiers.
- Jira and Linear requests go only to https, keep a configured port, and cut off responses over 5 MB. A Jira response whose key is not a Jira key is rejected. A sealed active intent no longer blocks importing an issue (#480).
- Integration evidence is wired right after Sentinel and can no longer stop activation. If it is unavailable, the OpenHands and Jira/Linear commands say so and save nothing. Tracker drafts follow the enforcement engine's governance mode.
- The v6.0.7 release notes said FailSafe publishes commit-bound SHIELD checks. It can verify a seal, but no command publishes one yet; the check name is reserved for a verified receipt.

### Security

- On macOS and Linux, FailSafe no longer runs an executable whose file or folders other users can write to, or that another user owns.

### Known limitations

- Agent Marketplace install, update and scan stay disabled. The scanners run from an empty folder and do not read an item's files, so every scanned install is quarantined until a repository scanner exists.
- tar (voice-pack install) and ps (the macOS/Linux process sampler) are still started by name.
- Bicameral team-mode setup is typed into your own terminal, which resolves bicameral-mcp itself.
- The Bicameral setup step and the MCP server run with the workspace as their working folder, so Windows can still load a DLL from the workspace that is not found next to the program or in the system folders.
- A workspace-folder change drops a connected Bicameral session until you connect again.
- FailSafe now starts bicameral-mcp only from a resolved absolute path outside the workspace. If bicameral-mcp cannot be found when FailSafe wires its client (at startup, or after a Bicameral setting or a workspace folder changes), there is no Bicameral client until the next rewire. The Console's Install button rewires automatically after a successful install. If you install bicameral-mcp another way, for example from a terminal, reload the window or change a Bicameral setting before you connect.
- If the window closes or reloads while Bicameral auto-connect is still connecting, that one bicameral-mcp session can keep running after FailSafe stops (B235, pre-existing).
- Repository bounds are found by folder names as written, so a workspace opened through a junction misses repositories above the junction's target.
- A risk-register update can still be lost if two FailSafe processes recover a crashed process's lock at the same moment: both can come to hold the lock, and the later write can replace the earlier one. The register is never left corrupt, but one of the two updates may be missing; repeat it (#528).
- The timelines show the most recent 500 imported OpenHands events per folder, read from at most the last 1 MiB of the evidence file, while one import can save up to 10,000. Older imported events stay in the evidence file but are not shown.
- The Substrate command does not read `failsafe.qorlogic.pythonPath` (B223), so there the user-level setting does not choose the interpreter.
- A git process that has already exited while a process it started still holds its output is not killed when a SHIELD history read times out.
- A `.failsafe` or `.failsafe/security` folder that is a link, or that resolves outside the workspace, turns replay-nonce protection off: governance checks that need a nonce are refused until it is replaced with a real folder and the window is reloaded. The lock folder and queue ticket are created a moment before that check, so a link swapped in at that instant can receive an empty lock folder or a ticket file, never nonce data.
- If FailSafe loses its nonce-store lock in the moment after it marked a nonce as used, that nonce is refused for good. The request fails safely; send it again with a new nonce.
- When a v6.0.7 window and a v6.0.8 window are open on the same workspace, the v6.0.7 window still updates the nonce store without the lock. Update every window.
- If .failsafe/security is read-only, each governance check that needs a nonce waits up to 3 s and then refuses.
- A .failsafe folder that is a link still makes risk updates refuse (UNSAFE_PATH) while the ledger follows the link.
- Release uploads still go by tag. A release created for the same tag at the moment of an upload could receive that file, but it is never published by this run. An existing draft for the tag is resumed and published only once its files match the verified set.
- OpenHands: the run identity comes only from the export's conversation_id, conversationId, session_id or id fields, and the export layout has not been confirmed against a live export. Exports with integer ids, no ids or no run identity fall back to keys by file and position, so a different file of the same run imports again. A crafted export that declares a real run's identity and event ids can still pre-claim those keys. Evidence signed under a lost Secret Storage key, or in a moved folder, shows as unverified until it is re-imported. The signing binds evidence to this install; it does not protect against its own user.
- Provider behaviour for Jira, Linear, Sentry and OpenHands is tested with recorded responses only.
- Unverified: reading user-level settings in a Remote window, and the garak, promptfoo and pwsh probe formats.
- The macOS and Linux ownership check allows group-writable files and folders, and does not read POSIX ACLs (including macOS chmod +a). On Windows, folder ACLs are not checked.
- On macOS and Linux, programs under a folder every user can write are refused, such as the tool cache on GitHub-hosted runners (/opt/hostedtoolcache) and WSL drvfs paths (/mnt/c), which appear writable by everyone. So is a Homebrew or Linuxbrew installed by another account. FailSafe running as root in a container refuses files other users own, and a user-namespace sandbox such as Flatpak can show files as owned by another user and refuse them.
- Folders a link passes through on the way to a program are not checked when it starts; its real folders are, and for Python and pip also the folder they are started from.

## [6.0.7] - 2026-10-15

### Fixed
- Native SQLite storage (ledger, Shadow Genome, trust, Sentinel RAG) ran in stub mode on Windows and macOS because the universal VSIX carried a Linux-only `better-sqlite3` binary, and the 12.x binary was tied to one VS Code/Electron version. FailSafe now uses `better-sqlite3` 13 (N-API) and ships one platform-targeted package per OS and architecture, each carrying only its own verified binary (#502).
- On Windows checkouts, where Git stores `docs/META_LEDGER.md` with CRLF line endings, the SHIELD phase read IDLE and no verdicts appeared. The ledger parser now reads LF, CRLF and CR identically without changing the file (#508).
- Deleting a risk, updating one, or an auto-derived risk no longer rewrites `risks.json` from a stale in-memory copy, which erased imported Sentry/SARIF risks and Console edits made since activation. An unreadable `risks.json` is never overwritten; the risk view reports the refusal (#517).
- A persistence failure in the replay-nonce cleanup timer no longer escapes as an uncaught exception in the extension host; the guard stays fail-closed, names its store file and the recovery step, and retries a rename that Windows antivirus briefly blocks (#472).
- `/api/v1/trust` reports `unverified` instead of a 100% score when checkpoints carry no verified PASS evidence (#470).
- Open Design 0.24.1: the daemon probe reported a healthy daemon as unreachable (`parse_error`) because 0.24.1 nests its version. FailSafe now reads both shapes (#481).
- Open Design MCP no longer launches a bare `od mcp`, which fails on Windows desktop installs. The register command fetches the daemon's own launch command, shows it with its environment for your approval, and only then starts the server (#481).
- Opening a folder no longer runs `git init` on its own. FailSafe asks first, and `failsafe.bootstrap.autoInstallGit` now defaults to off (#503).
- Saving your user settings or a file outside the workspace no longer raises a governance denial; editor-save governance covers workspace files only (#504).
- The Sentry import uses Sentry's organization issues endpoint and reports exactly what it did: created, updated, unchanged, failed, skipped and duplicate counts, at a warning level when anything failed and an error when every write failed. It waits on Sentry's rate-limit headers, retries transient failures at most three times, and imports nothing when the list fails or you cancel. A risk you closed keeps your status, and fields Sentry does not own keep your edits; the title and severity follow Sentry on each re-import (#478).
- Imported Sentry risks carry each issue's first and last release, read from the issue detail. At most `failsafe.integrations.sentry.maxReleaseLookups` issues per import (default 50) are looked up, most recently seen first. The `failsafe.integrations.sentry.query` setting now exists and works. FailSafe makes no commit correlation (#478).
- The Operations panel's Approve All button never worked (it called an undefined client). It now posts the batch decision like the Governance view.
- The L3 Approval Queue panel's Approve, Reject and View File buttons did nothing: the panel's own Content-Security-Policy blocked their inline handlers. They now work.
- A `risks.json` write that is interrupted part-way (a crash, a full disk) no longer leaves a truncated file that every later read treats as corrupt. Writes go to a temporary file that replaces `risks.json` only when complete (#517).
- Two VS Code windows, or two FailSafe processes, on the same folder no longer lose each other's risk changes. One shared risk store owns every read-modify-write of `.failsafe/risks/risks.json`: it takes a cross-process lock, compares the file's bytes before each write and writes atomically. Links outside the workspace are refused, a corrupt file is refused with one saved copy (it is no longer moved aside before the write goes ahead), reads of an unreadable file report it as unreadable instead of throwing, and SARIF and MCP-policy re-imports keep the triage status you set (#517).

### Changed
- Minimum VS Code is now 1.101.0. The native SQLite module needs the Node 22 runtime VS Code ships from 1.101; on older versions it would crash the extension host (#502).
- FailSafe is published as eight platform-specific packages: Windows x64 and arm64, Linux x64 and arm64, Alpine Linux x64 and arm64, and macOS x64 and arm64. The marketplaces install the one for your machine. There is no package for 32-bit ARM Linux or for VS Code for the Web (#502).
- Editor-save governance reports a denial as observed, not prevented. VS Code does not let an extension cancel a save, so a denied save may still be written; messages, logs and the enforce-mode description no longer say the save was blocked (#505).
- The GitHub Release now carries the eight platform packages and `SHA256SUMS.txt`, the same files the marketplaces received. The release is created as a draft, gets only the files it is missing (never a replacement), and is published only once both marketplaces serve exactly those bytes and all nine files match. A re-run never builds a second set once anything for the version has been published, and every publish job checks that the tag still points at the commit it built. `scripts/verify-release-provenance.cjs` checks a finished release against its manifest; `docs/RELEASE_RECOVERY.md` describes how to finish an interrupted one.
- `tools/release-verification` (`rv`) verifies a release from its artifacts. `inventory` holds the eight VSIXs to a strict approved checksum set; `marketplace` downloads and hashes each target from both marketplaces; `lifecycle` installs, upgrades, force-kills, restarts and rolls back FailSafe in a disposable VS Code (win32-x64) and checks the SQLite checkpoints and degraded-mode detection; `report` requires a fixed set of checks for each mode, and a pre-release rehearsal can never be reported as a marketplace verification. See `tools/release-verification/README.md`.

### Security
- Recording an L3 decision, ratifying a Bicameral decision, rolling back to a checkpoint, stopping the Sentinel (panic stop) or turning off the agent hooks from the Console now requires you to approve a VS Code dialog. Before, any local process could make these calls over the loopback Console API. The dialog shows the queued item's details and every value that will be recorded under your name; the Console shows "Confirm this in the VS Code dialog" while it waits (#514).
- Continue and Aider run in a disposable git worktree. Their changes are held for review and reach your workspace only when you choose Apply; Escape or closing the dialog discards them. Before writing, FailSafe re-checks HEAD, the tree and the exact reviewed bytes. Descendant processes are tracked (Linux: per-run marker, parent and process group; macOS: parent and process group; Windows: parent chain) and killed before the result is snapshotted. Agent executables resolve only to absolute PATH entries outside the workspace (#475).
- Removed `failsafe.integrations.aider.allowDirty` and `failsafe.integrations.aider.autoCommit`: the tree must be clean and Aider always runs with `--no-auto-commits`. Added `failsafe.integrations.agentCli.timeoutMs` (default 15 minutes). A Continue allowlist with shell or exec tools is refused (#475).
- Open Design `create_artifact` is refused before it reaches the daemon on every route; the client can no longer mint its own approval (#481).
- The Agent Marketplace re-scan route is disabled along with install and update. Scanners ran with the untrusted install as their working directory (#468).
- Integration credentials (Sentry, Jira, Linear and GitHub tokens, the Continue API key, Slack and Teams webhook URLs) are kept in VS Code Secure Storage and are no longer read from settings. Store one with **FailSafe: Set Integration Credential** (User, or Workspace for this workspace only); remove one with **FailSafe: Clear Integration Credential**. If FailSafe finds a credential in plain-text settings it offers **Move to Secure Storage**: each value is stored and read back before anything is removed, a different value already in Secure Storage is never replaced without asking, and the plain-text copies are removed only with your consent. Until a credential is moved, its integration is not called and says why. A User-level token is never sent to a GitHub, Sentry or Jira endpoint that workspace settings chose (#482).
- SOA ledger rows are now sealed (v3) over every column, including the row id. Older v1 and v2 rows keep their original signatures and are verified under their own version; a one-time activation receipt freezes them, so later edits are detected. The ledger head is anchored in Secure Storage by genesis and each workspace is bound to its ledger, so truncation, rollback, wiping, file substitution and repointing `failsafe.qorelogic.ledgerPath` are detected and stay detected after further appends. A rotation's first row is trusted only after every row verifies, so a forged rotation can no longer rebind a workspace. The release gate says "intact" only for a fully sealed, anchored, workspace-bound ledger and warns PARTIAL SEAL otherwise (#473).
- SHIELD GitHub check runs are bound to the exact commit. A verifier reads `docs/META_LEDGER.md` at the commit and at its parent through hardened Git, requires the commit to introduce the receipt's seal and its history never to have held it before (a seal removed and later re-added is rejected), and mints an HMAC receipt. Only a receipted verdict can be published under the SHIELD check name; any other check name must be on a closed allowlist and is sent as a checked copy (#476).
- FailSafe runs Git only from a validated absolute path. Before, on Windows a `git.exe` placed in the opened folder could run instead of Git, because Windows searches the current folder first; two checkpoint features also ran Git through a command shell, and one of them inserted a value read from the workspace's checkpoint file into that command. One shared resolver now picks Git from the VS Code Git extension's path, absolute PATH entries or the standard install locations, refuses anything inside a workspace folder or the folder a command runs in, refuses `.cmd`/`.bat` shims, and confirms it is Git before use. Every Git call uses it with an argument list and no shell.
- `fast-uri` 3.1.8 (GHSA-hrr3-gc8f-f4qj, host case normalization).

### Known limitations
- Isolated agent runs detect, and never apply, writes made through the repository; they do not prevent them. A worktree is not a process sandbox: writes outside the repository are not detected, and a process that escapes tracking can write after the final checks. Tracking is escaped on Linux by a descendant that clears its environment, leaves the agent's process group and whose parent exits within 250 ms; on macOS by one that leaves the process group and whose parent exits between samples (#475).
- On Windows, Continue's npm shim `cn.cmd` cannot be run without a shell, so FailSafe reports Continue as unavailable there (#475).
- The VS Code confirmation proves you clicked the dialog; it does not identify which local process asked. Not covered: Bicameral MCP tool routes (ingest, update, reset, resolveCompliance, linkCommit), which stay policy-checked; `PUT /api/v1/risks` status changes; the adapter uninstall/config routes. Open Design dialogs show the item's kind and path but not its arguments (#514).
- Risk register writes are not queued fairly. Each risk update takes an exclusive lock on `.failsafe/risks/risks.json` for a few milliseconds, and an import makes one update per finding (SARIF, Sentry, MCP policy). While one FailSafe process is importing, risk updates from another window or process wait for the lock, and the importing process usually wins it back between its own updates. An update that waits longer than 6 seconds fails with "The risk register is being updated by another FailSafe process, or its lock is briefly unavailable … Try again", and nothing is written. Nothing already stored is lost. An import of about 1,000 findings (about 5 seconds of back-to-back updates on Windows) is enough to make a concurrent Console edit, MCP `create_risk` call or Risk Register view action in another window fail this way. Retry after the import finishes. The same wait, of up to about 6 seconds, occurs behind a process that crashed or stalled while holding the lock. Fair queuing and batched imports are planned follow-ups (#517).
- Secure Storage is per machine and only as strong as the OS keychain VS Code uses; on Linux without a keyring VS Code falls back to a weaker store. A credential that was ever committed to Git or synced in a settings file must be rotated at the provider; moving it does not un-share it. Removing a User setting also removes it on other machines that use Settings Sync, where the credential must then be set again. A Workspace credential set in an untitled multi-root workspace must be set again after the workspace is saved. Where Continue sends its key is decided by Continue's own configuration (#482).
- Agent Marketplace install, update and scan stay disabled until isolated setup and fail-closed scanning land (#468, #469).
- SOA ledger: the key is symmetric, so a seal is local evidence only. The integrity of v1/v2 rows before activation is reported INCONCLUSIVE. A workspace folder that was never bound, including one ordered first by a `.code-workspace` file, binds whatever ledger it finds. If the first anchor write fails, that ledger may be reported as established late or, if its rows are also emptied before the next successful start, as a fresh ledger. Rows written since the last anchor write that landed can be removed undetected (#473).
- Rolling back to v6.0.6 after running v6.0.7 makes v6.0.6's ledger chain check report the ledger broken from then on: every row v6.0.7 writes is sealed v3, starting with the activation receipt, and v6.0.6 reads any signature other than v2 as v1. No data is lost, and upgrading again verifies the ledger (#473).
- A `.failsafe` folder that is a link to another location now makes risk updates refuse ("unsafe path") until the link is replaced by a real folder; the ledger still follows the link (#517).
- If the keychain does not answer within 2 seconds, or refuses, when FailSafe starts, the SOA ledger runs in stub mode for that session (no ledger records, a warning in the log) instead of stopping the extension; reload the window once the keychain is available (#473).
- SHIELD checks: a seal replayed onto a history that never held the original still verifies. A seal that is reverted and then re-applied is rejected and needs a fresh seal. Shallow clones, partial clones and Git older than 2.44 give a Neutral result (#476).
- Git still runs inside the workspace and reads its repository config, so config-defined helpers (`core.fsmonitor`, hooks, credential helpers, filter drivers) still run in a trusted workspace. Other tools (`gh`, PowerShell, npm, Python) are still started by name. If the only Git installed is inside the opened folder (for example, your home folder opened with a per-user Git), Git is reported unavailable. A Git whose `--version` check takes over 5 seconds is skipped for 60 seconds.
- The Console startup checkpoint still records `status: "validated"` while its policy verdict is `UNKNOWN` (cosmetic; readiness itself is fixed since v6.0.6) (#471).
- Not verified against live services: Sentry, Jira, Linear, OpenHands, Aider and Continue were tested against recorded responses and fixtures only. OpenHands import (#477) and Jira/Linear import (#480) are unchanged from v6.0.6.
- CI tests against VS Code 1.122.1. The 1.101.0 minimum was measured once during development; only the Windows x64 binary was loaded inside a VS Code Electron for this release, the other targets inside Node 22.

## [6.0.6] - 2026-10-13

### Fixed
- Console startup readiness and Mind Map keyboard behavior.
- Sentry import pagination and accurate persisted-versus-failed counts.
- Integration catalog distinguishes configured from runtime-verified state.
- GitHub Checks manual advisory is neutral; unaudited SHIELD PASS publication is blocked.
- Continue and Aider refuse unauthorized write execution; Aider auto-commit is disabled before governed review.
- New SOA ledger records authenticate complete audit fields with versioned signatures; legacy signatures remain verifiable under their original weaker contract.

### Security / Temporary limitations
- Marketplace installation and updates are disabled pending genuine sandbox isolation and scanner fail-closed remediation (#468/#469). Browsing the catalog remains available.
- Authorized external agent CLI runs are not yet isolated against writes before diff review; do not treat the interim preflight gate as full enforcement.

## [6.0.5] - 2026-09-04

### Added
- **Accessibility:** Shadow Genome failure nodes now carry their severity in the accessible name, so a screen-reader user hears *why* a node matters rather than only that it failed (#242, FX935).
- **Audit Log records which engine verified an entry.** Ledger entries gain per-engine verification provenance, distinguishing an existence claim from a content heuristic (#367 tranche 3b, FX934).
- Five governance suites that assert what previously nothing checked: `.qorlogic/config.json` layout declaration (FX940), `.gitignore` anchoring with inverse coverage (FX936), `SYSTEM_STATE` Tier 1 currency (FX938), `GOVERNANCE_INDEX` publication status (FX939), and FEATURE_INDEX id integrity with collide/clean fixtures (FX941).
- `.qorlogic/config.json` — declares `attribution.model_coauthor` and the `layout.skills_root` / `agents_root` this repository actually uses. Its absence had been hard-aborting `seal_artifacts` and `seal_trailer_check`, which meant no seal could complete at all.
- `docs/GOVERNANCE_INDEX.md` gains a `## Publication status` section distinguishing *private by design* from *missing*.

### Fixed
- **The Bicameral upstream row no longer reports "0 open issues" when the poll failed.** An unreachable upstream and a genuinely empty upstream looked identical; they no longer do (#441).
- **TTS timeout-path latency assertion is deterministic and falsifying.** It read the real wall clock against a 20 ms bound and asserted `ms >= 20`, so it flaked in CI and could not distinguish a real measurement from the bound echoed back.
- **`plan-grep-lint` recognises regex-shaped grep patterns** instead of literal-matching them. A NEW-VERIFIED plan row citing any regex grep previously passed by non-recognition (#439).
- `.gitignore` rule for `FailSafe/extension/test-results/` was anchored to a path that does not exist, so it never fired.
- `docs/SYSTEM_STATE.md` claimed `Current Release: v5.9.0` while the repository shipped v6.0.4 — five releases of Tier 1 drift, its header restamped as recently as 2026-08-20 over a body that stopped in May.
- `confidentiality.md` was registered as a root Tier 2 governance artifact while existing nowhere in the repository; relocated to the out-of-tier section, contents not imported.
- `FX935` was allocated twice by cycles with divergent views of the feature index; renumbered per the older claim.
- Absolute workspace paths removed from the shipped `FailSafe/README.md`.

### Security
- Dependency bumps: `qs` 6.15.3 → 6.16.0, `fast-uri` 3.1.5 → 3.1.7.

### Removed
- A stale 2.66 MB v4.3.1 VSIX that had been tracked in the source tree, and four dead `.gitignore` rules already covered elsewhere.

### Governance
- Ledger entries #601-#605, including the FX932 pre-merge ledger fork guard seal that had been carried unreleased since v6.0.4.
- Four issues filed upstream against Qor-logic (#425-#428): a fork guard with a one-entry detection window, a governance-index marker clobber reproduced four times, provenance recording an unrelated package's version, and hash extraction matching a digest quoted in entry prose.

## [6.0.4] - 2026-08-23

### Fixed
- **"Install / Refresh Skills" now upgrades a stale qor-logic install.** The card promised to bring the install up to the required version floor, but `ensurePackageInstalled()`/`ensureInstalled()` gated on `isInstalled()`, which only checks package-name presence. A present-but-below-floor install was treated as satisfied, and the subsequent `qor.cli install` ran against the outdated CLI while reporting success. Both call sites now gate on `verifyInstalledVersion().meetsFloor`, which existed and was correct but was never consulted on that path. (#430)
- **The pre-commit guard's workspace snapshot reads the ledger once.** `WorkspaceArtifactBuilder.build()` read and parsed `META_LEDGER.md` five times per build - measured at 8.7MB and 477ms cold - on the `CommitCheckRoute` path that blocks a commit. Two of those reads were redundant calls to the consumer adapter itself. (#233)
- **Development Tracker phase chips carry an accessible name.** Chip status was conveyed by colour alone and was not announced. (#242 Tranche E)

### Added
- **Audit Log verdicts commit to the content they judged.** A Sentinel WARN/BLOCK/ESCALATE record now carries `artifactHash`, computed from the content the verdict was actually evaluated against rather than re-read from disk, so a later resolution can prove it refers to the same bytes. (#367 tranche 3a, FX933)
- **A pre-merge guard against governance-ledger forks.** CI now fails when a branch would introduce a duplicate `### Entry #N:` number, or a duplicate `**Previous Hash**` without a covering attestation, beyond an enumerated historical baseline. Detection has to happen before merge: the reconciliation mechanism is keyed on entry number, so it cannot disambiguate two entries that share one. (FX932)
- **Real Piper synthesis latency is sampled, including the timeout path**, so `TTS_TIMEOUT_MS` can be set against measured behaviour rather than a guess. (#406)
- **An operator probe for the Agents Window worktree commit-hook row.** (#326 Phase D)

### Changed
- The plan citation-parity gate now actually executes in CI, and the four defects it found on first run are fixed.

## [6.0.3] - 2026-08-22

### Fixed
- **The enforce-default upgrade notice now actually appears.** v6.0.0 flipped the governance-mode default from Observe to Enforce and shipped a one-time notice to warn existing installs whose behavior silently changed. That notice could never fire: `EnforcementEngine` inferred "defaulted" from `getConfig()`, which always resolves `governance.mode` to a concrete string because `package.json` declares a schema default — VS Code's `WorkspaceConfiguration.get()` cannot tell "the user chose enforce" from "enforce is the default." Only `.inspect()` can, which `FirstRunModePicker` already used. Every install that predated 6.0.0 and never explicitly set a mode moved from Observe to Enforce with no notification. (#412, FX929)
- **Voice synthesis can no longer hang the Mind Map indefinitely.** `TtsEngine.speak()`'s `predict()` call is bounded by a timeout with a cancel-safe generation token, so a stalled Piper synthesis surfaces as an error instead of leaving the voice controls wedged. (#395)
- **Watcher handles are released when their owners are.** `planManager` and `trustEngine` were disposed by a component that did not own them; disposal now happens in their bootstrap owner, so teardown releases them correctly. (#388)
- **The Development Tracker no longer stalls on large repositories.** Its PR-cadence read ran an unbounded, synchronous `git log` on every dashboard load — measured at 1.07s and 8.9MB output on a 150k-commit repository, past the 8MB buffer, where it threw and was silently swallowed. The read is now bounded to the most recent commits, and when the window truncates, the dashboard says so instead of degrading invisibly. (#393)
- **The ACP registry is checked for drift at activation.** `~/.windsurf/acp/registry.json` is unsigned and user-writable, so an external rewrite could quietly point FailSafe's entry back at the raw agent while Devin still displayed the governed name — a full proxy bypass with no signal. Activation now distinguishes intact, tampered, missing, and malformed registries, and warns when an otherwise-intact entry was installed for a different workspace. Detection failure can never block activation. (#398, FX928)
- **A single corrupted archived intent no longer aborts activation-time migration.** `migrateIntentSchemaV2()` runs on every activation; one unreadable archived record used to abort the whole sweep, leaving everything after it unmigrated. The bad record is now isolated and the migration completes. (#420)
- **A forward-written Shadow Genome database now says so.** If the genome store was written by a newer FailSafe than the one running, the integrity sweep ran first and failed - a newer release’s migrations are legitimately absent locally - so the honest "please upgrade" case was masked by a checksum error and the extension fell into silent stub mode. The version check now runs first and reports the real condition. (#414)

### Added
- **Mind Map shows how dense the current graph is.** An always-visible `N nodes · N edges` status reports the live graph size, and discloses merged duplicate edges when any occurred. Disclosure only — no cap or threshold is imposed. (#391)
- **Audit Log records carry an explicit resolution link.** A WARN/BLOCK/ESCALATE entry now records the exact ledger row a later L3 decision resolves, by id rather than by inferring from path and timestamp. Deliberately scoped: no content-based supersession, and an escalation that expired without a decision is reported as undecided rather than as awaiting review, because the ledger cannot evidence the difference. (#367, FX927)
- **The Audit Log shows whether a warning was ever resolved.** The Governance panel now reads the durable ledger and renders each WARN/BLOCK/ESCALATE record’s resolution state - live, escalated-undecided, approved, or rejected - for the 50 most recent entries. A ledger that is unavailable degrades to an empty list rather than throwing or omitting the field. (#367 tranche 2)

### Changed
- **Governance artifact reads go through one versioned boundary.** The remaining `docs/META_LEDGER.md` consumers — the Tracker's governance projection, the substantiate seal watcher, and the governance sidecar — now read through classified adapter envelopes instead of raw text. A ledger that exists but cannot be parsed is reported as malformed rather than silently producing an empty-but-plausible result. (#233, FX892)

### Internal
- **22 test suites containing 223 cases were executing in zero CI gates.** They are now run, and a coverage guard fails the build when any test file matches no runner, so this cannot recur silently. Running them immediately exposed five real defects, including a governance doc whose coverage header had drifted by roughly 250 entries and two "verified" claims citing test files that no longer resolved. (#404)
- **The end-to-end coverage gate no longer fails the build on a transient subprocess error.** A failed `git` invocation and a genuinely missing ref were indistinguishable, so momentary resource pressure under parallel CI presented as a coverage BLOCK. The two are now told apart by whether the process actually completed; transient failures retry once and then report as an infrastructure condition, while a genuinely unresolvable ref still fails closed. (#410)

## [6.0.2] - 2026-08-21

### Fixed
- **Watcher handles are released on teardown.** `TrustEngine`, `HubSnapshotService`, and `PlanManager` each owned a filesystem-watch subscription and each defined a disposer, but nothing ever called them — every teardown short of a full extension-host restart leaked all three. They are now disposed with their owners. (#385)
- **The PR-linkage check now says what it means.** Closing a pull-request number is flagged as exactly that (closing keywords only act on issues) instead of the false "does not exist"; on repos past the fetch window, unverifiable references warn instead of failing; and the nonexistent-issue message explains the three possible causes. (#374, FX926)
- **Corrupt adapter and marketplace files are preserved, not destroyed.** The #368 protection is now a shared guard: a corrupt `adapter/config.json` or marketplace `state.json` is set aside as a `.corrupt-<ts>.bak` before any save overwrites it, instead of being silently replaced with defaults. (#378, FX925)
- **Adding a risk from the Console no longer swallows the backlog.** The risk CRUD API read the display view (which projects docs/BACKLOG.md when the register is empty) and wrote it back - one POST durably promoted the entire backlog projection as if it were operator-authored records. Mutations now read the durable store only, and backlog-derived rows show a read-only note instead of Edit/Delete buttons that could never work. (#377, FX924)
- **A corrupt risk register can no longer be silently destroyed.** If `risks.json` exists but is unreadable, any write (imports, closes, Console edits) first preserves the original as `risks.json.corrupt-<ts>.bak` and logs the path - previously the first mutation overwrote the evidence. Reads still degrade gracefully. (#368, FX923)
- **The Audit Log CSV export is now a real CSV.** Fields are RFC-4180-quoted (commas, quotes, and multi-line details survive), spreadsheet formula injection is neutralized, and the columns are the ones you triage by - Decision, Risk, File, Summary, Patterns - with the raw payload kept as a final quoted column. The export honors the active category/severity/date filters (export what you see), and live records now name their file. (#370, FX922)
- **Audit Log records now tell you what, where, and why.** A sentinel verdict record used to render as bare identity JSON (decision, grade, timestamp); the producer discarded the triggering file, the human summary, and the matched patterns. Records now read like `Sentinel WARN L1 - src/auth/session.ts (1 issue(s) detected - review recommended · hardcoded-credential)`, in both the stored log and the live stream. (FX921)
- **The Audit Log can be triaged by severity.** A second chip row - All levels · Issues · Warn · Block - isolates the records that need attention; passing records stay available but out of the way. Deep-linked records always render regardless of the active filter. (FX921)
- **Monitor modals now draw their overlay chrome in the sidebar.** The shared modal wrapper was styled only in the Console stylesheet, so sidebar Monitor modals rendered in-flow with no dimmed overlay or card frame; the wrapper styles now live in the Monitor's own stylesheet (real-browser computed-style proof in CI). (#242 slice 2 follow-up)
- **Deep-link selector escaping is complete at every site.** The backslash-aware attribute-selector escaping from the CodeQL remediation is now a single shared helper used by the Console section/verdict deep links and the Monitor alert focus re-anchor, closing the two remaining quote-only fallbacks. (#360)
- **Every Monitor modal is keyboard-reachable.** The five workspace-health metric cards and governance-alert rows are focusable with visible focus rings and screen-reader names; Enter opens the explanation/details modal, and Escape returns focus to where you were — even when a live hub refresh rebuilt the alert list while the modal was open. Filtering the Console audit stream no longer throws keyboard focus away on chip selection. (#242 slice 2, FX920)
- **Wake-word settings changes reach the Mind Map again after tab switches.** The wake-word bridge re-registers on every rebuild instead of dying permanently after one round trip away from the Mind Map tab. (#346, FX918)
- **Credential redaction covers passwords containing `@`.** The governed-commit redactor now strips to the last `@` of the userinfo, so no password tail can survive in results or warnings. (#349)
- **The governance webhook's outbound contract is provably wired and bounded.** What's transmitted is byte-identical to the signed builder output; oversized payloads fail closed per-target before signing without disturbing sibling deliveries. (#350, FX919)

### Added
- **The Monitor's governance affordances work without a mouse.** The warning banner, critical-blockers graphic, and error-budget gauge are keyboard-focusable with visible focus rings and screen-reader names; Enter/Space activate exactly like click, and following the deep link lands keyboard/AT users focused on the triggering verdict record in the Console Audit Log — held across the Console's boot-time re-renders, never stolen from focus the user holds elsewhere. (#242 slice, FX917)
- **Release preflight now catches missing release notes locally.** The `[RELEASE]` commit hook fails when the extension README lacks the version's What's New section — the gap that previously surfaced only at CI. (FX917)

## [6.0.1] - 2026-08-20

### Fixed
- **The Monitor's warning banner is now a working link.** Clicking "N issue(s) detected" in the sidebar Monitor opens the Console's governance Audit Log focused on the triggering verdict — from the embedded sidebar (via a webview-safe relay; `window.open` is sandboxed there and used to silently no-op) and from a browser-served Monitor alike. Verdict events now carry their own timestamp through the checkpoint and transparency logs so the deep link lands on the exact record, and verdict deep links bypass the Audit Log's default same-day date filter. The blockers and error-budget click-throughs use the same relay. (FX916)

## [6.0.0] - 2026-08-20

### Added
- **The Mind Map has an accessible alternative.** The graph carries an accessible name, and a LIST VIEW toggle renders real captioned node/edge tables (with connection counts) from live graph state — the same pattern as the Shadow Genome table view. (#325, FX912)
- **`FailSafe: Configure VS Code Agents Window Governance`.** A guided, idempotent command covering the Agents-window user-setting opt-in, worktree commit-hook governance, and governed `.mcp.json` integration installs — with docs that state the in-process-MCP constraint honestly instead of scaffolding a ghost config (standalone bridge filed as B209). (#83 B+C, FX909)

### Changed
- **Console routes consume the Qor artifact adapter.** The Mind Map seed and governance-dashboard routes read META_LEDGER through classified adapter envelopes instead of raw text — malformed or unavailable ledgers degrade explicitly instead of being best-effort parsed. (#233, FX892)
- **First-run gates are repository-scoped.** The governance-mode picker and the onboarding offer now fire once per repository (workspaceState) instead of once per installation; the chosen mode persists to Workspace settings, and an explicitly configured mode at any scope suppresses the prompt so existing setups are never re-prompted. (#295, FX538/FX275)

### Fixed
- **Integration hardening from the #241 audit.** Installing an MCP integration can no longer destroy an unparseable `.mcp.json` (the merge refuses instead); SARIF/Sentry imports never throw on malformed payloads and never silently abort mid-import on a failed risk write; the PR-linkage Check Run paginates the open-issue set (no more false 'already closed' findings) and discloses truncation; SARIF import gains its missing opt-in setting. (#241, FX913-FX915)
- **The VSIX is 69% smaller and can never ship governance scan outputs.** Packaging excluded `.failsafe/**`, `*.findings.json`, and better-sqlite3 build intermediates (an 8MB `sqlite3.c` was shipping); `validate:vsix` now carries a durable archive-level hygiene gate. (#243, FX911)
- **Agent MCP-policy audit no longer aborts silently on a Risk-Register write failure.** The scan continues past a failed write, counts it, and warns the operator that findings may be missing. (#241, FX910)
- **The pre-commit guard is real now, and worktree-safe.** `GET /api/v1/governance/commit-check` ships (it was documented but never implemented, so the hook always failed open); the hook's port tracks the live Console server; installing from a linked git worktree works (hooks land in the shared `.git/hooks`, the token where the hook reads it); and `ConfigManager.getGovernanceRoot()` gives worktree-aware consumers one canonical repository root. (#83 Phase A, FX115/FX284/FX906)
- **Editor-save governance can no longer fail open on any routing fault.** `handleFileOperation` is now total: faults in intent lookup, evaluation routing, qorlogic dispatch, or the adapter preflight — plus a hung verdict generation (bounded at 10s) or a throwing blockade notifier — all block the save instead of surfacing as an unhandled rejection. (#297, FX905)
- **Mind Map view prefs survive identity-less reload windows.** The view-prefs store records the last real workspace identity and falls back to it when the hub hasn't delivered one yet; the canvas reconciles its prefs right after construction. (#319, FX897)
### Fixed
- **Fail-closed + accessibility hardening (rolled in):** L3 escalation-queue fail-visible (#308); ACP governance-mode mirror-write fail-closed (#299); ACP fs no-client-support fail-closed (#300); ARIA tab semantics for primary nav (#302) and sub-view pills (#304); Mind Map Space push-to-talk guard (#307).
- **Mind Map view prefs survive reload on slow machines.** The canvas could construct before the hub delivered the workspace identity, loading persisted layout/view prefs under the wrong key and sticking on FORCE/2D defaults (caught by this release's own gate on a prior tag attempt). Prefs now reconcile to the live canvas whenever the identity arrives. (#309 sibling fix; FX897/#263)

### Fixed (stabilization wave, rolled into this release)
- Extension lifecycle: activation-crash and deactivate teardown resilience; workspace-folder changes surfaced instead of silently ignored (#285, #288).
- Console/roadmap: WebSocket clients terminated on ConsoleServer teardown (#284); Mind Map canvas + in-flight guard reset on destroy for tab round-trips (#283); real-socket lifecycle evidence for ConsoleLifecycleService (#281).
- Governance: break-glass override recovered across extension-host restart (#290); CommitGuard.uninstall() made idempotent (#291).
- ACP: orphaned real-agent child killed on proxy interruption (#287).
- Voice: wake-word retry timer cancelled on stop/destroy (#286).
- Genesis/UI: disposed Command Center panels no longer reveal()ed (#289); marketplace crash-stale installing/scanning state recovered on restart (#293).

### Security
- Zero-cost OSS SAST wiring and hardened command boundaries (#267).
- Dependency updates: hono, @hono/node-server, js-yaml, fast-uri, undici, ip-address, brace-expansion, linkify-it, body-parser, actions/checkout, actions/setup-node (11 Dependabot PRs).
- **Dependabot backlog cleared to zero before ship.** All 18 open alerts (1 critical, 11 high, 6 moderate) remediated via `npm audit fix` plus pinned overrides: protobufjs 8.7.2, minimatch 9.0.9, picomatch 2.3.2, flatted 3.4.4, serialize-javascript 7.1.0, sharp 0.35.3, diff 8.0.4, ajv 8.18+. All affected packages were devDependency chains (voice/test/lint tooling) — none shipped in the VSIX — and `npm audit` now reports 0 vulnerabilities.

### Changed (Breaking)
- **Enforce is now the default governance mode.** Never-configured installs gate writes out of the box (intent-gated saves, L3 approvals); a one-time notice on upgrade offers the mode picker. Observe and Assist are unchanged and one QuickPick away (`FailSafe: Set Governance Mode`). An unresolvable mode value now fails closed to enforce, and the ACP proxy's missing/malformed mode mirror also resolves to enforce (was observe). (FX899, FX902)
- **Editor-level enforce works on every tier.** The internal `governance.lockstep` feature-gate check was removed from the editor enforcement path; enforcement no longer depends on license tier. (FX900)

### Added
- **Agent Skills marketplace category.** The Integrations Marketplace gains an Agent Skills category with the MIT-licensed [mattpocock/skills](https://github.com/mattpocock/skills) pack (Wayfinder decision-ticket planning + companions) as its first entry. (FX904)
- **Enforce-mode Create Intent funnel.** In enforce mode, `FailSafe: Create Intent` first resolves the plan the intent serves (picker sourced from PlanManager) with an explicit "switch governance mode" escape; the writes-blocked dialog now offers `Set Governance Mode` alongside `Create Intent`. (FX901)

### Removed
- **All remaining FailSafe Pro surfaces.** The `FailSafe: About FailSafe Pro` command, the Settings-panel Pro card, the Pro URL constants module, and the marketplace-description mention are removed (operator directive, completing the README removal). (FX414-FX416 superseded/removed)
- **Observe-mode advisory banner and default hint.** The Monitor sidebar banner and the Settings-card "You're in Observe mode by default" hint are gone with the default flip. (FX507 removed)

### Fixed
- **`/api/v1/status` `governance.mode`** now reports the governance mode (observe/assist/enforce) instead of echoing the Sentinel analysis mode. (FX903)
- **GovernanceRouter fails closed on verdict faults.** When verdict generation throws (e.g., a corrupted intent store), the router now returns a blocking verdict instead of silently allowing the write. (#296)
- **VerdictArbiter escalates malformed payloads.** A verdict payload that fails schema validation now escalates for review instead of silently PASSing. (#297, #316)
- **Malformed META_LEDGER is reported as damaged, not idle.** The governance-phase projection distinguishes a ledger that fails to parse from a workspace with no governance activity. (#244, #312)

## [5.9.0] - 2026-06-12

### Added
- Development Tracker: no-reload on live refresh + full-space layout (FX886); Export PDF (FX888); operator taxonomy contract + agent mappings (FX887).
- Mind Map: repository knowledge seed from governance history + Seed/Clear-layer controls (FX889).
- Workspace › Taxonomy editor → governed `docs/roadmap/tracker-config.yaml` the assistant consults next cycle (FX891).

### Fixed
- Shadow Genome: "Failure Nodes" → "Graph Nodes" label, Observed-count invariant, table-default for large graphs, label truncation (FX890).

## [5.8.0] - 2026-06-10

### Added
- **Shadow Genome shows real data.** The Governance › Shadow Genome panels are no longer empty: trust transitions, federation-peer status, and learning-maturity now populate from qor-logic's governance graph (qor-logic 0.111.0), and the genome map, incident ledger, and maturity funnel **reconstruct from your own governance history** (META_LEDGER) when no live genome is present. Every record is flagged **recorded** (live, in line with active governance) vs **reconstructed** (derived from history) so a mixed view stays honest. (#196)
- **Organize & Initialize clean up after themselves.** After the Monitor's Organize/Initialize commands apply workspace edits, FailSafe offers to commit, push, and open a pull request explaining the changes — so a one-click cleanup leaves a clean working tree and an auditable PR instead of a lingering "dirty" copy. Degrades gracefully (commits locally, or pushes a branch, when there's no GitHub token/remote); declining records the action to a local audit log.

## [5.7.0] - 2026-06-10

### Added
- **Shadow Genome governance dashboard.** A new **Governance › Shadow Genome** view renders qor-logic's causal governance graph as a decision-traceability surface — a deterministic, zoomable **Genome Map** of governance nodes and their causal links, and an **incident ledger** with a slide-over case-file drawer (governance roots, severity, recurrence), both derived from real governance data. Trust, federation, and learning-maturity panels are included and populate as their upstream data sources come online. The map is keyboard-operable with a "View as Table" accessibility fallback. (#196)
- **Monitor sidebar inherits the Console theme.** The Monitor sidebar chrome now follows the embedded Console's active theme — switch to Crimson (or any of the six themes) and the whole panel restyles to match, instead of the frame staying on the default look. Degrades gracefully to the default if the shared design tokens can't be read. (#212)

## [5.6.4] - 2026-06-08

### Added
- **Development Tracker — per-surface coverage.** Each product surface (Monitor, Learn, Agents, Governance, Workspace, Integrations, Config) now shows a governed coverage bar — verified vs. total features — projected from a new `Surface` tag on every feature-index entry. The per-surface picture is accurate by construction, not hand-maintained. (#206, #202)

### Changed
- **Development Tracker — verticals are the product's surfaces.** The tracker now presents the seven Console surfaces (not code directories) as its verticals, and on a governed repo with no hand-curated manifest it shows a "projected from the governance ledger" view rather than a bare one. (#204, #205, #202)

### Fixed
- **Development Tracker — accurate program completion.** Program-progress bars now count planned-but-unreleased work, so a program's true completion shows even before its phases anchor to a published release. (#202)

## [5.6.3] - 2026-06-06

### Added
- **PR↔issue linkage governance** — a new GitHub Check Run flags the `Closes #1, #2` footgun where GitHub auto-closes only the first issue and silently leaves the rest open. Off by default; publishes beside the SHIELD-verdict check. (#154)
- **Governed Development Tracker source** — the Development Tracker can now be built directly from your governance ledger (META_LEDGER decisions/releases + FEATURE_INDEX) as the authoritative source on governed repos, with the PR/CHANGELOG generator remaining the fallback.
- **Shadow-genome consumer** — FailSafe can now read qor-logic's causal governance graph (`shadow_genome_graph`), the foundation for upcoming decision-traceability views. (#118)

## [5.6.2] - 2026-06-06

### Added
- **Development Tracker loading + freshness indicators** — a loading skeleton ("Building the tracker…") now replaces the brief blank while the tracker builds, plus a visible "last refreshed" timestamp and a manual ↻ Refresh button to re-fetch on demand. (#163)

## [5.6.1] - 2026-06-05

### Fixed
- **Development Tracker renders on any repository** — repos without semantic-version releases (PR-incremental history) previously showed an empty dashboard; the tracker now detects the release cadence and renders a merged-PR timeline with full program and vertical detail. (#174)

### Added
- **Generate a tracker from your repo's history** — the new "FailSafe: Generate Tracker Manifest" command scaffolds the tracker's planning manifest from your merged PRs and CHANGELOG, so any repository gets a detailed, data-driven tracker without hand-authoring. (#174)
- **You own the categories** — generated programs and verticals are routed through an interactive keep / drop / rename / fold confirmation before they're written, so the tracker reflects how *you* slice your work rather than a commit-message heuristic. (#174)
- **Bicameral decision enrichment** — when the Bicameral integration is connected, the generated tracker deepens with decision-aware verticals (in-sync / drifted / open-question) and a governed-decisions ledger. (#174)

## [5.6.0] - 2026-06-04

### Added
- **Govern any Agent Client Protocol (ACP) agent** — a new ACP governance adapter routes an agent's tool calls, file writes, terminal commands, and permission requests through FailSafe's enforcement engine (Devin Desktop, Zed, JetBrains, and more). (#172)
- **Standalone ACP enforce-proxy** — mediates an ACP agent through FailSafe's *real* governance engine; blocks out-of-scope file writes and denies dangerous permissions in enforce mode, records every decision in observe/assist. Verified end-to-end against the live protocol. (#172)
- **One-click governed install for Devin Desktop** — register a FailSafe-governed twin of any agent in Devin's ACP registry. (#172)
- **Devin Desktop host detection** — first-class support for Devin Desktop (rebranded Windsurf), with rules from `.devin/rules/`. (#161)

### Changed
- **Development Tracker handles non-semver repos** — PR-incremental repositories are now discovered and rendered, with automatic cadence detection. (#174)

## [5.5.2] - 2026-06-04

### Added
- **Integration Catalog** — the Integrations tab now lists every command/config integration (Continue, Aider, OpenHands, Cline/Roo/Kilo, Linear, Jira, GitHub Checks, Sentry, Teams, Slack) in one place, each with a live enabled/configured status and a one-click jump to its Settings. (#167)

### Changed
- The Open Design card now reflects the **live** MCP connection state instead of a static placeholder. (#166)
- Integration install progress is now rendered by a shared, consistent step-by-step component. (#166)

### Fixed
- **Bicameral "team" setup no longer hangs.** Its interactive Google Drive sign-in now runs in an integrated terminal, and a per-step timeout prevents any install step from stalling indefinitely. (#165)
- The **Development Tracker** no longer fails to load when no planning manifest is present — it shows discovered releases with a short hint instead of an error.

## [5.5.1] - 2026-06-04

Maintenance patch.

### Changed
- **CI Actions bumped to their Node.js 24 runtimes** (Dependabot): `actions/checkout` v4→v6.0.3, `actions/setup-node` v4→v6.4.0, `actions/upload-artifact` v4→v7.0.1, `actions/download-artifact` v4→v8.0.1 — all SHA-pinned. No caller-facing API change; the project still installs Node 20. `download-artifact` v8 now fails the run on an artifact digest mismatch (fail-closed; a security upgrade for the publish hand-off).

### Fixed
- **Development Tracker** now surfaces the server's actual error in the dashboard ("HTTP 500 — &lt;reason&gt;") instead of a bare "HTTP 500", so a failed `/api/v1/tracker` fetch is diagnosable. (The transient 500 some saw during the v5.5.0 release was the route reading `CHANGELOG.md`/`BACKLOG.md` live from disk mid-edit; it clears on reload.)

## [5.5.0] - 2026-06-04

Integration suite expansion — FailSafe becomes a governance hub for your whole AI toolchain. Every integration is off by default, routed through the same deterministic policy engine, and ships with its own README; external API names are verified against official docs.

### Added
- **Governed CLI agent wrappers** — run **Continue** (`cn`) and **Aider** through FailSafe: argv-form spawn (no shell), tool-allowlist / produced-diff risk classification with the live PolicyEngine, and L3-risk changes routed to human approval. API keys travel in the child environment only, never in argv or any receipt. (#104, #107)
- **Agent observe / audit** — read-only **OpenHands** run observer (maps SDK events to transparency records, version-gated, never mutates a live run) and **Cline / Roo / Kilo** MCP-policy audit (flags remote MCP servers, wildcard auto-approval, and shell-capable tools; redacts env values + URL tokens before recording). (#105, #106)
- **Issue → intent-preview import** — read-only **Linear** and **Jira** issue resolution to an *uncommitted* intent preview; nothing is created or synced. (#97, #98)
- **GitHub PR checks** — publish SHIELD verdicts (PASS / WARN / VETO) as GitHub Check Runs at the merge gate; fork PRs degrade to local-only. (#96)
- **Sentry regression correlation** — import a project's unresolved issues into the risk register as runtime-regression risks; no raw event payloads stored. (#102)
- **Microsoft Teams notifications** — notify-only governance events via an incoming webhook (Adaptive Cards), alongside the existing Slack notifier. (#101)
- **Tier 1 supply-chain CI baseline** — least-privilege workflow tokens, SHA-pinned Actions, Dependabot, dependency review, CODEOWNERS, and a documented AI-agent workflow-boundary policy. (#90)
- **Playwright MCP** added to the governed MCP Catalog installers.
- Per-integration READMEs (15), a documentation-links registry, and a uniform integration folder-structure standard.

### Fixed
- External-name correctness pass (verified against live docs): Aider **`--yes-always`** (the prior `--yes` is not a valid flag), Sentry environment folded into the search **query** (the issues endpoint ignores a standalone param), OpenHands mapper aligned to the **real SDK event shape** (object `action`/`observation` + `tool_name`), and Linear bare-identifier matching made **case-insensitive**.
- De-flaked the FX801 IdleScheduler timing tests (poll-until-condition instead of fixed sleeps) — removes a release-pipeline dead-tag hazard.

### Security
- Every integration is **off by default**; secrets are sent only in auth headers / the child environment and are never logged (masking tests). Read-only integrations make **no network call** unless explicitly enabled.

## [5.4.3] - 2026-06-03

Premium Development Tracker + Agent Governance Toolkit installer. The **Development Tracker** (B-INT-17) is a premium, data-driven status dashboard at `/console/tracker`, embedded in the Workspace tab (+ Pop out ↗ + `FailSafe: Open Development Tracker`): full release history discovered from the CHANGELOG (v0.1.0→current), major-default timeline zoom with drill-in, a traceable record per release, and tiered program-progress (majors full history; minors/patches within configurable recent windows). The **AGT installer** (B-INT-16) is an Integrations → Agent Governance sub-view that auto-detects the workspace environment and serves the matching registry-verified Agent Governance Toolkit installer (run-in-terminal, no silent install).

## [5.4.2] - 2026-06-03

Release-gate hotfix for the v5.4.1 dead tag. v5.4.1's Release Pipeline failed at the `better-sqlite3` native rebuild (publish skipped — never reached either marketplace), but not for a code reason: VS Code stable bumped 1.122.1 → 1.123.0 between the v5.4.0 and v5.4.1 runs, shipping a newer Electron (V8 13.x) whose removed APIs break `better-sqlite3@12.6.2`. Fix: pin the VS Code test version to the last-known-good 1.122.1 in `.vscode-test.mjs` and `scripts/rebuild-vscode-electron.cjs` so the gate no longer tracks VS Code auto-update (overridable via `FAILSAFE_VSCODE_TEST_VERSION`). Carries the full v5.4.0 batch + v5.4.1 stale-test fix.

## [5.4.1] - 2026-06-03

Hotfix for v5.4.0, whose Release Pipeline failed at `npm run test:all` (publish jobs skipped — v5.4.0 never reached either marketplace). The B-INT-5 Integrations sub-tab Playwright test still asserted 2 sub-view pills, but v5.4.0's MCP Catalog tab (B-INT-13/14) added a third; updated the assertion to expect 3 pills and check the `MCP Catalog` label. The UI was correct — only the stale test count was wrong. Carries forward the full v5.4.0 batch below.

## [5.4.0] - 2026-06-03

Integration + governance batch (33 commits since v5.3.3). Cleared the B-INT-8 integration research gate (13 contract reviews) and shipped governed integrations: SARIF ingestion (#99), MCP Registry risk scoring (#108), Slack notify-only governance notifications (#100), and Context7 + Mermaid Chart MCP installers with an Integrations → MCP Catalog tab (B-INT-13/14). Added the evidence-enforced Development Tracker (`/console/tracker`, v1 + v1.1), the Node dependency-admission cooling-period lint + substrate seal auto-hook (B-SUBSTRATE-2/3), de-flaked the Bicameral idle-disconnect test (B-BIC-24), and synced governance skills to qor-logic 0.102.1.

## [5.3.3] - 2026-05-28

Integration-surface batch: the first Open Design write path (L3-gated `create_artifact`), Section-4 razor + clobber-guard cleanup across the Bicameral / Marketplace / TabGroup surfaces, and a transparency audit date-filter fix. Sealed at META_LEDGER #409–#414.

### Added

- **Open Design `create_artifact` through L3 (B-OD-8)** — the non-destructive `create_artifact` write tool is admitted via L3 human approval (Buffer & auto-execute): `POST /api/actions/open-design-create-artifact` enqueues an L3 item and returns 409 pending; `OpenDesignL3Executor` runs the buffered call on approval + appends a ledger USER_OVERRIDE. Gate-by-construction one-shot token on `OpenDesignMcpClient`; the 3 destructive tools stay rejected. New per-item `POST /api/actions/decide-l3` + L3-queue UI. FX806–FX811. Sealed META_LEDGER #409.

### Changed

- **Decompose `BicameralRoute.ts` (B-INT-6)** — 490 → 34 LoC under the Section-4 razor. Extracted `bicameralRouteShared.ts` (deps + `governToolCall` + helpers) + `bicameralLifecycleRoutes.ts` + `bicameralDecisionRoutes.ts`; `bicameralToolRoutes.ts` repointed at the shared core (breaks the prior import cycle). Public surface preserved via re-export; zero behavioral change (195 Bicameral mocha + 7 Playwright pass verbatim). Sealed META_LEDGER #410.
- **Decompose `bicameral-card.js` + `MarketplaceRoute.ts` (B-INT-7)** — both under the Section-4 razor. `bicameral-card.js` 314 → 98 (state renderers → `bicameral-card-render.js`); `MarketplaceRoute.ts` 382 → 29 (shared HITL-nonce core + read/install/scan route modules). Public surfaces preserved; zero behavioral change (90 mocha + 10 Playwright pass verbatim). Sealed META_LEDGER #411. Follow-up (#413): the marketplace `install/:id/confirm` completion decomposed into `handleInstallCompletion`/`runPostInstallScan`/`recordInstallLedger` to clear the 40-line function razor (58 marketplace tests verbatim).

### Fixed

- **TabGroup-level clobber guard for all sub-views (B-INT-12, FX812)** — generalizes the v5.3.2 Bicameral-only guard: `TabGroup.renderActive` gives every inactive sub-view a persistent detached scratch container, so an event-driven render on any inactive sub-view (timeline/genome/replay/risks/governance/skills) writes off-DOM and is rebuilt into the live pane on re-activation. One-place change, zero per-renderer edits, behavior-preserving. Independent audit PASS; 29 TabGroup + 481 sub-view + 14 Playwright verbatim. Sealed META_LEDGER #412.
- **Transparency audit date-filter dropped late-in-day records (FX813, qor-debug)** — `TransparencyRenderer.matchesFilter` compared a UTC ISO instant (`Z`, ms precision) against local minute-precision date bounds using lexicographic string `<`/`>`, silently hiding evening records (UTC date past local midnight) + the final minute of each day. Fixed by comparing on the epoch axis (`Date.parse`, `to` inclusive of its whole minute). TZ-independent regression test added. Sealed META_LEDGER #414.

## [5.3.2] - 2026-05-28

Internal-quality release bundling the two post-v5.3.1 integration-surface refactors (B-INT-4 + B-INT-5). No marketplace-feature change beyond the Integrations tab now presenting one sub-view per integration. Sealed at META_LEDGER Entry #407 (B-INT-4) + #408 (B-INT-5).

### Changed

- **Integrations tab sub-tab switcher (B-INT-5)** — the Integrations tab moved from a single stacked-card panel to a `TabGroup` sub-tab switcher (one sub-view per integration), matching the agents/governance/workspace pattern. The monolithic `IntegrationsRenderer` split into `BicameralRenderer` (`bicameral-renderer.js`, 250 LoC — at the Section 4 razor) + `OpenDesignRenderer` (`open-design-renderer.js`, 39 LoC, read-only static card); `integrations.js` deleted. FX802/FX803 verified (jsdom 9/9 + Playwright pill-switch). Plan: `plan-b-int-5-integrations-subtabs.md`.
- **Internal refactor (B-INT-4)** — Bicameral + Open Design MCP clients now extend a shared `McpClientHost` substrate at `src/integrations/mcp/`. The two near-identical `idle-scheduler.ts` copies are consolidated into a single canonical module. **Zero behavioral delta** — all existing unit suites (156 Bicameral cases + 64 Open Design / contracts cases) plus the FX487/488/489/490 + FX589 Playwright specs pass verbatim. `BicameralMcpClient.ts` drops from 291 → 188 LoC (back under the Section 4 razor); `OpenDesignMcpClient.ts` drops from 185 → 91 LoC. New FX800 (15 cases — McpClientHost lifecycle, including the preCallGate-before-not-connected-check and postConnectAssertion-after-fetchCapabilities ordering invariants) + FX801 (6 cases — consolidated IdleScheduler).

### Fixed

- **TabGroup inactive-sub-view clobber (B-INT-5 qor-debug, FX804)** — `TabGroup.onEvent` fans events to all sub-views, but only the active one owns the shared content element; an autonomous `bicameral.connected` broadcast (background auto-connect) arriving while the Open Design sub-tab was active re-painted the Bicameral card over the live pane. Fixed with an additive `_tgMounted` flag (`TabGroup.renderActive`) + an early-return DOM-write guard in `BicameralRenderer.render()` (state still mutates while inactive → fresh on re-select). Test-first regression guard T6 (red→green).

## [5.3.1] - 2026-05-28

Hotfix release. v5.3.0 was tagged but its Release Pipeline failed at Build & Test — `integrations-tab.test.ts:34` hardcoded `cards.length === 1` ("Bicameral is the only card in v1") which became outdated when v5.3.0 added the Open Design Settings card to the Integrations tab; the VS Code Marketplace + Open VSX publish jobs were skipped, so v5.3.0 was never installable. **v5.3.1 is the first v5.3.x build that actually ships to the marketplaces.**

**Zero feature changes from v5.3.0** — the Open Design integration v1 (provenance) + v1.1 (MCP + SSE + probe) + WARN-only governance substrate v1 ship verbatim.

### Fixed

- **`integrations-tab.test.ts` — assert 2 cards for v5.3.0+** — the legacy `Bicameral is the only card in v1` test fired `2 !== 1` after v5.3.0 added `renderOpenDesignCard()` to `IntegrationsRenderer._renderCards()`. Test now asserts exactly 2 cards plus positive presence checks for both `.cc-bicameral-card` and the Open Design card (matched via `textContent`).

## [5.3.0] - 2026-05-28

### Added

- **Open Design integration v1.1 (B-OD-7)** — MCP adapter + per-run SSE attach + daemon-liveness probe. New `src/integrations/open-design/` modules: `OpenDesignDaemonProbe` (HTTP probe at `127.0.0.1:7456/api/version` with 30s TTL cache + 5s timeout + discriminated alive/refused/timeout/non_200/parse_error result), `OpenDesignMcpClient` (stdio MCP wrapper transplanted from the Bicameral pattern with concurrent-connect coalescing + idle-disconnect + transport.onclose teardown + capability cache from `listTools()`), `OpenDesignSseClient` (per-run `/api/runs/<id>/events` subscriber with SSE wire-format parsing + Last-Event-ID re-attach + capped exponential backoff up to 3 attempts), `OpenDesignMcpAllowlist` (static enumeration of 7 read-only + 4 write tools back-cited to upstream `apps/daemon/src/mcp.ts@abe72af` line numbers; includes destructive `delete_file` + `delete_project` + `write_file`). Vendored `ChatSseEvent` discriminated union under `contracts/sse-chat.ts` with Apache-2.0 attribution. New `src/extension/bootstrapOpenDesignMcp.ts` wires the operator wizard command `failsafe.openDesign.registerMcp` + opt-in pre-construction via `failsafe.integrations.openDesign.mcpEnabled` (default false) + forward-setting `failsafe.integrations.openDesign.sseEnabled` (default false). **v1.1 invariant**: write tools (`create_artifact`, `write_file`, `delete_file`, `delete_project` — 3 destructive) are REJECTED at runtime by `OpenDesignMcpClient.callRaw()` with `WRITE_TOOL_NOT_ENABLED`; L3-gated exposure deferred to v1.2 (B-OD-8). FX720-FX725 (60 cases — 9 sse-chat + 7 probe + 7 allowlist + 10 mcp-client + 6 sse-client + 7 bootstrap + 14 cross-coverage from FX700/FX701). Plan: `plan-open-design-integration-v1.1.md` (v3 PASS verdict; closes the 4-cycle Plan-Time Hallucination remediation loop per the new `feedback_verify_external_names_at_plan_time` doctrine). See `docs/INTEGRATIONS.md` (Open Design v1.1 section).
- **Open Design integration v1 (B-OD-1)** — file-path-based provenance attribution for agent runs whose edits land in `.od/artifacts/<projectId>/` paths. Opt-in via `failsafe.integrations.openDesign.enabled` (default `false`; requires extension reload). New `AgentProvenance` discriminated union on `AgentRun`; new `IAgentProvenanceDetector` interface + `OpenDesignProvenanceDetector` implementation; `AgentRunRecorder` gains an optional `{ provenanceDetectors }` options-bag constructor argument + a public `attachProvenance(runId, provenance)` method. Monitor Agents → Replay sub-view renders an "Open Design" origin pill on attributed runs. FX700-FX705 (28 cases). Plan: `plan-open-design-integration-v1.md` (v3). See `docs/INTEGRATIONS.md` (Open Design section) for the v1 surface + v1.1 roadmap.
- **qor.scripts substrate modules v1** (target v5.3.0; plan-qor-substrate-modules-v1) — WARN-only governance substrate layer invoked via the new `failsafe.substrate.run` Command Palette entry. Three modules in v1: `secret_scanner` (gitleaks v8), `feature_index_verify` (TS-local adapter — corrects an upstream column-header DRIFT), `model_pinning_lint` (silent-no-op against `.claude/skills/`, documented in `summary.note`). One `'substrate.run.complete'` event per run on the FailSafe EventBus; findings surface in a "FailSafe Substrate" Output channel + a `showInformationMessage` toast. WARN-only posture: findings never block operator workflow. FX710-FX715 (32 test cases total). New docs at `docs/SUBSTRATE_MODULES.md`; backlog `[B-SUBSTRATE-1..6]`.

## [5.2.2] - 2026-05-26

Hotfix release for the v5.2.x cycle. v5.2.0 and v5.2.1 are both dead-on-marketplace git tags in `main` — each had a Release Pipeline run that failed at the Build & Test job before the publish jobs ran. v5.2.0 (`ba9a927`, run `26470883885`) failed on 5 unit-test failures from orphaned SHIELD-anchor lesson literals + an FX615 tag-filter test race. v5.2.1 (`7631ac1`, run `26484008504`) failed on a latent Playwright harness regression in `popout-ui.spec.ts:6` that was masked by v5.2.0's earlier unit-test failures (CI never reached Playwright in v5.2.0's run; v5.2.1's unit-test fix made the latent regression visible). v5.2.2 closes the harness regression. **Zero feature delta from v5.2.1** (which itself had zero feature delta from v5.2.0) — the FailSafe Learn rebuild, Ollama probe fix, and a11y baseline ship verbatim. See the [5.2.0] entry below for the full content.

### Fixed

- **`popout-ui.spec.ts` Playwright harness migration to `serveConsoleServerUI`** — the legacy `http.createServer` static-file harness rooted at `src/roadmap/ui/` could not resolve the cross-directory ESM imports introduced by `LearnRenderer` in v5.2.0: `src/roadmap/ui/modules/learn.js` imports `../../../education/lessonTriggers.js`; `learn-essay-list.js` + `learn-glossary.js` import `../../../education/lessons.js`. These resolve in production through the bundling step and (during other Playwright specs) through the `ConsoleServer`'s module-resolution machinery, but the static-file pattern never reached outside `src/roadmap/ui/`. The browser issued 404s for `/education/*.js`, the `<script type="module">` import chain aborted with `net::ERR_ABORTED`, `command-center.js` never bootstrapped, the `.tab-btn` click handlers at `command-center.js:152-174` were never attached, and clicking the workspace tab silently did nothing. The new spec uses `serveConsoleServerUI` — the same harness as `command-center-learn-multimode.spec.ts`, `agents-tab.spec.ts`, `workspace-tab.spec.ts`, and every other v5.2.0+ Playwright spec that boots `command-center.html`. All functional assertions preserved verbatim (5 tab visibility checks + 3 tab-click → `#panel.active` assertions + 6-row theme select assertion). Forward contract documented in the spec header: any new Playwright spec that boots `command-center.html` must use `serveConsoleServerUI`; the static-file pattern is dead for the v5.2.0+ codebase.
- **No production-code change in this release.** The hotfix is test-infrastructure only.

### Process / lessons captured

- **CI failure masking is a real risk.** v5.2.0's 5 unit-test failures stopped `xvfb-run -a npm run test:all` before Playwright ran, silently hiding the popout-ui regression for the entire v5.2.0 → v5.2.1 cycle. A CI run that fails at phase N can mask additional regressions in phase N+1. Operators should expect at least one more iteration after the first fix when CI fails early.
- The two-tag dead-on-marketplace sequence (v5.2.0 + v5.2.1) is documented in operator memory `project_v5_2_x_dead_tags` for future-cycle reference.

_v5.2.2 released 2026-05-26 — `package.json` bumped to 5.2.2; META_LEDGER seal entry #396._

## [5.2.1] - 2026-05-26

Hotfix release for the v5.2.0 cycle. The v5.2.0 Release Pipeline (run id `26470883885`) failed at the Build & Test job with 5 unit-test failures; the VS Code Marketplace + Open VSX publish jobs were SKIPPED, so the `v5.2.0` git tag exists in main's history (`ba9a927`) but the extension was never installable. v5.2.1 is the first v5.2.x build that ships to the marketplaces. **Zero feature delta from v5.2.0** — the FailSafe Learn rebuild, the Ollama probe fix, and the global a11y baseline ship verbatim. See the [5.2.0] entry below for the full content.

### Fixed

- **Three orphaned SHIELD-anchor lesson literals** in `src/education/lessons.ts` — `shield.plan`, `shield.audit`, `shield.substantiate` were left in `LESSON_LIST` after the v5.2.0 cycle stripped the Monitor SHIELD lesson expander, becoming dead content that the FX598 lesson-anchor coherence check (`every lesson anchor is mounted somewhere`), the FX598 webview-mount assertion, the FX598 ghost-fixture parity test, and the FX602 governance-moment classifier all correctly flagged. v5.2.1 drops the literals and adds a dead-entry guard. The surviving `governance-mode` lesson (Settings card + `FirstRunModePicker`) carries forward unchanged. Header comment on `LESSON_LIST` documents the re-introduction protocol: re-add the literal AND a consuming mount in the same commit, never one without the other.
- **FX615 Glossary tag-filter test re-render race** in `src/test/education/learn-glossary-render.test.ts` — the test held a stale button reference across the post-click DOM rebuild that the tag filter triggers. Updated to re-query the button after the click event. No production change; test-only stability fix.
- **Five governance test files** updated to assert against the surviving `governance-mode` carry-forward + a regression guard that the three dropped SHIELD anchors are not silently re-introduced (`src/test/education/lessons.test.ts`, `lesson-types.test.ts`, `glossary-lessons.test.ts`, `lesson-anchor-coherence.test.ts`, `learn-glossary-render.test.ts`).

### Process / known follow-ups

- Two pre-existing Playwright spec failures (`src/test/ui/popout-ui.spec.ts`, `src/test/ui/bicameral-advanced-tools.spec.ts`) were observed locally but are **not** v5.2.1 regressions and were never part of the 5 CI failures that blocked v5.2.0. Both pre-date this hotfix branch; both will be triaged in a separate follow-up. They are explicit non-blockers for the v5.2.1 publish.

_v5.2.1 released 2026-05-26 — `package.json` bumped to 5.2.1; META_LEDGER seal entry #395._

## [5.2.0] - 2026-05-26

**FailSafe Learn — Software Development Craft** is the v5.2.0 release-gating feature. The Learn tab on the Command Center teaches the software-development craft to AI-assisted builders, PMs gaining developer literacy, and true beginners — through five short essays surfaced contextually as they work, plus the FailSafe Glossary as a secondary reference. Mantra: *Slow down to speed up.* Not training software — no quizzes, no scoring, no grading, no learner inference. FX591 / FX598 / FX601 / FX606 modified; FX608–FX613 added. See `docs/plan-qor-failsafe-learn-swe-craft.md`, `docs/EDUCATION.md`, `docs/VIBE_CODER_PLAYBOOK.md`, and `docs/compliance-education-component.md`.

### Added

- **Five SWE-craft essays** on the Learn tab — *Slow down to speed up* · *Scope before prompt* · *Acceptance criteria before code* · *Choosing between agent suggestions* · *Verify before you believe* — each at three tier framings ("New to code" / "AI builder" / "Product/PM background"). Two essays carry operator-binding templates (the acceptance-criteria template; the 6-question option-evaluation table). Content authored against the Phase 0 content matrix at `.failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md`; literals split into sibling content modules (`src/education/lessons-content-swe-essays.ts` + `-2.ts`) following the existing `glossary-content-*.ts` pattern. FX591 (v2).
- **Learn-tab essay-list renderer** (`src/roadmap/ui/modules/learn-essay-list.js`) — filters the registry to `learn.essay.*` anchors and renders all 5 cards as an always-on curriculum directory (title, current-tier body, embedded templates where applicable). Cards with fired contextual triggers sort first with a "Relevant for what you are doing now" badge; only those cards carry a **Mark as read** control (`data-learn-essay-ack`) that suppresses *only* the badge for the rest of the session (sessionStorage flag `fs-learn-nudge-dismissed:<anchor>` — the essay itself remains in the directory). FX609.
- **Contextual surfacing trigger engine** (`src/education/lessonTriggers.ts`) — a pure-function evaluator that maps hub state (`activePlan`, `recentCheckpoints`, `unattributedFileActivity`, `governancePhase`) onto five nudge anchors (one per essay). Includes a per-anchor frequency cap (1/session) and a per-session global cap (2 total) — both enforced **cumulatively across renders** via webview `sessionStorage` counters (`fs-learn-nudge-count:<anchor>`), so the same nudges do not re-fire on every hub update. Dismissals via the "Mark as read" control suppress only the *relevant-now badge* (sessionStorage flag `fs-learn-nudge-dismissed:<anchor>`); the underlying essay always remains in the curriculum directory. `scope-before-prompt` requires actual file activity to fire — opening Learn on a passive empty state never produces a relevant-now badge. The `choose-agent-option` high-blast-radius detector covers JS/TS lockfiles (npm/yarn/pnpm/bun), tsconfigs, common bundler configs, Python (`requirements*.txt`, `Pipfile[.lock]`, `pyproject.toml`, `poetry.lock`), Rust (`Cargo.{toml,lock}`), Go (`go.{mod,sum}`), VSIX manifests / packaged `.vsix`, and any `.github/workflows/` path. Session-duration timing is **client-side only** (webview `sessionStorage`; binding GDPR constraint — never transmitted server-side). FX608.
- **Tier framing** (`failsafe.education.proficiency.enumDescriptions`) — three operator-binding labels: *New to code* / *AI builder* / *Product/PM background*. The enum values are unchanged; only the descriptions reframe them as starting-point selectors, not skill scores. FX613.
- **SWE-craft vocabulary dominance check** (FX612) — extends the lesson-anchor coherence test with an automated assertion that the aggregated `learn.essay.*` body text contains SWE-craft vocabulary at ≥ 3× the FailSafe-governance vocabulary count. Binding enforcement of ideation failure-remediation class 1 ("content drifts back to FailSafe-vocab-only"); a hostile FailSafe-vocab-only fixture is caught.
- **Essay-list mount class** in the lesson-anchor coherence check (FX598 extension). `learn.essay.*` anchors are positively validated against the essay-list surface (`learn-essay-list.js`); a dead essay anchor is caught.

### Changed

- **The Learn tab is now SWE-craft-centric.** The five SWE-craft essays are the primary content; the FailSafe Glossary remains as a secondary reference below them. `LearnRenderer` (`learn.js`) recomposes around `renderEssayList` + the trigger engine. FX606 modified.
- **FX601 glossary Playwright assertion** updated — the "absent when disabled" test now expects `#cc-learn-essay-list` to be absent (parallel to the glossary), since both primary and secondary content are gated by the same `education.enabled` discipline.
- **`docs/EDUCATION.md`, `docs/VIBE_CODER_PLAYBOOK.md`, `docs/UI_MANIFEST.md`, `docs/FEATURE_INDEX.md`** rewritten or updated for the v2 reality.
- **The proficiency setting's `description`** in `package.json` reframed: "Where the FailSafe Learn content meets you — a starting-point selector, not a skill score. The operator picks; FailSafe never infers."
- **Server registry writes** now use a unique temporary file per write instead of the shared `servers.json.tmp` path. This removes a parallel Command Center test/server race where concurrent registry cleanup could delete another writer's temp file before the atomic rename.

### Removed (rejected v1 + v3 Educational Component)

The v1 Educational Component (sealed META_LEDGER #388) and v3 Guided Dev Cycle (sealed #389) were **rejected by the operator on 2026-05-22**: they taught FailSafe vocabulary, not software development. Removed in this rebuild:

- `src/education/devCycleTrack.ts` (the SHIELD-lifecycle track data model).
- `src/roadmap/ui/modules/guided-dev-cycle.js` (the Guided Dev Cycle panel renderer).
- `src/test/education/devCycleTrack.test.ts`, `src/test/education/guided-dev-cycle.test.ts`, `src/test/ui/command-center-guided-dev-cycle.spec.ts` (the FX603/604/605/607 tests).
- `docs/GUIDED_DEV_CYCLE.md` (documented the rejected concept).
- The bundle.cjs / copy-ui-js.cjs `devCycleTrack` browser-ESM emit was replaced with the `lessonTriggers` emit.
- FX598's v3 track-command extension reverted.
- The 4 v1 governance-moment lesson literals (`governance-mode`, `shield.plan`, `shield.audit`, `shield.substantiate`) carry forward in the registry — they power the v1 Settings governance-mode card + Monitor SHIELD phase tracker (both kept unchanged); they are NOT the Learn tab's content.

### Visual rebuild (2026-05-25 — in flight, uncommitted)

The v2 Learn tab shipped a single-pane composition (essay list + glossary stacked); the visual treatment was operator-rejected as low quality (no design reference consulted, no Chrome verification). This rebuild redoes the visual layer on top of the existing content, dispatched against 3 parallel design-research sources (`ui-designer` Direction A + Direction B + `accessibility-tester` + `web-design-guidelines`). Plan: `plan-learn-tab-visual-rebuild.md`.

- **Two-sub-tab `TabGroup` host** on the Learn tab — pills `[Read][Glossary]`. Default active is Read. Practice surface deleted in this cycle (the Mad-Libs prompt builder was hollow; a follow-up "zoom-in evaluator" plan will re-add a genuine Practice surface).
- **Read sub-view sectioned-essay rebuild** — each essay card carries a per-essay accent rail (4px, mapped to existing `--accent-{green/cyan/gold/orange/red}` tokens), inline-SVG icon, `~Nm read` chip (top-right, `tabular-nums`), pull-quote callout, H4-subheaded sections, and (for `acceptance-criteria` + `choose-agent-option`) inline template sub-panels. The acceptance-criteria template gains a **Copy** button that writes the canonical template to the clipboard.
- **Sticky horizontal jump-strip** at top of Read (FX619 NEW) — five anchor links with per-essay accent on hover + a relevant-now dot when the contextual trigger fires. Cards carry matching `id="cc-learn-essay-<slug>"` for browser-native scroll. Wraps to 2 lines under narrow webview widths.
- **Reference sub-view → Glossary** (FX615 modified) — renamed file `learn-reference.js` → `learn-glossary.js`, class `LearnReference` → `LearnGlossary`, all CSS `.cc-learn-ref-*` → `.cc-learn-glossary-*`. Per-row `[SWE]/[FS]` chips removed. The current visual treatment is a tag-filter UI (filter buttons + A-Z/Z-A sort dropdown) over a single alphabetized all-terms list. Search input adopts a11y attrs (`inputmode="search"`, `spellcheck="false"`, `autocomplete="off"`, paired `.visually-hidden` `<label>`); results container is `aria-live="polite"`.
- **Bicameral co-existence** (FX618 modified) — the integration-partner entry `glossary.bicameral-integration` co-exists with the v1 two-chambers `glossary.bicameral` entry; both render in the Glossary with distinct display terms. The two-chambers framing is preserved as a regression guard.
- **48-term SWE software glossary** (FX617) — 15 + 15 + 18 entries across `glossary-content-swe.ts` / `-swe-2.ts` / `-swe-3.ts`, joined through `glossary-aggregator.ts`. No anchor collisions with the legacy 12 FailSafe glossary entries (namespaced `glossary.swe.*`).

### A11y baseline (2026-05-25 — global CSS)

Added once near the top of `command-center.css`, applies extension-wide (not just Learn):

- **`@media (prefers-reduced-motion: reduce)`** disables all transitions + animations (`transition-duration: 0.01ms !important`). Closes WCAG 2.3.3 — the existing CC had zero coverage despite 21 `transition:` declarations.
- **Global `:focus-visible`** outline (`2px solid var(--primary)`, 2px offset) on `.cc-pill`, the Copy button, jump-strip anchors, glossary search input, glossary row-expand toggles. Closes WCAG 2.4.7 — the existing CC had a single `:focus-visible` rule, leaving every other interactive surface keyboard-blind.
- **`.visually-hidden` utility** — standard SR-only label class for the glossary search input's WCAG 3.3.2 paired label.
- **`max-width: min(68ch, 100%)`** on body prose — preserves 45-75ch readable line length while surviving WCAG 1.4.4 200% zoom without horizontal scroll.
- **Light-theme accent badge fallback** — `--accent-gold` (1.7:1) and `--accent-green` (2.5:1) on white panel fail WCAG 1.4.3 AA; `@media (prefers-color-scheme: light)` switches the relevant-now badge to a neutral `var(--bg-panel)` background. (Operator verification noted: in VS Code webviews `prefers-color-scheme` may not track the editor theme; theme-class selector swap is a deferred follow-up.)

### Fixed

- **Mindmap "Ollama (Server)" false-positive "Connected"** — `llm-status.js:74` previously hardcoded `status: 'Connected', active: true` for the Ollama row with no probe of any kind, so the panel claimed Ollama was running even when it wasn't installed. Added an actual probe: `_probeOllama()` in `connection.js` fetches `http://localhost:11434/api/tags` with a 1.5s timeout, caches the result with a 30s TTL, and notifies `webLlmStatus` listeners on completion. The Ollama row now reflects reality (`Connected ✓` / `Not Running` / `Checking…` / `Unavailable`). FX192 test suite extended from 1 case (the bug-encoding "always Connected") to 4 cases covering the full probe state space. Brainstorm renderer subscribes to `webLlmStatus` notifications so the async probe result triggers a re-render.

### Compliance

- **`docs/compliance-education-component.md`** — fresh determination for FailSafe Learn v2. Stays **outside** EU AI Act Annex III high-risk education/training classification (no assessment, no scoring, no learning-outcome evaluation, no level inference — operator self-selects tier). More strongly aligned with Article 4 AI-literacy than v1 was. Binding GDPR design contract: session-duration timing client-side only. Two binding escalation triggers: any introduction of scoring/grading/inference → re-ideate; any expansion to a full curriculum within the open extension → escalate to FailSafe Pro / separate-extension scope decision.

_v5.2.0 released 2026-05-26 — `package.json` bumped to 5.2.0; META_LEDGER seal entries #392 (substantive) + #393 (gate-closure extension)._

## [5.1.8] - 2026-05-22

B-INT-1 surfaces the 11 remaining Bicameral MCP tools (routes + a styled, grouped Advanced-tools card section) + B-EM-1 Sentinel-evaluator/Governance-mode UI disambiguation + B132 brainstorm node-label truncation feedback + the B199 CRITICAL test-coverage epic closeout + a v5.1.7 activation-test regression fix surfaced by restoring the full `vscode-test` suite (2739 passing, 0 failing). FX584–FX590. SHIELD-sealed via META_LEDGER Entry #385 (consolidated v5.1.8 cycle). See `docs/plan-qor-v5-1-8-cycle.md`. v5.2.0 remains gated on the Educational component — not this release.

### Added

- **Bicameral Advanced-tools surface** (B-INT-1). The 11 remaining Bicameral MCP tools (`ingest`, `search`, `brief`, `judgeGaps`, `resolveCompliance`, `linkCommit`, `update`, `reset`, `dashboard`, `validateSymbols`, `getNeighbors`) are now reachable. Each gets a `POST /api/actions/bicameral-<tool>` route — registered via a new `bicameralToolRoute` factory in `src/roadmap/routes/bicameralToolRoutes.ts`, `rejectIfRemote`-scoped, `409` when disconnected, `400` on a malformed body. State-changing tools (`ingest`, `update`, `reset`, `resolveCompliance`, `linkCommit`) route through the B151 `McpInterceptor` governance seam; pure-query tools call the client directly. A collapsed-by-default **"Advanced tools"** section in the bicameral card (`src/roadmap/ui/modules/bicameral-advanced-tools.js`) exposes all 11 as labelled invoke rows with per-tool inputs and capability-gating (a tool absent from `/status` `capabilities` renders disabled). The client surface was already complete (B-BIC-19); this cycle adds the route + UI surface. The section is fully styled in `command-center.css` (no inline styles), splits the tools into a **Query tools** group and a visually-distinct **Mutation tools** group, shows a per-row loading state during invocation, and renders results in a labelled success/error container. 14 cases (FX586–FX589 incl. a Playwright invoke-flow case).

### Changed

- **Sentinel-evaluator vs Governance-mode UI disambiguation** (B-EM-1). Five UI sites rendered `sentinel.mode` (`SentinelMode` = `heuristic`/`llm-assisted`/`hybrid`) with a `|| 'observe'` fallback — `'observe'` is a `GovernanceMode`, an invalid value for the field — and some labelled the value as if it were the governance mode. New `sentinelModeValue()` leaf supplies the corrected `'heuristic'` default; `integrity.js` relabels `Governance Mode:` → `Sentinel Mode:`, `governance.js`/`operations.js` prefix the value with `Sentinel`, `tickers.js` relabels `PROTOCOL` → `SENTINEL`. 8 cases (FX584).
- **Brainstorm node-label truncation feedback** (B132). Brainstorm node labels were silently shortened to 200 chars server-side with no client signal. `BrainstormRoute.ts` (`POST`/`PATCH /node`) now returns additive `labelTruncated` + `labelOriginalLength` fields when the cap is hit (`NODE_LABEL_MAX` + `withTruncationInfo` extracted to `brainstorm-label-truncation.ts`); the brainstorm UI surfaces a dismissible `.bs-truncation-notice` on add and edit, styled as an inline info banner in `command-center.css`. 6 cases (FX585) + a Playwright case (FX590).

### Fixed

- **Bicameral activation tests — latent v5.1.7 regression.** B-BIC-6 (v5.1.7) made the spawn-command validator async (`isSafeBicameralCommandResolved` with `realpath`), so `wireFromConfig` now calls `setBicameralCommand`/`setBicameralClient` after an `await`. Three `bicameral-activation.test.ts` cases asserted those calls synchronously and silently broke — masked because v5.1.7's `vscode-updating`-mutex degraded posture never ran the full `vscode-test` suite. v5.1.8 restored the full suite (2739 passing / 1 pending / 0 failing); the three cases are now async-aware. Production wiring was already correct — test-only fix.

### Closed

- **B199 — comprehensive Playwright + integration test-coverage epic** (CRITICAL) is closed. Phases 1–9 and sub-items B-B199-1..6 are all verified complete; every cited FX row was confirmed present in `FEATURE_INDEX.md` with its spec on disk. FX539 (B-B199-1 brainstorm E2E) was retroactively indexed during the closeout. FX513/FX519 carry `test.skip`-staged cases pending B197 — accepted residual. Two pre-existing razor-debt items surfaced during B-INT-1 were filed as B-INT-6/B-INT-7.

## [5.1.7] - 2026-05-21

B151 universal governance interceptor (the B190 → B151 → B152 → B153 architecture chain; B190 itself shipped in 5.1.6) + B191 Monitor SHIELD-visibility verification + B-INT-2 bicameral.preflight → L3 + B198 subscribe-without-mutate UI remediation + B-BIC validator/UX/governance batches (6/7, 12/13/14/15, 17/18) + B-B199-3/4/5/6 test-coverage gaps. FX547–FX583. SHIELD-sealed via META_LEDGER Entry #384 (consolidated v5.1.7 cycle). See `docs/plan-qor-b151-governance-interceptor.md`, `docs/plan-qor-b-int-2-preflight-l3.md`, `docs/plan-qor-b198-subscribe-without-mutate.md`, `docs/plan-qor-batch1-bbic-decision-row-ux.md`, `docs/plan-qor-batch2-bbic-validator-hardening.md`, `docs/plan-qor-batch3-b199-coverage-gaps.md`, `docs/plan-qor-batch4-bbic-governance-integration.md`. v5.2.0 remains gated on the Educational component — not this release.

### Added

- **`IGovernanceInterceptor` contract seam** (B151). Single `evaluate(req): Promise<ReceiptContract>` interface at `src/governance/interceptor/` — the universal pre-action governance entry point. Receipts validate against `receipt.json`; evidence is always `{kind, ref}` objects, never bare strings; ids are derived deterministically via `contractMappers`. 5 cases (FX547).
- **`EngineBackedInterceptor`** (B151). Delegates to the existing `EnforcementEngine` and maps `Verdict` → `ReceiptContract` (ALLOW/BLOCK/ESCALATE → schema-valid receipts; an engine throw → a QUARANTINE receipt, no rethrow). No new enforcement surface. 5 cases (FX548).
- **`McpInterceptor` adapter** (B151). Wraps an MCP `{name, arguments}` envelope into an `EvaluationRequestContract`; malformed input yields a QUARANTINE receipt without invoking the backing interceptor. Minimal local client interface — no bicameral import. 5 cases (FX549).
- **`contractMappers`** (B151). Deterministic id derivation, `ProposedAction` ↔ `EvaluationRequest` round-trip, and `Verdict` → `Receipt` projection. 6 cases (FX550).
- **`PreflightToL3Mediator`** (B-INT-2). Subscribes the bicameral `preflight` tool to the L3 approval pipeline: a drifted decision attaches preflight evidence to the queued L3 entry. Graceful degradation (null/disconnected client → no attach; a thrown preflight is swallowed). Minimal local `L3PreflightDeps` interface. 6 cases (FX553).
- **`L3ApprovalService.attachPreflightEvidence` + tier-3 preflight wiring** (B-INT-2). In-place `meta.preflight` merge with flag dedup on the live L3 queue; `processEvaluationDecision` fires preflight non-blocking after a tier-3 entry is queued. 7 cases (FX554 + FX555).
- **L3 preflight-conflict UI** (B-INT-2). `renderL3PreflightConflicts` in the governance panel and `formatPreflightConflicts` on `L3ApprovalPanel` surface drifted-decision conflict lines; all decision titles HTML-escaped. 7 cases (FX556 + FX557).
- **Shared accessible modal helper** (B198). `modal-helper.openModal` — one helper with `role="dialog"`, `aria-modal`, focus trap, Escape-to-close, and focus restoration; three modal sites in `risks.js` + `roadmap.js` delegate to it. 6 cases (FX559).
- **Bicameral decision-row UX batch** (B-BIC-12/13/14/15). Open-binding route + decision-row "Open" affordance (`POST /api/actions/bicameral-open-binding`); capability-gated `/bicameral-ingest` empty-state hint driven by a new `/status` `capabilities` field; composite Sync action firing status + history + drift on one press; binding `<code>` overflow clamp. 14 cases (FX561–FX564).
- **Bicameral install-detector validator hardening** (B-BIC-6/7). `isSafeBicameralCommandResolved` adds symlink-containment re-check via `realpath` with a fail-closed catch branch; `isSafeBicameralCommand` gains an `extraRoots` allowlist parameter; `defaultExtraRoots()` apply-by-default Windows chocolatey/scoop roots. 15 cases (FX565–FX569).
- **Bicameral verdict event → Sentinel + Risk Register** (B-BIC-17/18). `BicameralRoute` drift/ratify handlers emit `bicameral.verdict` events (eventBus-absent-safe); `SentinelWatchPolicy.classifyBicameralVerdict` maps `drifted` → high/notify; `RiskRegisterManager.upsertRisk`/`closeRisk` give keyed idempotent risk lifecycle; `DriftToRiskMediator` mirrors verdicts into the Risks Register (drift upserts a `bicameral:{decisionId}` risk, ratify closes it). 16 cases (FX580–FX583).
- **Cross-host install-record coverage** (B-B199-4). A layout-correct `writeRecordForHost` helper sourcing paths from `HOST_INSTALL_LAYOUTS` closes the gap where `kilo-code` (`.kilo` base) and `gemini` (`.gemini/commands`) install-record round-trips were untested, including a regression-guard that a record at the wrong `.kilo-code` path is not picked up. 4 cases (FX575).

### Changed

- **`BicameralRoute` is now interceptor-governed** (B151). The `history` / `drift` / `ratify` tool routes route through `McpInterceptor`; a behavioural-parity spec (FX551) pins success bodies, error envelopes, and HTTP status against a pre-migration snapshot fixture so the migration is provably zero-behaviour-change. `src/integrations/bicameral/` remains zero-diff.
- **`SkillsRenderer` cache invalidation + `TabGroup` sub-view lifecycle** (B198). `SkillsRenderer` now invalidates its cache on `skills.*` / `voicePack.*` events (subscribe-without-mutate — no spurious re-fetch on unrelated `hub.refresh`); `TabGroup.switchTo` destroys the outgoing sub-view renderer; re-render-safe `destroy()` added to `skills.js` + `risks.js`. 9 cases (FX558 + FX560).
- **E2E coverage-gate hardening** (B-B199-5). `check-e2e-coverage.cjs` rewritten: `[no-e2e]` overrides are now per-file scoped (`[no-e2e: <path-fragment> — <reason>]`); the legacy unscoped form no longer grants a blanket pass; a blanket override is opt-in and explicit via `[no-e2e: * — <reason>]`; a new `mode:'release'` checks a merge-commit range instead of the staged index and fails closed when the range is unresolvable; every excused/bypassed file emits a greppable `[e2e-gate] AUDIT:` line. 12 cases (FX570–FX574).
- **B191 Monitor parity assertion strengthened**. The FX525 `bus-renderer-flow.spec.ts` disk → `/api/hub` → Monitor compact-UI parity case was strengthened; research confirmed B191's SHIELD-activity visibility is already resolved by B192/B193/B199, so B191 closed as verify-and-close (L1).

### Security

- **Symlink-containment re-check on bicameral command resolution** (B-BIC-6). `isSafeBicameralCommandResolved` resolves symlinks via `realpath` and rejects any command whose real path escapes the home directory (or a supplied `extraRoot`) — closing a bypass where an in-home symlink pointed outside home. Fail-closed: a non-existent path (`ENOENT`) is rejected.

### Documentation

- **`docs/TEST_COVERAGE_TRADEOFFS.md`** (B-B199-3/6). New document recording accepted residual test-coverage risk: voice substrate live behaviour (real Whisper/Piper E2E impractical without the ~86 MB separate-download vendor binaries) and stub-only specs. `integrations-bicameral.spec.ts` + `voice-pack.spec.ts` carry STUB-ONLY header banners pointing at the trade-off doc; the real install/connect paths stay unit-covered.

## [5.1.6] - 2026-05-20

Bicameral HIGH cluster (B-BIC-16/19/20) + safety + concurrency batch (B-BIC-8/9/11/21/22/23) + upstream awareness (B-INT-3) + B-B199-2 Replay + Genome behavioral E2E + B-EM-2/B-EM-3 enforcement-mode polish + governance contract schemas (B190). SHIELD-sealed via PR #77 (Entries #378/#379/#380), PR #78 (Entry #382), and PR #79 (Entry #383). See `docs/plan-qor-bicameral-cluster-high.md`, `docs/plan-qor-bicameral-safety-concurrency.md`, `docs/plan-qor-b199-2-replay-genome-e2e.md`, `docs/plan-qor-em-2-em-3-enforcement-mode-polish.md`.

### Added

- **BicameralMcpClient type-surface refactor** (B-BIC-19). `callRaw(name, args)` promoted to public surface; 11 typed wrapper methods (`ingest`, `search`, `brief`, `judgeGaps`, `resolveCompliance`, `linkCommit`, `update`, `reset`, `dashboard`, `validateSymbols`, `getNeighbors`) each backed by a per-tool runtime guard. Parsers + guards extracted to `src/integrations/bicameral/parsers.ts` to keep `BicameralMcpClient.ts` under the 250-line razor. 25 new mocha cases (FX526 + FX527).
- **Vendored echo-mcp-server live-subprocess test** (B-BIC-20). Self-contained TypeScript MCP server using `@modelcontextprotocol/sdk/server/stdio`, declaring all 15 bicameral tool names with canned JSON satisfying Phase 1's runtime guards + side-channel file recording received arguments. Spawned via `process.execPath`. 5 cases (FX528) close the prior gap where Bicameral tests stubbed the transport rather than exercising it.
- **DriftToL3Mediator** (B-BIC-16). New mediator class subscribes to bicameral drift events + `qorelogic.l3Decided`. Drift status-edge enqueues L3 with `kind: 'bicameral.drift'` + `meta.decisionId` (de-dup by `bicameral:{decisionId}`). On L3 decide: APPROVED + APPROVED_WITH_CONDITIONS → `client.ratify('ratify')`; REJECTED → `'reject'`; DEFERRED/EXPIRED/UNDER_REVIEW/QUEUED no-op. `L3ApprovalRequest` extended with optional `kind?` + `meta?` fields (backward-compatible). 11 cases (FX529 + FX530).
- **UpstreamMonitor service** (B-INT-3). Polls GitHub `/releases/latest` + `/search/issues?q=repo:{slug}+is:open` every 24h (configurable via `failsafe.integrations.bicameral.upstreamPollMs`). Regex-allowlisted owner/repo slug (`^[\w.-]+/[\w.-]+$`) checked **before any** `httpFetch` call (fail-closed). Default repo `BicameralAI/bicameral-mcp` configurable via `failsafe.integrations.bicameral.upstreamRepoUrl`. 6 cases (FX532).
- **`GET /api/integrations/bicameral/upstream`** route (B-INT-3). Local-only access via `rejectIfRemote`. Returns last snapshot or 503 if monitor not wired / no poll completed. 4 cases (FX533).
- **`renderUpstreamRow`** Settings card helper (B-INT-3). Snapshot row (latest release tag + open-issue count) + version warning when installed bicameral-mcp is below floor (>=0.14) or at/above ceiling (<0.16). 6 cases (FX534).
- **pip version-floor pin** (B-INT-3). `BICAMERAL_PIP_SPEC = 'bicameral-mcp>=0.14,<0.16'` constant in install-handler; install bridge surfaces the spec in the spawned `pip install` command.
- **Replay sub-view behavioral E2E** (B-B199-2 Phase 1). 8 Playwright cases (FX535) exercise the Agents-tab Replay sub-view: empty state, list view active/completed counts, slice cap 20, click-card → detail navigation, step kind badge + diff stats, governance card (action + risk + confidence), back-button return, `agentRun` WS event triggers re-fetch.
- **Genome sub-view behavioral E2E** (B-B199-2 Phase 2). 6 Playwright cases (FX536) exercise the Agents-tab Genome sub-view: empty pattern + unresolved state, pattern-card render with failure-mode labels + counts, show-all toggle (filtered → all), slice cap 12, unresolved entries table with status indicators, `failureArchived` WS event triggers re-fetch.
- **Test-only renderer registry** (B-B199-2 Phase 0). Single-line addition at end of `command-center.js init()`: `if (typeof globalThis !== 'undefined') globalThis.__failsafeRenderers = renderers;`. Required by FX535.8 + FX536.6 WS-event synthesis. Benign in production: namespaced under `__failsafe*`, no secrets exposed.
- **`ModeTransitionHistory.hydrateFromLedger`** (B-EM-2). Replays `governance.modeChanged` events from META_LEDGER on activation so the in-memory ring buffer survives extension restart. 11 SG-035 cases (FX537): empty-ledger no-op, ordering preserved, cap 10 honored, non-governance / malformed entries ignored, idempotent on re-hydrate.
- **`FirstRunModePicker`** (B-EM-3). VS Code quickpick offering Observe/Assist/Enforce on initial install. Selection persists to workspace config; cancel-path no-op; suppressed when already configured. 6 cases (FX538) under vscode-test electron suite.
- **`BicameralMcpClient.connect()` concurrency cache** (B-BIC-8). In-flight connect promise cached and returned to concurrent callers; eliminates the race where parallel `connect()` invocations could spawn duplicate transports.
- **Idle disconnect TTL** (B-BIC-9). Client disconnects after a configurable idle period (default 15 minutes) of zero in-flight requests; new `failsafe.integrations.bicameral.idleDisconnectMs` setting. `idle-scheduler.ts` helper extracted with timer + inflight-counter.
- **Structured `isError` payload surfacing** (B-BIC-11). Bicameral tool errors now surface the structured detail in the thrown message rather than the bare `isError=true` flag, making MCP-side errors actionable.
- **MCP protocol/version floor assertion** (B-BIC-22). `protocol-floor.ts` helper asserts the MCP protocol version at connect-time and refuses to attach to servers below the floor (fail-closed).
- **Runtime type guard on `callTool()` return** (B-BIC-23). All BicameralMcpClient call paths run the parsed payload through a runtime guard before returning, preventing malformed shapes from leaking into downstream consumers.
- **Concurrent connect/disconnect race tests** (B-BIC-21). New test cases exercise interleaved `connect()` / `disconnect()` invocations to verify the in-flight cache + idle-disconnect interactions remain deterministic under contention.
- **`semver.ts` shared helper**. `compareSemver` extracted from `upstream-row.ts` into a sibling module so the new `protocol-floor.ts` can share the same lightweight semver compare (returns -1/0/+1; strips `v` prefix; ignores pre-release tags). Restores Section 4 razor compliance for `upstream-row.ts`.
- **Governance contract schemas** (B190). 8 JSON Schema 2020-12 contract definitions (`evaluation_request`, `ledger_entry`, `intent`, `failure_mode`, `approval`, `checkpoint`, `receipt`, `governance_config`) under `src/contracts/`, a typed `types.ts` surface with the `CONTRACT_VERSIONS` map, and fixture-match + well-formedness tests.

### Changed

- **Audit cycle 1 → 2 remediation** (cluster-high plan). Six findings closed before implementation: (F1) `qorelogic.l3Decided` payload-shape citation drift, (F2) UpstreamMonitor SSRF allowlist enforcement before fetch, (F3) deferred-tool count contradiction reconciled (11 wrappers, not 12), (F4) DEFERRED/EXPIRED verdict no-op mapping clarified, (F5) FX528 SG-035 violation (stub → live subprocess), (F6) false-empty "Open Questions: None" replaced with explicit list.
- **Safety + concurrency audit cycle 1 → 2 remediation**. APPROVE-WITH-MANDATORY-EDITS verdict closed via 3 must-fix + 2 should-fix items addressed inline. `BicameralMcpClient.ts` stands at 284L (over the 250-line razor by 34L); explicit exception documented in the audit since the 11 deferred-tool wrappers **are** the public API surface and extracting them would violate the type-surface contract.

### Fixed

- **Extension activation no longer crashes on hosts without a global `fetch`**. The B-INT-3 `UpstreamMonitor` was wired at activation time with the bare global `fetch`; on Node runtimes that do not expose `fetch`, this threw `ReferenceError` and aborted activation, leaving no `failsafe.*` commands registered. The HTTP transport is now feature-detected — falling back to a minimal `node:https` GET shim (`http-fetch-shim.ts`) — and the monitor wiring is isolated in a fail-safe `try/catch` so a non-critical background poller can never abort activation.

### Security

- **UpstreamMonitor SSRF allowlist** — `REPO_SLUG_RE = /^[\w.-]+\/[\w.-]+$/` enforced inside `poll()` **before** any `httpFetch`. Fail-closed branch sets error snapshot + warn log. Verified by FX532 cases 2 + 3 (invalid slug rejected pre-fetch; shell metacharacters in URL blocked).
- **MCP protocol-floor fail-closed** — Bicameral integration now refuses to attach to MCP servers below the supported protocol version (`protocol-floor.ts`); a non-conforming server reports a clean error instead of leaving the client in a half-initialised state.

## [5.1.5] - 2026-05-19

Bicameral MCP integration (v1) + stale-cache remediation (B192) + voice substrate extraction (B195) + enforcement-mode escalation UX (B194) + SentinelDaemon governance-file coverage residual fix-up (B193). See `docs/INTEGRATIONS.md`, `docs/governance-cache-invalidation.md`, `docs/governance-mode-transitions.md`, and `docs/plan-qor-sentinel-governance-extensions.md`.

### Added

- **Bicameral MCP — Integrations tab** (`docs/plan-qor-bicameral-mcp-integration.md`). New Command Center tab dedicated to third-party integrations. Bicameral is the only entry in v1; pattern extensible to additional MCP servers.
- **Install bridge** with solo / team mode picker. Runs `pip install bicameral-mcp` + `bicameral-mcp setup --mode {solo|team}` via list-form spawn against the operator's resolved Python; nothing is bundled in the VSIX. Live per-step progress over WebSocket.
- **BicameralMcpClient** — thin wrapper around `@modelcontextprotocol/sdk` stdio transport. Connect/disconnect is lazy; `history`/`preflight`/`drift`/`ratify` tools are surfaced through HTTP routes that scope to local-only access (`rejectIfRemote`).
- **Bicameral Settings card** — install state + version + `failsafe.integrations.bicameral.autoConnect` toggle + "Re-install / Re-setup…" shortcut. The autoConnect setting drives an opt-in background connect attempt at activation when the workspace is configured.
- **VS Code settings**: `failsafe.integrations.bicameral.command` (default `"bicameral-mcp"`), `failsafe.integrations.bicameral.pipCommand` (default `"pip"`), `failsafe.integrations.bicameral.autoConnect` (default `false`).
- **Bicameral surface** — `src/roadmap/routes/BicameralRoute.ts` (status + install + connect / disconnect / history / drift / ratify + auto-connect toggle); `src/extension/bootstrapBicameral.ts` (lazy client wiring + config-watcher rebuild + auto-connect probe); `src/roadmap/ui/modules/bicameral-settings-card.js`.
- 11 new mocha test files covering Bicameral client / install detector / install handler / Integrations tab JSDOM render / Bicameral card states (functional under SG-035).
- **`WorkspaceMutationBus`** (`src/shared/WorkspaceMutationBus.ts`) — targeted-path fs.watch aggregator with per-watcher debounce (200ms default, 1500ms META_LEDGER override). Pure Node stdlib; no new deps.
- **`LedgerManager.getLedgerPath()`** — public accessor for the SQLite db path; lets HubSnapshotService + TrustEngine resolve the watch target without threading `configProvider` through their constructors.
- **`HubSnapshotService.refreshChainValidity()`** — invalidates `cachedChainValid` + `chainValidAt` on bus-emitted db mutations; next `getCheckpointSummary()` re-walks the chain via `verifyCheckpointChain()`.
- **`HubSnapshotService.dispose()`** + **`PlanManager.dispose()`** + **`TrustEngine.dispose()`** — release bus subscriptions on extension deactivate.
- **18 new functional cases** across 5 test files (FX498/499/501/502/503 — all under SG-035 acceptance discipline).
- **Voice Pack — separate-download companion** (`docs/plan-qor-voice-substrate-extraction.md`). Resolves B195 marketplace-cap risk per the 2026-05-18 disposition decision (`feedback_voice_separate_download.md`). Base VSIX drops below the 30 MB ceiling; voice features become opt-in.
- **Install / uninstall paths**: VS Code commands `failsafe.installVoicePack` + `failsafe.uninstallVoicePack`. Settings tab Voice Pack card with 4-state render (`absent` / `installed v<X>` / `stale` / `error`) including explicit **Dismiss** + **Retry** on terminal errors (per F1 audit-cycle-1 remediation; satisfies SG-FakeProgress-A Live-Progress Invariant).
- **Voice substrate**: `src/voice-pack/{types,voice-pack-detector,install-handler,index}.ts`. Pure Node 20+ stdlib (`fetch` with redirect-follow + bounded GitHub-host allowlist; `crypto`, `stream`, `child_process` for `tar -xzf`). No new npm dependencies.
- **ConsoleServer static-mount overlay**: `setupAllRoutes()` mounts `globalStorageUri/voice-pack/` at `/vendor` BEFORE the default uiDir static, so pack files take priority when installed. Falls through gracefully when absent (existing `error:piper_not_vendored` engine error path engages — surfacing the Install Voice Pack affordance via `voice-controller.probeVoicePack()`).
- **VoicePackRoute**: `GET /api/integrations/voice-pack/status` (probe + version + missingFiles + diskUsageBytes), `POST /api/actions/install-voice-pack` (bridge with WS-broadcast per-phase progress), `POST /api/actions/uninstall-voice-pack`.
- **Voice-pack build pipeline**: `scripts/package-voice-pack.cjs` writes `dist/failsafe-voice-pack-<version>.tar.gz` + `.sha256` + manifest.json with every-file sha256. `.vscodeignore` excludes the heavy vendor paths from VSIX packaging. `scripts/validate-vsix.cjs` adds a 30 MB ceiling assertion (B195 acceptance gate).
- **18 voice-pack functional tests** across 6 test files (FX491–FX497).
- **Enforcement-mode escalation UX** (`docs/plan-qor-enforcement-mode-escalation-ux.md`, B194 resolution). New `governance.modeChanged` typed event + `ModeTransitionHistory` in-memory ring (cap 10) + populated `hub.governanceModeState` + `hub.recentModeTransitions`. Monitor sidebar gains an observe-mode advisory banner ("Switch to assist or enforce when ready →") that links to Settings; Governance tab gains a "Mode Transitions" feed with reverse-chronological rows showing previous/new mode + reason + actor + timestamp. BreakGlass payloads enriched with full transition context (cycle-2 reviewer caught the `system:auto-expire` vs ledger `system:break-glass-timer` mismatch — actor strings now coherent). Closes silent `hub.governanceModeState` non-population bug surfaced in research. 4-cycle audit PASS via independent architect-reviewer (SG-007 Option B). 5 tests (FX504-FX509 — 20 unit cases + 3 Playwright cases). See `docs/governance-mode-transitions.md`.
- **B199 Phase 2 — Settings tab E2E + B-EM-4 harness unblocker** (`docs/plan-qor-b199-phase2-settings-e2e.md`). 3 active FX512/FX513 Playwright cases + 2 deferred-skip pending B197 merge.
- **B199 Phases 3-9 — full Command Center tab coverage + WS broadcast matrix + bus-renderer E2E**. Phase 3 (Voice Pack installed state, FX519). Phase 4 (Agents tab structural, FX520). Phase 5 (Workspace tab, FX521). Phase 6 (Governance tab, FX522). Phase 7 (Overview tab, FX523). **All 6 top-level Command Center tabs now have structural Playwright coverage.** Phase 8 (WS broadcast matrix — 16 broadcast types, FX524 — closes deep-audit HIGH). Phase 9 (real disk META_LEDGER → /api/hub → Monitor compact-UI E2E, FX525 — closes deep-audit CRITICAL "B191 bus→renderer fixture-only"). Remaining B199 gaps (B-B199-1..6) captured in BACKLOG for follow-on cycles.
- **Bicameral integration quick wins (B-BIC-1..5)** (`docs/plan-qor-bicameral-quickwins.md`). Five high-leverage fixes: (1) ratify → META_LEDGER USER_OVERRIDE; (2) extension-deactivate disposer + rewire cleanup; (3) transport.onclose crash recovery; (4) BicameralMcpClient.getCapabilities() listTools cache; (5) install stdout/stderr ANSI + C0 sanitizer. 15 new FX514-FX518 cases.
- **B197 qor-logic version-floor surfacing**: hub payload now carries `installedVersion` + `meetsFloor`; Settings card surfaces a `cc-qorlogic-floor-warning` block when below `MIN_QOR_LOGIC_VERSION`. FX511 (6 cases).
- **Bicameral UI design-token cleanup** (`bicameral-card.js`): 6 fabricated/wrong theme tokens corrected; inline `.cc-card` / `.cc-btn` overrides removed so the canonical CSS classes own glass-morphism + radius + padding.
- **B193 SentinelDaemon governance-file coverage residual fix-up** (`docs/plan-qor-sentinel-governance-extensions.md`). Phase 60 §2 Track C pre-shipped most of B193 (`.md`/`.yaml`/`.yml`/`.json` watched, `.failsafe/**` blanket exclusion removed). Residual cycle: corrects aspirational whitelist paths to canonical fs locations (`.failsafe/risks/risks.json`, `.failsafe/manifest/active_intent.json` + `manifest/intents/` glob); adds `docs/META_LEDGER.md` + `docs/BACKLOG.md` + `docs/plan-*.md` to whitelist and `isGovernanceSurface` priority-boost (verdict pipeline now sees these as `'high'` priority); broadens `.failsafe/governance/` to a blanket prefix that covers 70+ on-disk variant files (AUDIT_REPORT_*, SESSION_STATE_*, RESEARCH_BRIEF_*) the suffix-equality match dropped silently. 10 new SG-035 functional cases (FX510). 1-cycle architect-reviewer PASS.

### Changed

- **`ConsoleLifecycleService.watchMetaLedger`** routes through `WorkspaceMutationBus` when present (1500ms debounce preserved); falls back to raw `fs.watch` when no bus is provided (test back-compat).
- **`bootstrapCore`** constructs `WorkspaceMutationBus` alongside `EventBus`; **`bootstrapServers`** + **`bootstrapQorLogic`** thread it to ConsoleServer + TrustEngine. All bus-receiving constructor parameters are optional (existing test fixtures without bus continue to work unchanged).

### Not done — see B-SC-6

L3ApprovalService was originally listed as a B192 stale-cache victim. Audit cycle 1 surfaced that its backing `VscodeStateStore` wraps `vscode.Memento` (in-process VS Code state with no filesystem path to watch). The existing `HubSnapshotService.buildHubSnapshot` pull-call to `qorelogicManager.refreshL3Queue?.()` handles its in-process staleness. An EventBus-driven alternative (publish `qorelogic.l3Queue.mutated` on writes) is deferred to a separate cycle.

## [5.1.0] - 2026-05-14

Minor release. Model-sourced Risk Register (coding agents author risks via MCP tool, chat subcommand, or auto-derivation from SHIELD lifecycle), Install Skills UX expansion (live progress + per-host picker + dry-run preview + LiveProgressInvariant doctrine), OpenVSX/VS Code Marketplace alignment at v5.0.0 baseline, brand sweep (eliminated all `Qore` legacy spellings), release pipeline safety gate (production environment approval), full SRE panel attribution (Microsoft AGT + Qortara), 36 new FX415–FX420 functional tests, and a complete brand + skill-source-attribution sweep. Supersedes the unreleased 2026-05-06 draft.

### Added

- **Model-sourced Risk Register** (`plan-qor-model-sourced-risks`). Risks now come from the coding model itself: agents call the new MCP tool `failsafe.create_risk`, use the `@failsafe /risk` chat subcommand to draft + confirm risks, or let FailSafe auto-derive risks from SHIELD lifecycle signals (GATE VETO ledger entries, DEBUG entries, Shadow-Genome `genome.failureArchived` EventBus emissions). Each risk records its source (`mcp` / `audit-veto` / `debug` / `shadow-genome` / `manual` for legacy migrations) plus structured `derivedFrom` lineage that powers de-duplication.
- **Install Skills UX expansion** (`plan-qor-install-skills-ux-expansion`, sealed at META_LEDGER entry #371). Modal install flow with live progress + retry, operator-editable host registry, per-host skill picker, dry-run preview, and a new workspace `LiveProgressInvariant` doctrine + lint helper. Upstream `Qor-logic#58` filed for canonical SDK amendment.
- **OpenVSX v5.0.0 catch-up publish workflow** (`.github/workflows/openvsx-catchup.yml`). Manual `workflow_dispatch` job that publishes a specific historical version to OpenVSX only, used to align OpenVSX with VS Code Marketplace when a prior release was direct-`vsce`-published. v5.0.0 was published to OpenVSX on 2026-05-14 via this workflow.
- **Microsoft Agent Governance Toolkit + Qortara attribution** on the SRE panel (disconnected setup card + persistent footer link in both states).
- **Sync Framework asymmetry fix**: `FrameworkSync.propagate(systemId)` now calls `AgentConfigInjector.inject(system)` after the dir-copy step, so picking a single target (e.g. GitHub Copilot) actually writes the governance block to `.github/copilot-instructions.md`. Toasts now report what was written (`framework dir copied, updated <path>`) instead of claiming success on no-ops.

### Changed

- **Skill source attribution**: skills sourced from the Qor-Logic Python package now display as `qor-logic`; FailSafe-authored skills display as `FailSafe`; external skills (ElevenLabs, Three.js, …) keep their actual upstream credit. Implemented in `roadmap/services/SkillFrontmatter.ts:resolveSourceCredit` and `SkillParser.ts` default attribution.
- **Brand spelling sweep**: eliminated all `QoreLogic` / `Qorelogic` / `QORELOGIC` / standalone `Qore` / `qore` casings across `FailSafe/extension/src/` and `package.json`. User-facing strings hyphenated to "Qor-Logic"; PascalCase identifiers remain `QorLogic`. Files renamed: `bootstrapQoreLogic.ts` → `bootstrapQorLogic.ts`; `QoreLogicManager.ts` → `QorLogicManager.ts`; `QoreRoute.ts` → `QorRoute.ts`; `QoreRuntimeService.ts` → `QorRuntimeService.ts`. The lowercase compound `qorelogic` (config-key namespace + source directory) is held in a deferred-rename bucket pending a settings-migration plan.
- **Organize-UX hotfix** (sealed #364): contextual-summary helper now reports actual organize action outcomes instead of the misleading "Bootstrap: 1 step(s) deferred" message. Host-side decision V1 Path C wired; organize callbacks now surface success/no-op/failure separately.

### Removed

- **`failsafe.addRisk` command + QuickPick wizard** deleted from `commands.ts`, `RiskRegisterProvider.ts`, and `package.json`. Manual risk entry is replaced by the model-sourced surfaces above. Legacy risks in `risks.json` are auto-migrated to `source: 'manual'` on first load.
- **Redundant skill prefixes**: 10 `ql-*.md` skills + 10 `ql-*` reference templates + 3 `qore-*` script directories deleted from user-scope `~/.claude/`; 13 `ql-*.md` commands + 7 `ql-*` agents + 4 `ql-*` references deleted from project-scope `.claude/commands/`. Canonical `qor-*` skills remain.
- **Hearthlink skill leftovers** (6 files) deleted from `.claude/commands/` — they belonged to a separate project.

### Fixed

- **Banner Install Skills button** previously POSTed to `/api/actions/scaffold-skills` with no body and silently triggered a server-side VS Code QuickPick that opened in the extension host (invisible from the browser tab). Now opens the same in-browser modal the Settings card uses, with host pickers, scope radios, and preview button.
- **`/api/actions/scaffold-skills/preview` 404**: the SPA-fallback middleware in `ConsoleRouteRegistrar.setupAllRoutes` was registered before the qorlogic routes (added after `consoleServer.start()`), so any `/api/*` POST not matched by core routes hit the fallback. Split the SPA fallback into a separate `finalizeFallback()` step that bootstrap calls after `registerQorlogicRoutes(...)`. Preview POST now reaches its handler.
- **Install Skills 501** "Scaffold not available" from the Settings card: `ConsoleServer.setupAllRoutes()` was being called in the constructor, so `ApiRouteDeps` captured `scaffoldSkills`/`scaffoldWithWebOptions` as `null` before `bootstrapServers.ts` wired them. Moved `setupAllRoutes()` into `start()` so callback wiring happens first.
- **Brainstorm canvas TypeError**: `.showNavInfo(false)` was called unconditionally on `ForceGraph`'s chain, but the method only exists on `ForceGraph3D`. Guarded inside the 3D branch.
- **Active build step ↔ Recommended next step inconsistency** on the Monitor: when META_LEDGER is IDLE but an active plan phase is highlighted in the track, the next-step tile no longer says "Run /qor-plan…" — it now derives from the same active phase title the track uses.
- **Long install summary** ("Installed 160 skill(s) at /path/.claude/agents/, /path/.claude/skills/, …") collapsed into a digestible headline + collapsible per-host detail blocks.

### Security

- **Release pipeline: manual approval gate** added between `build` and the two `publish-*` jobs in `.github/workflows/release.yml`. Both `publish-vscode` and `publish-openvsx` now require an explicit `production` environment review before they fire, preventing accidental same-second dual-publishes if `validate:vsix` misses a regression.

### Test discipline

- 36 new functional tests (FX415–FX420 series) for the model-sourced Risk Register: `RiskManager` migration + dedup, `failsafe.create_risk` MCP tool handler, `RiskAutoDerivation` derivers + mappers, `AuditGateArtifactReader`, `RiskChatHandler` draft/confirm, and Risks UI source-pill rendering.

---

## [5.1.0-pre.2026-05-06] (unreleased draft — superseded by 5.1.0)

The content below was authored on 2026-05-06 as an in-progress draft for v5.1.0 but was never tagged/published. It is preserved here verbatim for historical reference; all of its features are also captured in the `## [5.1.0] - 2026-05-14` release above.

Minor release. Comprehensive E2E coverage methodology + release-class CI gate (B199 Phase 1) + Monitor B191 functional proof. Surfaced and fixed three latent Monitor bugs that unit tests could not catch — most notably a missing `type="module"` on the Monitor's bootstrap script that meant the compact UI never actually rendered in production.

### Added

- Comprehensive E2E coverage methodology — Playwright test harness (`serveCompactUI` + `ledgerFixtures` helpers) and two new specs: `monitor-shield-progression.spec.ts` (8 cases covering all 6 SHIELD phases + plan title + WS-broadcast re-render) and `monitor-staleness.spec.ts` (1 connected → disconnected → reconnected lifecycle case).
- Release-class CI coverage gate — `scripts/check-e2e-coverage.cjs` invoked from the pre-push hook when the active plan's `change_class` is `feature` or `breaking`. Blocks pushes whose staged surface files (UI, ConsoleServer routes, commands) lack a corresponding `*.spec.ts`, unless a `[no-e2e: <reason>]` token appears in a commit message in the push range. Hotfix is exempt.
- New npm scripts: `test:e2e` (runs Playwright) and `test:e2e:coverage` (runs the gate against currently-staged files).

### Fixed

- Monitor never bootstrapped in production (root cause behind B191's user-visible "Monitor doesn't see my work"). The compact UI's `<script src="roadmap.js">` was missing `type="module"` despite using ES module imports — the script silently failed to execute. No prior unit test exercised UI JS execution, so this was invisible.
- SEAL phase rendered "Substantiate active" instead of "all four done". `PHASE_INDEX_MAP['SEALED']` was 4 (same as SUBSTANTIATE) in `monitor-render.js`. Bumped to 5 so SEAL correctly renders all four steps `done`.
- IDLE phase rendered "Plan active" instead of "all pending". Added an IDLE early-return branch in `getPhaseInfo` that fires only when no other phase signal exists; preserves existing IDLE+runState and IDLE+recentCompletions fallthrough semantics.

### Test discipline

- Mocha suite: 958 → 959 passing (+1 net from new `IDLE with empty plan → index -1` assertion); 1 pending; 0 failing.
- Playwright suite: 7 → 16 passing (+9 net); 1 pre-existing skip; 0 failing.

### Known divergence

- Open VSX still shows v4.9.9; v5.0.0 published to VS Code Marketplace but Open VSX replication did not fire and no git tag was created for v5.0.0. v5.1.0 release will need to either leapfrog Open VSX from 4.9.9 → 5.1.0 directly, or backfill-publish v5.0.0 to Open VSX first.

## [5.0.0] - 2026-04-25

Major release. Public reveal of the FailSafe / FailSafe Pro product split. The v4 bundled-skills installer is replaced by ingestion from the [`qor-logic`](https://pypi.org/project/qor-logic/) PyPI package. Skills now begin with `qor-` (was `ql-`). The Command Center reads workspace truth — META_LEDGER, BACKLOG, plan files, audit reports, and CHANGELOG — instead of showing empty placeholder state.

### Added (Round 3 — Voice & Brainstorm UX, 2026-05-06)

- Multilingual speech-to-text — Whisper model picker (tiny / base / small) and BCP-47 language selector in the Voice settings section. Default model switched from English-only `whisper-tiny.en` to multilingual `whisper-tiny`.
- Voice status badge — single-element DOM badge in the Brainstorm right panel surfacing the unified state stream (idle / listening / processing / speaking / error:*).
- Auto-match voice — when enabled, switching STT language auto-selects the matching Piper TTS voice from a 12-language catalog.
- TTS error transparency — Piper vendor presence failures (`piper_not_vendored`, `wrong_mime`, `init_failed`) now surface to the status badge instead of silent console.info.
- Brainstorm history limit — configurable (1-100, default 10) via Settings → Brainstorm; replaces the hardcoded 10-entry cap.
- Brainstorm export — JSON download filename now includes timestamp + timezone offset (`brainstorm-YYYY-MM-DD-HH-MM-SS±OOOO.json`); avoids same-session overwrites.
- Notifications severity gating — Settings → Notifications card lets operators silence info-tier toasts independently from error-tier toasts.

### Changed (Round 3)

- ConsoleServer decomposition — extracted `QoreRuntimeService` and four route handlers (`QoreRoute`, `FeatureStatusRoute`, `SkillsApiRoute`, `HookRoute`) from `ConsoleServer.ts`. Internal architectural refactor; no user-visible API change.
- Voice controller — multi-subscriber state and analyser fan-out with cache-and-replay on subscribe; late subscribers (badge, modal visualizer) now see current state on attach.

### Security (Round 3)

- HTML escape discipline applied across all settings and overview surfaces that interpolate store-derived or hub-derived values into innerHTML — closes XSS pathways in Voice settings, audio device data attributes, TTS voice picker, ticker bar (Sentinel mode), risk register cells, governance Sentinel card, and Settings Configuration card.
- Allowlist hardening — Whisper model id validated against `ALLOWED_WHISPER_MODELS` (3 entries) at construction and on swap; Piper voice id validated against `ALLOWED_PIPER_VOICES` (20 entries). Closes localStorage-XSS supply-chain pivot to arbitrary HuggingFace / Piper voice fetch.
- Voice substrate hardening — model swap reentry guard, idle/processing analyser cache invalidation, listener fan-out snapshot iteration, modal `onMicButton` wrapper restoration, idempotent destroy.

### Added (Round 2 — Install UX, 2026-05-05)

- Install transparency report (#49): every install action emits a structured `QorLogicInstallReport` with one invocation per phase (`python-probe`, `pip-install`, `qorlogic-install` per host, `provenance`, `refresh`). The Settings card renders the report inline; failed steps stay visible with command + stderr until the next run.
- Host/scope QuickPick (#50): the Settings card "Install QorLogic Skills" button now prompts for hosts (multi-select) and scope (`repo`|`global`) before installing; selections persist to workspace state and pre-check on re-run.
- New command palette entry "FailSafe: Install QorLogic Skills (defaults)" (`failsafe.installQorLogicSkillsDefaults`) — bypasses the QuickPick and installs `[claude, codex]` at `repo` scope, intended for automation and the command palette quick path.
- "Show Output" button on the Settings install card focuses the FailSafe (QorLogic) output channel via the new `POST /api/actions/show-output` route.

### Changed (Round 2)

- **Internal ABI break**: `ConsoleServer.setScaffoldCallback` now expects `() => Promise<QorLogicInstallReport | null>` (was `Promise<{scaffolded, skipped, error?}>`). The single source-of-truth report type lives in `installSkillsReport.ts`.
- Broadcast event `skills.install.progress` payload field renamed `step` → `invocation`. The new shape carries `phase`, `host`, `scope`, `command`, `interpreter`, `destination`, `installedCount`, `version`, `summary`, `error`, `stderrTail`.
- `createInstallSkillsHandler` signature: `(context: ExtensionContext, ingestor, callbacks?, mode='prompt')`. Mode `'defaults'` bypasses the QuickPick.
- `QorLogicSkillIngestor` exposes `probePython`, `ensurePackageInstalled`, `installHost(host, scope)`, `getWorkspaceRoot`, `rescanWorkspace` for orchestrator-driven granular installs.

### Added

- `qor-logic` package installer with auto-detected Python interpreter (setting → ms-python → probe).
- `QorLogicSkillIngestor` runs `qorlogic install --host claude --scope repo` and `--host codex` by default; supports `kilo-code` and `gemini` opt-in.
- Synthesized `SOURCE.yml` provenance for ingested skills.
- `failsafe.openFailSafeProDownload`, `failsafe.bootstrap`, and `failsafe.organize` commands.
- Always-visible "Install / Refresh QorLogic Skills" + "Bootstrap Workspace" buttons in the Command Center Settings tab.
- Setting `failsafe.qorlogic.pythonPath` for explicit Python override.
- Workspace-truth UI: META_LEDGER backfills Operations Phases / Recent Verdicts / Recent Completions; BACKLOG populates Risks tab; new Latest Audit + Recent Releases cards on Overview.
- New docs: `FailSafe/extension/docs/v5/QORLOGIC_SKILL_INGESTION.md`, `FailSafe/extension/docs/v5/PRO_INTEGRATION.md`.

### Changed

- "Install Skills" button label → "Install QorLogic Skills".
- The bundled `dist/extension/skills/` is no longer included in the VSIX.
- Extension `description` revised off the legacy "AI governance platform" framing.
- Skill IDs migrated from `ql-*` to `qor-*` across source and project-local skill directories.
- Operations Phases stat now reflects META_LEDGER reality (was 0/0); render capped at 10 cards plus a summary row.
- **Phase 1 ConsoleServer decomposition (B164/B165)** — extracted 4 portable, framework-agnostic modules: `WebSocketManager` (28L), `TransparencyLogger` (35L), `RiskRegisterManager` (30L), `EventSubscriptionManager` (185L; 12 EventBus listeners covering governance verdicts, sentinel events, transparency, and run lifecycle). ConsoleServer 1371→1177L (-194L). Foundation for the Phase 2 decomposition delivered in Round 3.
- "About FailSafe Pro" command + Settings card open the product/learn page <https://mythologiq.studio/products/failsafe-pro> (was: opened the download URL despite being labeled "About") (#46).

### Fixed

- Operations Phases stat: `completed > planned` no longer renders as `4 / 0`; `planned` floored to `completed` so each completion implies at least one plan (#47).
- Install QorLogic Skills: progressive step display, button disables while running, hub refresh on completion (#48).

### Removed

- v4 bundled-skill copy path (`bootstrapServers.ts` direct `dist/extension/skills` → `.claude/skills` copy). Existing user skills already on disk are not touched.

### Security

- All subprocess invocations use list-form `spawn(cmd, args)`; no shell strings. pip install bounded by 120 s timeout, qorlogic install per host by 180 s timeout.

## [4.9.9] - 2026-03-17

### Fixed

- Install Skills button works — bundled skills path corrected (B189).
- Brainstorm Prep Bay visible in Command Center right panel (B188).
- TabGroup sub-view right panels surfaced for all 3 tab groups.

## [4.9.8] - 2026-03-17

### Fixed

- Error budget excludes resolved verdicts — VETO→PASS cycles no longer inflate burn gauge (B187).

### Added

- Clickable blocker/error budget navigation to Command Center audit log (B185).
- SRE Activity Feed with ALLOW/DENY/AUDIT badges (B179).
- SRE SLO Dashboard with multi-SLI grid and error budget gauges (B180).
- SRE Fleet Health with per-agent status, circuit breaker state, and success rate (B180).
- Configurable adapter base URL replacing hardcoded default (B178).

### Architecture

- Sentinel rendering extracted to `sentinel-monitor.js` (roadmap.js 632→486L) (B186/D33).
- SRE types extracted to `SreTypes.ts` with v2 schema (B178).

## [4.9.6] - 2026-03-16

### Added

- SRE panel: active policies, agent trust scores, OWASP ASI coverage, and SLI compliance indicator via `agent-failsafe` REST bridge (B167-B169).
- SRE toggle in Monitor sidebar for switching between Monitor and SRE views (B168).
- `agent-failsafe` Python package gains `server` optional extra with FastAPI `/sre/snapshot` endpoint.

## [4.9.5] - 2026-03-16

### Added

- Agent Run Replay: execution trace capture and step-by-step replay panel for agent session debugging (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization and sentinel event adapter (B147).
- Marketplace README repositioned as "AI Coding Safety" category.

### Security

- 3 XSS/path-traversal/re-entrancy fixes in replay panel and run recorder.

## [4.9.2] - 2026-03-13

### Added

- META_LEDGER file watcher for auto-refresh of governance state in Monitor (B140).
- Shared hook sentinel utility for unified hook toggle management (B107).
- Release pipeline verification test coverage (B108/B137/B138/B139).

### Fixed

- GovernancePhaseTracker recognizes SUBSTANTIATED verdict correctly (B140).
- Hook toggle convergence between Console and VS Code settings (B107).

## [4.9.0] - 2026-03-13

### Added

- Agent Run Replay: execution trace capture and step-by-step replay panel for agent session debugging (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization and sentinel event adapter (B147).
- Marketplace README repositioned as "AI Coding Safety" category.

### Security

- 3 XSS/path-traversal/re-entrancy fixes in replay panel and run recorder.

## [4.8.0] - 2026-03-13

### Added

- Agent Execution Timeline: step-by-step visualization of agent actions with governance decision overlay (B142).
- Risk & Stability Indicators: real-time agent health status with observe-mode notification and fallback logic (B143).
- Shadow Genome Debugging Panel: interactive browser for failure patterns with filtering and pattern details (B144-B145).
- New commands: `FailSafe: Agent Health Status`, `FailSafe: Agent Execution Timeline`, `FailSafe: Shadow Genome Debugger`.

## [4.7.2] - 2026-03-11

### Fixed

- L3 escalation resilience: Added try/catch blocks around L3 queuing in `L3ApprovalService` and `VerdictRouter` to prevent potential crashes on connection failures.

### Performance

- Concurrent Folder Manifold Calculation: Shifted folder processing from sequential to concurrent using `Promise.all`, showing improved execution time during workspace initialization.

## [4.7.0] - 2026-03-10

### Added

- Agent Marketplace: curated catalog of 11 external agent repositories with HITL security gates.
- Security Scanner integration: Garak/Promptfoo CLI for vulnerability scanning with risk grades.
- Microsoft Agent Governance Toolkit Adapter: Python bridge to agent-os, agent-mesh, agent-hypervisor, agent-sre.
- Trust tiers for marketplace items: unverified → scanned → approved → quarantined.

### Changed

- Skills tab extended with Marketplace view toggle.
- Connection module handles marketplace/adapter WebSocket events.
- Ledger types include MARKETPLACE_INSTALL and MARKETPLACE_UNINSTALL events.

## [4.6.6] - 2026-03-09

### Added

- Repository Governance as a Service: workspace compliance validation with grading (A-F) and remediation guidance.
- Multi-workspace server registry for independent FailSafe instances across VS Code windows.
- Compliance metric in Monitor UI with grade display and violation tooltips.
- S.H.I.E.L.D. phase tracker parsing META_LEDGER.md for governance state awareness.
- Workspace selector in Command Center for switching between active instances.

### Changed

- Hub snapshot enriched with workspace identity and compliance data.
- Dynamic port propagation replaces hardcoded 9376.

## [4.6.5] - 2026-03-10

### Changed

- Cross-agent skill consolidation: 200+ files across 7 locations → canonical `.claude/skills/` + `.claude/agents/` + automated transpilation.
- Skills migrated from flat `.claude/commands/qor-*.md` to directory-based `.claude/skills/qor-*/SKILL.md` with YAML frontmatter.
- Agent definitions separated to `.claude/agents/qor-*.md` with subagent frontmatter.
- ModelAdapter output directories corrected for Claude, Codex, Gemini, Copilot, and Cursor.
- VSIX bundling de-complected: agents removed from skill pipeline, directory-based patterns added.
- Antigravity restructured from Genesis/Qorelogic to skills/agents layout.
- `FailSafe/Claude/` (20 stale duplicate files) deleted.
- 12 quarantined skills cleaned up (9 superseded removed, 3 archived).
- `AGENTS.md` created at repo root for cross-agent compatibility.

## [4.6.4] - 2026-03-09

### Fixed

- Trust state was transient: event-driven invalidation via EventBus replaces stale init-only cache. Mutations persist to SQLite and cache rebuilds from DB on trust updates, quarantines, and releases.
- Trust timestamps fabricated: `getTrustScore()` now returns DB `updated_at` instead of `new Date()`. Audit trails reflect real mutation times.
- Checkpoint chain validity assumed on startup: now auto-verified during initialization; failures recorded.
- Command Center version hardcoded to 4.4.0: now reads from package.json.

### Added

- Trust persistence with optimistic locking, version-based concurrency control, and exponential backoff retry for concurrent agent trust updates.
- Three trust event types (`trustUpdated`, `agentQuarantined`, `agentReleased`) for EventBus cache invalidation.

### Changed

- TrustEngine decomposed: 449L → 3 files (223L + 167L + 40L) for Section 4 compliance.

## [4.6.3] - 2026-03-08

Incremental hotfix for Monitor & Command Center parity. Further refinements forthcoming.

### Fixed

- Console Server `express.static` missing `dotfiles: "allow"` — all CSS/JS/image assets silently 404'd under dotfile install paths.
- Monitor sidebar: active build/debug session tracking via IDE lifecycle events.
- "Recently Completed" falls through to checkpoint history when plan data is empty.
- L3 approval queue auto-prunes expired items on read (SLA enforcement).
- Command Center: verdict alert banner, live network activity, verdict-aware mission strip.
- XSS hardening on Command Center overview innerHTML interpolations.

## [4.6.2] - 2026-03-08

### Fixed

- Console Server 404 on dotfile install paths (`.vscode/`, `.antigravity/`). Latent bug in Express `sendFile()` dotfile protection.

## [4.6.1] - 2026-03-08

### Fixed

- Missing sidebar SVG icon in activity bar.
- Release Pipeline branch policy validation for tag-based CI.
- Icon reference validation added to release preflight gate.

## [4.6.0] - 2026-03-08

### Changed

- Section 4 Razor decomposition: ConsoleServer 3265L→1124L, stt-engine 400L→249L, EnforcementEngine 250L→122L with 16 extracted modules.
- Voice brainstorm bug fixes: rAF batching, TTS error handling, node taxonomy, waveform visualizer, truncation logging (B119, B120, B125, B129, B132).
- Hook toggle UI and release gate enhancements (B107, B108, B138, B139).
- Socket.dev compliance: deprecated API removal, post-build pattern sanitization.
- Governance doc storage migrated to `.failsafe/governance/`.

## [4.5.1] - 2026-03-07

### Fixed

- Activation crash when ledger database is unavailable
- CI validator parameter mismatch in `validate.ps1`

## [4.5.0] - 2026-03-07

### Changed

- Skill Discovery now carries tags and source credit; Skills panel uses type-ahead tag filter with autocomplete.
- Brainstorm, STT, and ideation modules refined for cleaner runtime behavior.
- CI VSIX guardrails workflow consolidated to single-source build with proprietary content scan.
- Governance skill lifecycle cohesion: 19 skills with next-step routing, canonical routing table, /qor-document authoring skill.

---

## [4.4.1] - 2026-03-06

### Changed

- Extension activation now uses explicit command/view/chat activation events instead of startup-wide activation.
- Socket policy manifests updated to ignore accepted capability classes used by design.
- Socket badge/version markers aligned to `4.4.1` across docs.

---

## [4.4.0] - 2026-03-06

### Changed

- Version synchronization with extension/package release markers and marketplace documentation.
- Mindmap terminology alignment across operator-facing documentation and Command Center navigation.

---

## [4.3.2] - 2026-03-04

> _"Performance & Polish"_

### Changed

- **Checkpoint Integrity Flow** - Full chain verification moved out of heartbeat-critical paths and exposed through explicit verify actions in Console UI.
- **Robust Local Server Startup** - API and roadmap server startup paths now resolve available ports within fallback ranges to reduce activation failures.
- **Message-Driven Webview Refresh** - Transparency and Economics panels now update incrementally via postMessage after initial render.
- **Operator Docs Rewrite** - Bundled extension help documents now align to the unified Console tab model and current command surface.

### Documentation

- Voice-brainstorm docs now reflect shipped voice + manual workflows and document runtime vendor prerequisites.

---

## [4.3.1] - 2026-03-03

> _"Security Hardening"_

### Fixed

- **SQL Injection Protection** — `SchemaVersionManager.hasColumn()` now validates table names against a strict whitelist (`shadow_genome`, `schema_version`, `soa_ledger`) before PRAGMA queries, preventing dynamic table name injection.
- **XSS Prevention in LivingGraphTemplate** — Graph tooltip and stats elements now HTML-escape all dynamic node data (`label`, `type`, `state`, `riskGrade`) before rendering. Stats element switched from `innerHTML` to `textContent` for numeric-only content.
- **XSS Prevention in RevertTemplate** — Revert result display now HTML-escapes step status, name, detail, and error messages before innerHTML assignment.
- **README Logo Path** — Corrected logo reference from root `icon.png` to `FailSafe/extension/icon.png` to display the current FailSafe branding.

---

## [4.3.0] - 2026-03-02

> _"Telemetry Loop"_

### Added

- **Pre-Commit Guard** (`failsafe.installCommitHook`, `failsafe.removeCommitHook`) - Installs an authenticated thin-client git hook that queries `GET /api/v1/governance/commit-check` before commit.
- **Provenance Tracking** - Records AI authorship attribution to the SOA ledger as `PROVENANCE_RECORDED` events and exposes artifact history via `GET /api/v1/governance/provenance/:artifactPath`.
- **CI Governance Context Export** - Adds `tools/export-governance-context.sh` and release workflow artifact upload so shipped builds retain public governance context.

### Changed

- Release documentation, README surfaces, and packaged extension metadata now align on `v4.3.0`.
- Bundled extension operator docs now ship with the VSIX for component-level and process-level guidance.

### Fixed

- Quality sweep remediation sealed for `v4.3.0`: IPv6 SSRF coverage in `GovernanceWebhook`, dead-code removal in `capabilities.ts`, and Razor compliance restoration in `SentinelRagStore.ts`.

## [4.2.0] - 2026-02-27

> _"The Answer to the Ultimate Question of Life, the Universe, and Everything."_

### Added

- **Multi-Agent Governance Fabric** — Runtime detection and governance injection for Claude CLI, Copilot, Codex CLI, and Agent Teams via `SystemRegistry` and `FrameworkSync`.
- **Governance Ceremony** (`failsafe.onboardAgent`) — Single-command opt-in/opt-out for governance injection across all detected AI agents.
- **First-Run Onboarding** — Multi-agent governance coverage options during initial setup.
- **Agent Coverage Dashboard** — Console route showing detected agents, injection status, and compliance state.
- **Undo Last Attempt** (`failsafe.undoLastAttempt`) — Checkpoint-based rollback with integrity verification.
- **Discovery Phase Governance** — DRAFT → CONCEIVED status gate with ledger-tagged graduation markers.
- **Terminal Correlator** — Maps terminals to agent systems for cross-agent audit correlation.
- **Workflow Run Model** — Run/stage/gate/claim/evidence contracts aligned to governance lifecycle.
- **Intent Schema v2** — `schemaVersion`, `agentIdentity`, and `planId` fields with v1 migration.
- **Verdict Replay Batch** — Bulk verdict replay with timing-safe hash comparison.
- **CheckpointManager** — Bridges QoreLogic ledger and Sentinel substrates for checkpoint metrics.

### Changed

- `SystemRegistry` extended with terminal-based agent detection.
- `RoadmapServer` gains `setSystemRegistry()` deferred setter.
- `QoreLogicSubstrate` interface extended with `systemRegistry` field.
- Event types expanded with `DISCOVERY_RECORDED` and `DISCOVERY_PROMOTED`.

---

## [4.1.0] - 2026-02-27

### Added

- **Gap 1: Mode-Change Audit Trail** — All `governance.mode` configuration changes now recorded to SOA ledger with `USER_OVERRIDE` event type.
- **Gap 2: Break-Glass Protocol** — Time-limited governance overrides with justification requirements, auto-revert, and full audit trail.
- **Gap 3: Artifact Hash on Write** — SHA-256 hash of file content at save-time recorded in ledger for verification.
- **Gap 4: Verdict Replay Harness** — `failsafe.replayVerdict` command for audit verification of past governance decisions.

### Changed

- Ledger payload now includes `policyHash` for replay fidelity.
- New methods: `LedgerManager.getEntryById()`, `PolicyEngine.getPolicyHash()`.

---

## [4.0.0] - 2026-02-27

### Added

- **Token Economics Dashboard** — Real-time visibility into prompt token usage, RAG savings, and cost-per-action metrics.
- **Economics Service Layer** — Pure TypeScript module with `CostCalculator`, `EconomicsPersistence`, `TokenAggregatorService`.
- **Governance Mode System** — Three modes (Observe, Assist, Enforce) selectable via settings or command.
- **Risk Register Panel** — Dedicated webview for tracking and managing project risks.
- **Transparency Stream Panel** — Real-time governance event stream in the sidebar.
- **Chat Participant** — `@failsafe` chat commands for intent, audit, trust, status, and seal operations.

### Changed

- UI terminology: "Operations Hub" renamed to "Command Center".
- API-first service isolation for future Tauri/Rust extraction.

---

## [3.6.0] - 2026-02-17

### Changed

- **Marketplace Categories** - Updated from `["Other", "Linters", "Visualization"]` to `["Machine Learning", "Testing", "Visualization"]` for better discoverability in the VS Code Marketplace.
- **Keywords Expanded** - Added 8 new keywords: `ai safety`, `agent governance`, `code audit`, `risk management`, `compliance`, `deterministic governance`, `intent management`, `checkpoint`.
- **Documentation** - Added marketplace category badges to README files for transparency.

### Added

- **Governance Modes** - Three modes to match workflow needs:
  - `observe` - No blocking, just visibility and logging. Zero friction.
  - `assist` - Smart defaults, auto-intent creation, gentle prompts. Recommended for most users.
  - `enforce` - Full control, intent-gated saves, L3 approvals. For compliance workflows.
- **Set Governance Mode Command** - `FailSafe: Set Governance Mode` to quickly switch between modes.
- **Auto-Intent Creation** - In Assist mode, FailSafe automatically creates intents when missing.
- **Default Governance Mode** - New installations default to `observe` mode for zero-friction onboarding.
- **EnforcementEngine** - Now respects governance mode setting for all enforcement decisions.

---

## [3.5.6] - 2026-02-12

### Changed

- Release metadata/version bump to 3.5.6 to start the Command Center UI overhaul sprint.

---

## [3.5.2] - 2026-02-11

### Fixed

- Marketplace/registry screenshot rendering fixed by moving sidebar image references to packaged extension media paths.

### Changed

- Release metadata/version bump to 3.5.2 across extension and distribution manifests.

---

## [3.5.1] - 2026-02-11

### Added

- Sidebar UI streamlining finalized (`Open Hub`, `Editor`, `Reload` shell controls + compact card alignment pass).
- `All Installed` skills lane added to Operations Hub skills surface to prevent phase-only visibility loss.
- Release screenshot artifact for streamlined sidebar UI added at `FailSafe/docs/images/sidebar-ui-3.5.1.png`.

### Changed

- First-party proprietary skill naming normalized to `qore-*` convention across FailSafe skill roots.
- Tauri skill packs adopted into FailSafe-owned skill library with `creator: MythologIQ Labs, LLC`.
- Skill discovery root resolution hardened to avoid false empty-catalog conditions.
- Documentation surfaces (root, extension, VSCode/OpenVSX package READMEs) updated to reflect 3.5.1 behavior and current commands.

---

## [3.0.1] - 2026-02-06

### Added

- **Release Discipline Enforcement** - New `/qor-repo-release` workflow artifact.
- **Sentinel Sidebar Monitoring** - Complete `SentinelViewProvider` and `SentinelTemplate`.
- **Structural Decomposition** - Decomposed `main.ts` into specialized bootstrap modules forSection 4 Simplicity.

### Fixed

- **Sentinel UI Hang** - Resolved perpetual loading by registering missing webview provider.
- **Type Solidification** - Hardened `FailSafeEventType` and `PlanningHubPanel` model mappings.

### Changed

- **KISS Refactor** - Flattened `DashboardPanel` constructor and templates to eliminate bloat.
- **Environment Parity** - Sync 3.0.1 graduation across VSCode, Claude, and Antigravity.

---

## [2.0.1] - 2026-02-05

### Added

- Webview template modules for Cortex Stream, Dojo, Dashboard, and Living Graph (Razor compliance).
- Shared tooltip helper with data-tooltip rendering across Genesis views.

### Fixed

- Cortex Stream search overlay text removed to eliminate redundant labels.
- Tooltips now display for advanced governance terminology and calculated metrics.

### Changed

- Documentation refreshed for the 2.0.1 release.

---

## [2.0.0] - 2026-02-05

### Added

- **Gold Standard Repository Skills**
  - `/qor-repo-audit` - Gap analysis against Gold Standard checklist
  - `/qor-repo-scaffold` - Generate missing community files (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, GOVERNANCE)
  - `/qor-repo-release` - Release discipline enforcement
- **Ambient Integration** - Repository governance hooks in existing commands
  - `/qor-bootstrap` Step 2.5: Repository readiness check
  - `/qor-plan` Step 4.5: Plan branch creation
  - `/qor-audit` Pass 7 + Step 5.5: Repo governance audit
  - `/qor-implement` Step 12.5: Implementation staging
  - `/qor-substantiate` Step 9.5: Final staging & merge
- **GitHub API Integration** - `github-api-helpers.md` reference for gh CLI patterns
- **Template Library** - 9 templates in `docs/conceptual-theory/templates/repo-gold-standard/`
- **Self-Application** - FailSafe now has Gold Standard community files at root
- **Multi-Environment Sync** - v2.0.0 skills synced to Claude, Antigravity, VSCode
- **Specialized Agents**
  - `ql-technical-writer` - Documentation quality specialist
  - `ql-ux-evaluator` - UI/UX testing with optional Playwright

---

## [1.3.0] - 2026-02-05

### Added

- **Plan Navigation** - DojoViewProvider now links to Roadmap view
- **Governance Integration** - GovernanceRouter plan events at lines 91-107
- **PlanManager Wiring** - Complete integration in main.ts

---

## [1.2.2] - 2026-02-05

### Fixed

- **D1**: Verified `calculateComplexity` exists (ArchitectureEngine lines 120-142)
- **D2**: Added `architecture.contributors` and `architecture.maxComplexity` config properties
- **D3**: Removed orphan `tsconfig.json` from workspace root

---

## [1.2.1] - 2026-02-05

### Added

- **BACKLOG.md Integration** - Unified source of truth for blockers, backlog, and wishlist
- **7 Command Integrations**:
  - `/qor-status` - Step 2.5 backlog check, Outstanding Items output
  - `/qor-bootstrap` - Step 6.5 BACKLOG.md creation
  - `/qor-audit` - Step 5.5 blocker registration on VETO
  - `/qor-implement` - Step 10.5 mark blockers complete
  - `/qor-substantiate` - Step 3.5 blocker verification
  - `/qor-plan` - Step 3.5 register backlog items
  - `/qor-refactor` - Step 5.5 register tech debt

---

## [1.2.0] - 2026-02-05

### Added

- **UI Clarity Enhancements** (Navigator)
  - Improved section and metric spacing
  - 6 info hints with tooltips in DojoViewProvider
  - 6 filter tooltips in CortexStreamProvider
  - Collapsible Quick Start Guide with toggleGuide handler
- **New Shared Components**
  - `shared/styles/common.ts` (74 lines)
  - `shared/components/InfoHint.ts` (66 lines)
  - `shared/content/quickstart.ts` (87 lines)

---

## [1.1.1] - 2026-02-05

### Added

- **VSCode Chat Participant** - `FailSafeChatParticipant.ts` (239 lines)
  - Slash commands for governance queries
  - Trust stage helper method (V1 remediation)
- **Chat Integration** - package.json chat participant registration

---

## [1.1.0] - 2026-02-05

### Added

- **Event-Sourced Plan Management** (Pathfinder)
  - `PlanManager.ts` (218 lines) - Event sourcing with YAML persistence
  - `RoadmapViewProvider.ts` (217 lines) - SVG-based visualization
  - `types.ts`, `events.ts`, `validation.ts` - Plan data model
- **Three View Modes** - Roadmap, Kanban, Timeline
- **30 Test Cases** - Full PlanManager test coverage
- **GovernanceRouter Integration** - `findPhaseForArtifact`, `setPlanManager` methods

---

## [1.0.7] - 2026-02-05

### Fixed

- Excluded test files from extension package to reduce bundle size
- Node.js version compatibility improvements

---

## [1.0.6] - 2026-02-04

### Fixed

- Extension icon path for VS Code Marketplace listing

---

## [1.0.5] - 2026-02-04

### Fixed

- Marketplace listing copy and metadata improvements

---

## [1.0.4] - 2026-02-04

### Fixed

- **Node.js Version Compatibility:** Resolved NODE_MODULE_VERSION mismatch by implementing pre-built binary support for better-sqlite3. The extension now works reliably across different Node.js versions.

### Added

- **Node Version Pinning:** Added `.nvmrc` configuration (Node 20.18.1) to ensure consistent build environments.
- **Binary Configuration:** Implemented pre-built binary downloads for native dependencies, eliminating version mismatches during installation.

---

## [1.0.0] - 2026-01-22

### Added

**Phase 4: Genesis UI & Feedback Loop**

- Implemented **The Dojo** sidebar with interactive workflow tracking
- Enhanced **Living Graph** with D3.js force-directed visualization, risk-grading, and trust-scaling
- Refined **Cortex Stream** with real-time filtering, search, and UX-centric keyboard shortcuts
- Implemented **FeedbackManager** with JSON-backed community feedback persistence and export support

**Phase 3: Governance & Trust**

- Migrated **TrustEngine** from in-memory to SQLite persistence via LedgerManager
- Implemented **Shadow Genome** protocol for archival and learning from agent failures

**Phase 2: Sentinel Enforcement**

- Implemented **Heuristic Pattern Library** for active monitoring
- Added **ExistenceEngine** for structural claim verification
- Implemented **ArchitectureEngine** for Macro-KISS enforcement (Polyglot/Bloat detection)

---

## [0.2.0] - 2026-01-22

### Added

- **Ledger Hardening:** Implemented full cryptographic verification for hash chain
- **Secure Storage:** Migrated HMAC signing keys to VS Code SecretStorage
- **Atomic Config:** Implemented atomic writes for configuration files

### Fixed

- **Database Locks:** Fixed issue where SQLite database remained locked after extension reload
- **Genesis Block:** Replaced placeholder genesis hash/signature with computed values

---

## [0.1.0] - 2026-01-22

### Added

- Initial project scaffold
- Basic SQLite Ledger implementation

---

_For the full roadmap, see [ROADMAP.md](ROADMAP.md)._
