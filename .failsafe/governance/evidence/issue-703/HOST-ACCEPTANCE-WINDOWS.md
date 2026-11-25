# #703 installed Windows VSIX acceptance (2026-11-25)

**Source**: branch `fix/703-delivery-review-note-refresh-race` at `71d3a1c5` (implementation of plan-703 iteration 7 over c38f970d).
**Package**: `prepush-host.vsix` built by `node scripts/package-target.cjs --host` and passed `node scripts/validate-vsix.cjs` (metadata v6.0.13, native SQLite win32-x64, packaged hygiene); sha256 `e82522332f2ea6669d258d1d1d57f81d640ba18d3d3a5821645516555f881323`, 193 files, 7.47 MB. Not a release; no version bump.
**Host**: Windows 11 Pro 10.0.26300; VS Code 1.147.0 (commit 8a14f0cc1b08d531eb83255ea3764ae22aa932b5); Electron 43.8.9; Node 24.22.1. Isolated profile (`--user-data-dir`, `--extensions-dir` in the session scratchpad); `code --list-extensions` -> `mythologiq.mythologiq-failsafe@6.0.13` installed from that VSIX. Workspace trust disabled in the isolated profile only.
**Workspace**: scratch git repository with three commits (ca5104c9, ea23055e, 135a3986); a sealed intent ACC-1 (23efe7d0) and an active intent ACC-2 (1d2eadb9) with ca5104c9 and ea23055e linked, seeded with the compiled `IntentService` and `prepareDeliveryEdge`/`writeDeliveryEdge` from the same build (`seed703.cjs`).
**Driver**: the installed extension's own Console server at `http://127.0.0.1:9376/command-center.html` > Workspace > Delivery, operated in Chrome (an external browser stays usable while a VS Code modal blocks the editor). The owner operated the native VS Code confirmation dialog. No stub, mock or test harness was involved.

## Observations

| Step | Action | Observed |
|---|---|---|
| 1 | Pick the older linked commit ca5104c9 (default was the newest, ea23055e); type note "acceptance note A"; click Refresh | the panel was rebuilt (a new input element), the pick stayed ca5104c9 and the note stayed "acceptance note A"; PASS enabled |
| 2 | Record PASS on ca5104c9 | `POST /api/actions/delivery/review` -> 409 (server rule: a PASS must be on a commit containing every linked commit); no dialog; message shown once on ACC-2; note "acceptance note A" kept; buttons re-enabled |
| 3 | Pick ea23055e; the note field shows empty (the note belongs to ca5104c9); type "acceptance note B"; Record PASS | the VS Code confirmation dialog opened; 2.5 s later PASS and VETO were both disabled (one review in flight) |
| 4 | While the dialog was open, switch the intent picker to sealed ACC-1 | ACC-1 shown, no result message, no review controls |
| 5 | Owner clicked Cancel in the dialog | ACC-1 still showed no result message |
| 6 | Switch back to ACC-2 | "Not confirmed in VS Code; nothing was recorded." shown exactly once; pick ea23055e and note "acceptance note B" kept; PASS enabled |
| 7 | Refresh | the message did not replay; the note was still "acceptance note B" |
| 8 | Record PASS; owner confirmed the dialog | PASS and VETO disabled while pending; then "Review PASS recorded as ledger entry #2 and in the intent history." shown once; the submitted note cleared; pick ea23055e kept; Review step `passing`; after Refresh no replay |

Network log for the session (`/api/actions/`): exactly three review POSTs - 409, 409, 200. Server state afterwards: `soa_ledger` has exactly one `DELIVERY_REVIEWED` row (plus one `SYSTEM_EVENT`); `intent_history.jsonl` has exactly one REVIEWED line; `GET /api/v1/delivery/intents/1d2eadb9-...` Review step `passing` with one record (PASS, ea23055e, entry 2, note "acceptance note B").

## Claims exercised on the installed host

R6 (note survives a repaint, posted once, cleared after 200), R8 (refused and not-confirmed reviews keep the note and re-enable review), R9 (note per commit), R10 (picked commit survives a repaint), R5 (completion held while another intent is shown, shown once on its own intent, not replayed), R13 (PASS and VETO disabled while one review is pending). FX589 (Bicameral) is stub-only by design and was not exercised here.

## Limitations

One Windows host; macOS and Linux installed hosts were not exercised. The browser steps used DOM events (`change`, `input`, `click`) issued through the page, equivalent to the operator's selections; the confirmation dialog was operated by the owner. The first click of step 2 was issued before network capture started; its outcome (a 409 shown and consumed before the intent switch) is inferred from the identical second attempt.
