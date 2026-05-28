# Open Design vendored contracts — Apache-2.0 attribution

This directory contains TypeScript type definitions vendored (transcribed) from
the [nexu-io/open-design](https://github.com/nexu-io/open-design) project at
commit `abe72af` (verified 2026-05-27).

Source files of origin (paraphrased from upstream layout):

- `packages/contracts/src/sse/chat.ts` — `ChatSseEvent` discriminated union
- `packages/contracts/src/sse/common.ts` — shared SSE primitives
- `packages/contracts/src/sse/errors.ts` — `SseErrorPayload`

## License

Open Design is distributed under the Apache License, Version 2.0 (see
upstream `LICENSE` file). Per Apache-2.0 §4(b), the vendored types in
`sse-chat.ts` carry an attribution header citing the source commit + project,
and this NOTICE file is preserved alongside.

A copy of the Apache-2.0 license text is available at
<https://www.apache.org/licenses/LICENSE-2.0>.

## Scope

These vendored types describe the wire format FailSafe consumes from the
Open Design daemon's per-run SSE stream (`GET /api/runs/:id/events`). They
are pure type definitions plus one runtime guard (`isChatSseEvent`); no
upstream logic is transplanted.

Updates to these contracts must re-pin the source commit in the
`sse-chat.ts` header comment + this NOTICE file.
