#!/usr/bin/env python3
"""Reference Merkle chain validation implementation for /qor-validate."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import List


@dataclass
class LedgerEntry:
    entry_id: int
    timestamp: str
    phase: str
    content_hash: str
    previous_hash: str
    chain_hash: str
    decision: str


def parse_ledger(_: str) -> List[LedgerEntry]:
    """Placeholder: parse docs/META_LEDGER.md into entries."""
    return []


def verify_chain(entries: List[LedgerEntry]) -> dict:
    results = []
    expected_previous = "GENESIS"

    for i, entry in enumerate(entries):
        expected_chain = sha256((entry.content_hash + expected_previous).encode("utf-8")).hexdigest()
        is_valid = entry.chain_hash == expected_chain

        results.append(
            {
                "entry_id": entry.entry_id,
                "expected_chain": expected_chain,
                "recorded_chain": entry.chain_hash,
                "valid": is_valid,
            }
        )

        if not is_valid:
            return {"status": "BROKEN", "broken_at": i + 1, "results": results}

        expected_previous = entry.chain_hash

    return {"status": "VALID", "total_entries": len(entries), "results": results}


def main() -> int:
    ledger = Path("docs/META_LEDGER.md").read_text(encoding="utf-8")
    entries = parse_ledger(ledger)
    report = verify_chain(entries)
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
