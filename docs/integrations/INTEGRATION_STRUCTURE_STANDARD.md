# Integration Folder Structure Standard

> Every integration under `FailSafe/extension/src/integrations/<name>/` follows
> ONE uniform layout. This is enforced per-cycle alongside the
> [Integration Documentation Index](./INTEGRATION_DOCS_INDEX.md). A folder that
> deviates is a structure bug.

## Uniform layout

```
src/integrations/<name>/
  README.md              # REQUIRED — professional per-integration doc (template below)
  <name>-<role>.ts       # pure logic (no fs / no network / no secrets) — one or more
  <name>-client.ts       # injectable transport (network), where the integration calls out
  <NAME>Notifier.ts      # event→notify class, for `notify`-pattern integrations only
src/extension/<name>-command.ts        # VS Code command wiring (thin glue over the pure logic)
src/test/integrations/<name>/<name>.test.ts   # behaviour tests (injected transport — no live network/process)
```

Rules:

1. **README.md is mandatory** in every integration folder.
2. **Pure logic and transport are separate files.** Pure logic is deterministically
   unit-testable; the transport is injectable so tests use no live network/process.
3. **Secrets never live in pure logic or a receipt** — only in the outbound auth
   header / child env, handled by the transport. A masking test proves it.
4. **Command wiring lives in `src/extension/<name>-command.ts`**, not in the
   integration folder (keeps the integration folder pure + portable). Notify-pattern
   integrations wire a `<NAME>Notifier` in `main.ts` instead of a command.
5. **Role suffix** names the pure file's job: `-import` / `-to-risk` / `-map`
   (ingest), `-notify` / `-sender` (notify), `-wrapper` / `-core` (agent CLI),
   `-audit` / `-observer` (observe). Consistent within a family.
6. Every external name (endpoint, field, flag, header) is back-cited to the
   official doc registered in `INTEGRATION_DOCS_INDEX.md` — see the
   verify-external-names discipline.

## README template

```markdown
# <Integration name> integration

> One-line: what FailSafe does with <integration> and the value it adds.

- **Pattern:** ingest | notify | wrapper | observe | mcp | installer
- **Direction:** read-only / outbound notify / governed execution
- **Status:** shipped vX.Y.Z | in review (#PR) | planned (#issue)
- **Official docs:** <URL from INTEGRATION_DOCS_INDEX.md>
- **Backlog:** #<issue>

## What it does
2–4 sentences. The concrete governance value, not a feature list.

## Configuration
| Setting | Default | Secret | Purpose |
|---|---|---|---|
| `failsafe.integrations.<name>.enabled` | `false` | no | … |
| … | | | |

## Security
How auth/secrets are handled (header/env only, never logged, masking test),
and what is read vs written. Off by default; no network/process unless enabled.

## Command / wiring
`FailSafe: …` (command id) — what it does. Or: wired as `<NAME>Notifier` in main.ts.

## Files
- `<name>-<role>.ts` — pure logic
- `<name>-client.ts` — injectable transport
- test: `src/test/integrations/<name>/<name>.test.ts`

## Verified surface
Bullet the external names this integration depends on, each back-cited to the
official doc (endpoint / field / flag / header). This is the anti-ghost-name record.
```
