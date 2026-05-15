/**
 * AgentDefinitions - Built-In Agent System Manifests
 *
 * Defines the 7 supported AI coding agents with their detection rules and
 * governance paths. Detection markers are tuned to avoid false positives:
 * each agent carries at least one high-confidence signal (an exact extension
 * id or an agent-specific dot-directory). `terminalPatterns` are populated now
 * for the future runtime detection phase.
 */

import { AgentSystemManifest } from "./types/DetectionTypes";

export const BUILT_IN_AGENTS: AgentSystemManifest[] = [
  {
    id: "claude",
    name: "Claude Code",
    description: "Claude Code CLI and Anthropic agents",
    targetDir: null,
    detection: {
      folderExists: [".claude"],
      extensionKeywords: ["claude", "anthropic"],
      terminalPatterns: ["claude"],
    },
    governancePaths: [".claude/skills", ".claude/agents", ".claude/CLAUDE.md"],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "GitHub Copilot AI assistant",
    targetDir: null,
    detection: {
      folderExists: [".github/copilot-instructions.md"],
      extensionIds: ["github.copilot", "github.copilot-chat"],
      extensionKeywords: ["copilot"],
    },
    governancePaths: [".github/copilot-instructions.md"],
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Cursor AI-native code editor",
    targetDir: null,
    detection: {
      folderExists: [".cursor"],
      hostAppNames: ["cursor"],
    },
    governancePaths: [".cursor/rules/failsafe.mdc"],
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    description: "OpenAI Codex CLI agent",
    targetDir: null,
    detection: {
      folderExists: [".codex"],
      extensionKeywords: ["codex"],
      terminalPatterns: ["codex"],
    },
    governancePaths: ["codex.md"],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    description: "Windsurf AI code editor",
    targetDir: null,
    detection: {
      folderExists: [".windsurf"],
      hostAppNames: ["windsurf"],
    },
    governancePaths: [".windsurfrules"],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google Gemini CLI agent",
    targetDir: null,
    detection: {
      folderExists: [".gemini"],
      extensionKeywords: ["gemini"],
      terminalPatterns: ["gemini"],
    },
    governancePaths: ["GEMINI.md", ".gemini/settings.json"],
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    description: "Kilo Code AI agent",
    targetDir: null,
    detection: {
      folderExists: [".kilo"],
      extensionIds: ["kilo-org.kilo-code"],
      terminalPatterns: ["kilo"],
    },
    governancePaths: [".kilo/skills", ".kilo/agents", ".kilo/kilo.json"],
  },
];
