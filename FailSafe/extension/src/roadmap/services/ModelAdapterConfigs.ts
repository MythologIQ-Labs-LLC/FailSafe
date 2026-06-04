/**
 * ModelAdapterConfigs - Type definitions and built-in adapter configurations
 * for model-specific skill format transpilation.
 */

export interface AdapterConfig {
  modelId: "claude" | "gemini" | "copilot" | "codex" | "cursor" | "windsurf" | "devin-desktop" | "kilocode";
  outputDir: string;
  format: "markdown" | "yaml" | "json";
  conventions: {
    fileNaming: "kebab" | "snake" | "camel";
    metadataFormat: "yaml-frontmatter" | "xml-inline" | "json";
    maxPromptLength: number;
    supportsSubagents: boolean;
    supportsHooks: boolean;
  };
}

export interface AdapterResult {
  written: string[];
  skipped: string[];
  errors: string[];
}

export const BUILTIN_ADAPTER_CONFIGS: Record<string, AdapterConfig> = {
  claude: {
    modelId: "claude",
    outputDir: ".claude/skills/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "yaml-frontmatter",
      maxPromptLength: 200000,
      supportsSubagents: true,
      supportsHooks: true,
    },
  },
  codex: {
    modelId: "codex",
    outputDir: ".agents/skills/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "yaml-frontmatter",
      maxPromptLength: 8000,
      supportsSubagents: false,
      supportsHooks: false,
    },
  },
  gemini: {
    modelId: "gemini",
    outputDir: ".gemini/skills/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "xml-inline",
      maxPromptLength: 100000,
      supportsSubagents: false,
      supportsHooks: false,
    },
  },
  copilot: {
    modelId: "copilot",
    outputDir: ".github/skills/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "yaml-frontmatter",
      maxPromptLength: 8000,
      supportsSubagents: false,
      supportsHooks: false,
    },
  },
  cursor: {
    modelId: "cursor",
    outputDir: ".cursor/rules/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "yaml-frontmatter",
      maxPromptLength: 8000,
      supportsSubagents: false,
      supportsHooks: false,
    },
  },
  windsurf: {
    modelId: "windsurf",
    outputDir: ".windsurf/rules/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "yaml-frontmatter",
      maxPromptLength: 8000,
      supportsSubagents: false,
      supportsHooks: false,
    },
  },
  "devin-desktop": {
    // GH #161: Devin Desktop (formerly Windsurf) prefers `.devin/rules/`.
    modelId: "devin-desktop",
    outputDir: ".devin/rules/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "yaml-frontmatter",
      maxPromptLength: 8000,
      supportsSubagents: false,
      supportsHooks: false,
    },
  },
  kilocode: {
    modelId: "kilocode",
    outputDir: ".kilocode/workflows/",
    format: "markdown",
    conventions: {
      fileNaming: "kebab",
      metadataFormat: "yaml-frontmatter",
      maxPromptLength: 8000,
      supportsSubagents: false,
      supportsHooks: false,
    },
  },
};
