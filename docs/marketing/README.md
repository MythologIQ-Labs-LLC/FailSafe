# FailSafe Marketing Kit

Owner-reviewed product media for FailSafe releases. Each release has its own folder with the finished media, its captions and transcript, a provenance record, checksums, and the editable sources needed to rebuild it.

| Release | Folder | Contents |
|---|---|---|
| v6.0.13 | [`failsafe-v6.0.13/`](failsafe-v6.0.13/README.md) | Statewright website-handoff demo reel (64 s), captions, transcript, thumbnail, sources |
| v6.0.12 | `failsafe-v6.0.12/` (PR #648, not yet merged) | Narrated product film, screenshots, capture provenance |

## Rules for this kit

- **Real product only.** Media is recorded from the published release, installed from its public marketplace, and never from an unreleased build. Each folder's `PROVENANCE.md` names the exact version, the install source and the package hash.
- **No fabricated behaviour.** Nothing shows a capability the release does not ship.
- **Privacy.**
  - Footage never shows real account names, emails, tokens, private workspaces or customer data.
  - Any real third-party account screen is cropped to the page and its account identifiers are covered irreversibly.
  - Raw captures that contained private data are deleted, not kept.
- **Owner approval.** Media is added here only after the owner has reviewed it. Linking it from READMEs, the website or social accounts needs the owner's separate approval.
- **Size.** Files of 20 MB or more are kept outside Git. Each folder lists them with their SHA-256 in `RETAINED-OUTSIDE-GIT.md`. Mix exports that can be rebuilt are left out.
