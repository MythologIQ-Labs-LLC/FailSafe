#!/usr/bin/env python3
"""Reference implementation for substantiation seal hashing."""

from hashlib import sha256
from pathlib import Path


def read_file(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def read_all_files(root: str) -> str:
    content_parts = []
    for path in sorted(Path(root).rglob("*")):
        if path.is_file():
            content_parts.append(path.read_text(encoding="utf-8"))
    return "".join(content_parts)


def hash_text(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def calculate_session_seal() -> str:
    concept = read_file("docs/CONCEPT.md")
    architecture = read_file("docs/ARCHITECTURE_PLAN.md")
    audit_report = read_file(".failsafe/governance/AUDIT_REPORT.md")
    system_state = read_file("docs/SYSTEM_STATE.md")
    source_files = read_all_files("src")

    final_content = concept + architecture + audit_report + system_state + source_files
    content_hash = hash_text(final_content)

    # Placeholder: replace with actual extraction from META_LEDGER.md
    previous_hash = "PREVIOUS_LEDGER_HASH"

    session_seal = hash_text(content_hash + previous_hash)
    return session_seal


if __name__ == "__main__":
    print(calculate_session_seal())
