#!/usr/bin/env python3
"""Install QoreLogic Claude bundle and register skills, hooks, and subagents.

Usage:
  python qorelogic/Claude/commands/scripts/install.py
  python qorelogic/Claude/commands/scripts/install.py --user

The script searches upward from the current working directory to find
qorelogic/Claude/manifest.json, then installs into the local .claude/ folder
by default (workspace/project scope). Use --user to install into the user
config (~/.claude) instead.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Dict, List


def find_governance_root(start: Path) -> Path:
    """Find repo root containing governance metadata."""
    current = start.resolve()
    for parent in [current] + list(current.parents):
        manifest = parent / "qorelogic" / "Claude" / "manifest.json"
        if manifest.is_file():
            return parent

    # Fallback: search within current tree (depth-limited)
    max_depth = 5
    for root, dirs, files in os.walk(current):
        depth = Path(root).relative_to(current).parts
        if len(depth) > max_depth:
            dirs[:] = []
            continue
        if "manifest.json" in files:
            candidate = Path(root)
            if candidate.name == "Claude" and candidate.parent.name == "qorelogic":
                return candidate.parent.parent

    raise FileNotFoundError("Could not locate governance metadata. Run from a compatible workspace.")


def copy_bundle(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dst / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True)
        else:
            shutil.copy2(item, target)


def load_settings(path: Path) -> Dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return {}


def ensure_dict(parent: Dict, key: str) -> Dict:
    value = parent.get(key)
    if not isinstance(value, dict):
        value = {}
        parent[key] = value
    return value


def ensure_list(parent: Dict, key: str) -> List:
    value = parent.get(key)
    if value is None:
        value = []
    elif isinstance(value, str):
        value = [value]
    elif not isinstance(value, list):
        value = []
    parent[key] = value
    return value


def merge_list(target: List, additions: List) -> None:
    for item in additions:
        if item not in target:
            target.append(item)


def update_settings(settings_path: Path) -> None:
    settings = load_settings(settings_path)

    desired_subagents = {
        "ql-governor": "commands/agents/qor-governor.md",
        "ql-judge": "commands/agents/qor-judge.md",
        "ql-specialist": "commands/agents/qor-specialist.md",
    }

    desired_skills = {
        "ql-bootstrap": "commands/qor-bootstrap.md",
        "ql-governor-persona": "commands/qor-governor-persona.md",
        "ql-status": "commands/qor-status.md",
        "ql-audit": "commands/qor-audit.md",
        "ql-help": "commands/qor-help.md",
        "ql-implement": "commands/qor-implement.md",
        "ql-judge-persona": "commands/qor-judge-persona.md",
        "ql-organize": "commands/qor-organize.md",
        "ql-plan": "commands/qor-plan.md",
        "ql-refactor": "commands/qor-refactor.md",
        "ql-specialist-persona": "commands/qor-specialist-persona.md",
        "ql-validate": "commands/qor-validate.md",
        "ql-substantiate": "commands/qor-substantiate.md",
    }

    desired_hooks = {
        "PreToolUse": {
            "Write": ["hooks/kiss-razor-gate.json", "hooks/orphan-detection.json"],
            "Edit": ["hooks/kiss-razor-gate.json", "hooks/security-path-alert.json"],
        },
        "PostToolUse": {"Read": ["hooks/cognitive-reset.json"]},
        "Stop": ["hooks/session-seal.json"],
    }

    subagents = ensure_dict(settings, "subagents")
    for key, value in desired_subagents.items():
        subagents.setdefault(key, value)

    skills = ensure_dict(settings, "skills")
    for key, value in desired_skills.items():
        skills.setdefault(key, value)

    hooks = ensure_dict(settings, "hooks")
    # PreToolUse / PostToolUse maps
    for hook_phase in ("PreToolUse", "PostToolUse"):
        phase = ensure_dict(hooks, hook_phase)
        desired_phase = desired_hooks.get(hook_phase, {})
        for tool_name, tool_hooks in desired_phase.items():
            existing = ensure_list(phase, tool_name)
            merge_list(existing, tool_hooks)

    # Stop list
    stop_existing = ensure_list(hooks, "Stop")
    merge_list(stop_existing, desired_hooks.get("Stop", []))

    settings_path.parent.mkdir(parents=True, exist_ok=True)
    if settings_path.exists():
        backup = settings_path.with_suffix(settings_path.suffix + ".bak")
        try:
            shutil.copy2(settings_path, backup)
        except OSError:
            pass
    with settings_path.open("w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, sort_keys=True)
        f.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Install QoreLogic Claude bundle and register settings.")
    parser.add_argument("--user", action="store_true", help="Install into user config ~/.claude/ (user scope)")
    args = parser.parse_args()

    start = Path.cwd()
    root = find_governance_root(start)
    src = root / "qorelogic" / "Claude"
    if not src.exists():
        raise FileNotFoundError(f"Bundle not found at {src}")

    if args.user:
        target = Path.home() / ".claude"
    else:
        target = start / ".claude"

    copy_bundle(src, target)
    update_settings(target / "settings.json")

    scope = "user" if args.user else "project"
    print(f"Installed framework bundle to {target} ({scope} scope)")
    print("Registered skills, hooks, and subagents in settings.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
