"""#467: append the EPOCH entry that opens a clean, fully verified ledger epoch.

Operator decision (2026-10-29, repository owner): entries #341 (no canonical hash
markup) and #382 (previous-hash link break) cannot be repaired without rewriting
history, which is forbidden. History is kept byte-for-byte; the native boundary
moves to #382; this entry records the decision and pins the disclosed prefix.

Uses the frozen qor-logic 0.176.1 renderer and hash primitives
(``ledger_emit.render``, ``ledger_hash.chain_hash``, the self-bound content
rule) so the verifier round-trips the entry. ``ledger_emit.append`` is not used
because it inserts before the last ``*Chain integrity: VALID*`` marker and this
ledger has none; the entry is appended at end of file, linked off the tail.

Usage: python append_epoch_entry.py --ledger docs/META_LEDGER.md --boundary 382 --timestamp ISO8601Z [--write]
"""
from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

from qor.scripts.ledger_emit import LedgerEntry, render, _tail_chain_hash, _body_content_hash
from qor.scripts.ledger_hash import assert_sealable_text, chain_hash

ENTRY_HEAD = re.compile(r"^### Entry #(\d+):", re.MULTILINE)


def prefix_digest(text_lf: str, boundary: int) -> tuple[str, int]:
    """sha256 of the LF-normalized ledger bytes before the first entry numbered > boundary."""
    for m in ENTRY_HEAD.finditer(text_lf):
        if int(m.group(1)) > boundary:
            prefix = text_lf[: m.start()]
            return hashlib.sha256(prefix.encode("utf-8")).hexdigest(), len(prefix.encode("utf-8"))
    raise ValueError(f"no entry above #{boundary}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ledger", type=Path, required=True)
    ap.add_argument("--boundary", type=int, required=True)
    ap.add_argument("--timestamp", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    raw = a.ledger.read_bytes()
    text_lf = raw.decode("utf-8").replace("\r\n", "\n")
    numbers = [int(n) for n in ENTRY_HEAD.findall(text_lf)]
    number = max(numbers) + 1
    digest, nbytes = prefix_digest(text_lf, a.boundary)
    full = hashlib.sha256(text_lf.encode("utf-8")).hexdigest()
    above = sum(1 for n in numbers if n > a.boundary)

    body = (
        "Operator decision (repository owner, 2026-10-29, recorded in #467): the ledger is broken "
        "at entries #341 and #382 and cannot be repaired without rewriting history, which is "
        "forbidden. Native qor-logic 0.176.1 measured on this ledger before this entry: "
        "verify-ledger --post-anchor --boundary 340 exits 1 with FAIL #341 (missing canonical hash "
        "markup, required at/after entry #123) and BREAK #382 (previous_hash bfd9f17c7d684d0b was "
        "not produced by the preceding entry, chain 24b5b3b5a43eb506); the full chain also carries "
        "the disclosed pre-anchor residue below #340 (duplicate #236, BREAK #340, entry-number gaps "
        "158 and 298, unrecognized pre-convention hash values). The owner accepts these as known, "
        "unrepairable defects and opens a clean epoch: native ledger.post_anchor_boundary, previously "
        "undeclared (FailSafe's own gate used 340), is declared as 382. Native verification "
        "chain-verifies every entry numbered above #382, including this one, whenever it runs; "
        "entries numbered #382 or below are disclosed, not repaired.\n\n"
        "What this costs, stated plainly: the 42 entries #341-#382 lose native failure detection "
        "(measured with qor-logic 0.176.1: chain tampering at #341, #350 or #381, deletion of #360 or "
        "#381, and a duplicate #360 are all tolerated at boundary 382). Native tolerance is by entry "
        "number, not file position, so a heading numbered 382 or lower placed anywhere in the file is "
        "also tolerated natively.\n\n"
        "Compensating controls in FailSafe's check-ledger-anchor (FX946), held as reviewed code "
        "constants rather than by this text: (1) the exact bytes before the first entry heading "
        "numbered above #382 must match the pinned sha256 and length, so any edit, deletion or "
        "insertion in that band fails; (2) no entry heading numbered 382 or lower may appear after "
        "that point; (3) this entry must appear exactly once with its recomputed content hash, the "
        "pinned content hash and a valid chain hash; (4) the reconciled-entry set must be exactly "
        "#397, #401 (#467 G3). These make the band tamper-evident relative to reviewed code and git "
        "history; they are not a cryptographic attestation. #467 G1 (exact known failure set) is "
        "subsumed by the byte pin; #467 G4 (an independent witness or signature) is not implemented.\n\n"
        "History is kept byte-for-byte. Nothing above or below the boundary was edited, removed or "
        "renumbered.\n\n"
        f"**Disclosed Band**: entries #1 through #{a.boundary} (known failures: #341 markup, #382 link; "
        "pre-anchor residue as listed above)\n"
        f"**Prefix Pin**: sha256 `{digest}` over the first {nbytes} bytes (LF-normalized) of "
        f"docs/META_LEDGER.md, ending immediately before the heading of the first entry numbered above #{a.boundary}\n"
        f"**Ledger Before Epoch**: sha256 `{full}` (LF-normalized), {len(numbers)} entry headings, "
        f"{above} above the new boundary\n"
        f"**New Boundary**: .qorlogic/config.json ledger.post_anchor_boundary = {a.boundary} "
        f"(was undeclared natively; consumer ledger_anchor.entry 340 -> {a.boundary})\n"
        "**Not Claimed**: this entry does not repair or re-verify entries at or below the boundary, "
        "is not an external witness or signature, and is not an audit PASS."
    )
    entry = LedgerEntry(
        number=number,
        title=f"EPOCH - clean ledger epoch after #{a.boundary} (#467 operator decision)",
        fields={
            "Timestamp": a.timestamp,
            "Phase": "MIGRATION",
            "Author": "Governor",
            "Risk Grade": "L3",
            "Verdict": "OPERATOR-ACCEPTED DISCLOSURE (not an audit PASS)",
        },
        body=body,
    )
    assert_sealable_text(entry.body, label="epoch body")
    previous = _tail_chain_hash(text_lf)
    content = _body_content_hash(entry)
    chain = chain_hash(content, previous)
    rendered = render(entry, content=content, previous=previous, chain=chain)
    print(rendered)
    print(f"\n[epoch] number=#{number} previous={previous} chain={chain} prefix={digest} bytes={nbytes}")
    if a.write:
        eol = "\r\n" if b"\r\n" in raw else "\n"
        tail = raw.decode("utf-8").rstrip("\r\n")
        out = tail + eol + eol + "---" + eol + eol + rendered.replace("\n", eol).rstrip(eol) + eol
        a.ledger.write_bytes(out.encode("utf-8"))
        print(f"[epoch] appended to {a.ledger}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
