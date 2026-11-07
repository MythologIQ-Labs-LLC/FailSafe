# #480 T11 on newer VS Code: analysis (assertion unchanged)

**Test:** `src/test/integrations/tracker-import/tracker-markdown.test.ts`, "the chat participant renders an imported purpose as text at all three sites".

**Assertion** (`:66-67`): every `<a href="H">T</a>` in the rendered chat Markdown must satisfy `T === H`. Its own comment states the intent:

> "Chat Markdown still auto-links a bare URL (disclosed limitation); what must not happen is a link whose text hides its target."

**Observed** (`t11-failure-vscode-1.141.1.txt`):
- **Passes** on pinned VS Code 1.122.1.
- **Fails** on 1.141.1, with `href = https://evil.example/p.png%5C` and `text = https://evil.example/p.png\`.

The imported purpose is `![x](https://evil.example/p.png\) <img src=x onerror=alert(1)> [link](http://evil.example)`. FailSafe's escaping holds:
- no `<img>` element;
- the `[link](…)` is not rendered as a disguised link;
- the HTML is shown as text.

The newer renderer auto-links the bare URL inside the escaped image syntax, including the escape backslash, and percent-encodes that backslash in `href` only.

**Classification:** not a disguised link. The visible text *is* the target URL, differing only by percent-encoding of `\`, so the user sees the real destination host. This is a renderer-version difference against a strict string-equality check, and not a security regression.

**Options (owner decision; nothing changed):**
1. **Test:** compare `decodeURI(href)` with `text`. A real disguised link (`[link](http://evil.example)` → text `link`) still fails. This narrows the check to the stated intent, but it does change an assertion, so it is the owner's call.
2. **Product:** render imported purpose text so that no auto-link can form, for example inside a code span or with an escaped scheme. This is stronger, and is a production change needing governance approval.
3. **Leave as is:** the test then fails on every host from VS Code 1.141 on.
