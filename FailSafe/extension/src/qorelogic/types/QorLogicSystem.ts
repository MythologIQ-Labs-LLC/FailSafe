/**
 * QorLogicSystem - Plugin Interface Definition
 *
 * This module defines the core interfaces for the QorLogic plugin system,
 * enabling extensible governance framework synchronization across multi-agent
 * environments.
 */

import * as vscode from "vscode";

// ============================================================================
// CORE MANIFEST TYPES
// ============================================================================

/**
 * Detection rules for determining if a system is installed/active
 */
export interface DetectionRules {
  /** List of folder paths whose presence indicates the system is installed */
  folderExists?: string[];
  /** Keywords to search for in installed VS Code extensions */
  extensionKeywords?: string[];
  /** Host application names to match against */
  hostAppNames?: string[];
  /** If true, the system is always considered installed */
  alwaysInstalled?: boolean;
}

/**
 * Additional file/directory copy operations
 */
export interface ExtraCopy {
  /** Source path (relative to workspace root) */
  source: string;
  /** Target path (relative to workspace root) */
  target: string;
}

/**
 * Template file configuration for rendering
 */
export interface TemplateConfig {
  /** Template source file path (relative to workspace root) */
  source: string;
  /** Output filename at workspace root */
  output: string;
}

/**
 * Extension hooks for custom behavior during sync lifecycle
 */
export interface ExtensionHooks {
  /** Path to a script to execute before sync starts (relative to sourceDir) */
  preSync?: string;
  /** Path to a script to execute after sync completes (relative to sourceDir) */
  postSync?: string;
  /** Path to a script to execute when system is detected (relative to sourceDir) */
  onDetect?: string;
  /** Path to a script to execute for custom template rendering (relative to sourceDir) */
  onTemplateRender?: string;
}

/**
 * Declared capabilities of the system
 */
export interface SystemCapabilities {
  /** Whether the system supports orbit-based governance */
  supportsOrbits?: boolean;
  /** Whether the system supports policy-based governance */
  supportsPolicies?: boolean;
  /** Whether the system supports skill definitions */
  supportsSkills?: boolean;
  /** Whether the system supports workflow definitions */
  supportsWorkflows?: boolean;
  /** Whether the system supports shadow genome (failure archival) */
  supportsShadowGenome?: boolean;
  /** Whether the system supports SOA ledger (audit trail) */
  supportsLedger?: boolean;
  /** Whether the system supports trust scoring */
  supportsTrustEngine?: boolean;
  /** Whether the system supports L3 approval queue */
  supportsL3Approval?: boolean;
}

/**
 * Additional metadata about the system
 */
export interface SystemMetadata {
  /** Author or organization name */
  author?: string;
  /** License identifier */
  license?: string;
  /** Homepage URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Complete system manifest definition
 */
export interface SystemManifest {
  /** Unique identifier for the system (kebab-case recommended) */
  id: string;
  /** Human-readable display name for the system */
  name: string;
  /** Brief description of the system and its governance approach */
  description: string;
  /** Semantic version of the manifest schema */
  version?: string;
  /** Source directory containing the governance framework files */
  sourceDir?: string;
  /** Target directory for synchronization (null if no target directory needed) */
  targetDir: string | null;
  /** Detection rules for determining if the system is installed/active */
  detection?: DetectionRules;
  /** Paths that contain governance artifacts */
  governancePaths?: string[];
  /** Additional file/directory copies beyond the main sourceDir -> targetDir sync */
  extraCopies?: ExtraCopy[];
  /** Template files to render and place at the workspace root */
  templates?: TemplateConfig[];
  /** Extension hooks for custom behavior during sync lifecycle */
  hooks?: ExtensionHooks;
  /** Declared capabilities of the system */
  capabilities?: SystemCapabilities;
  /** List of system IDs that this system depends on */
  dependencies?: string[];
  /** Additional metadata about the system */
  metadata?: SystemMetadata;
}

// ============================================================================
// DETECTION TYPES
// ============================================================================

/**
 * Result of system detection
 */
export interface DetectedSystem {
  /** System identifier */
  id: string;
  /** System display name */
  name: string;
  /** Whether the system is installed/active */
  isInstalled: boolean;
  /** Whether the system has governance artifacts */
  hasGovernance: boolean;
  /** System description */
  description: string;
}

/**
 * Detection context provided to detection hooks
 */
export interface DetectionContext {
  /** Workspace root path */
  workspaceRoot: string;
  /** VS Code extension API */
  vscode: typeof vscode;
  /** List of all installed extensions */
  extensions: readonly vscode.Extension<unknown>[];
  /** Host application name */
  appName: string;
}

/**
 * Result of a custom detection hook
 */
export interface DetectionResult {
  /** Whether the system is detected */
  detected: boolean;
  /** Optional reason for detection result */
  reason?: string;
  /** Optional metadata about the detection */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SYNC TYPES
// ============================================================================

/**
 * Context provided to sync hooks
 */
export interface SyncContext {
  /** Workspace root path */
  workspaceRoot: string;
  /** System manifest */
  manifest: SystemManifest;
  /** VS Code extension API */
  vscode: typeof vscode;
  /** Logger instance */
  logger: {
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, error?: unknown) => void;
    debug: (message: string, data?: unknown) => void;
  };
}

/**
 * Result of a pre-sync hook
 */
export interface PreSyncResult {
  /** Whether to proceed with sync */
  proceed: boolean;
  /** Optional error message if not proceeding */
  error?: string;
  /** Optional data to pass to post-sync hook */
  data?: Record<string, unknown>;
}

/**
 * Result of a post-sync hook
 */
export interface PostSyncResult {
  /** Whether the post-sync operations succeeded */
  success: boolean;
  /** Optional error message if failed */
  error?: string;
  /** Optional data to return */
  data?: Record<string, unknown>;
}

// ============================================================================
// TEMPLATE RENDERING TYPES
// ============================================================================

/**
 * Context provided to template rendering hooks
 */
export interface TemplateRenderContext {
  /** Workspace root path */
  workspaceRoot: string;
  /** System manifest */
  manifest: SystemManifest;
  /** Template configuration */
  template: TemplateConfig;
  /** Raw template content */
  templateContent: string;
  /** VS Code extension API */
  vscode: typeof vscode;
  /** Logger instance */
  logger: {
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, error?: unknown) => void;
    debug: (message: string, data?: unknown) => void;
  };
}

/**
 * Result of a custom template rendering hook
 */
export interface TemplateRenderResult {
  /** Rendered content */
  content: string;
  /** Whether rendering succeeded */
  success: boolean;
  /** Optional error message if failed */
  error?: string;
}

// ============================================================================
// QOR_LOGIC SYSTEM INTERFACE
// ============================================================================

/**
 * QorLogicSystem - Main plugin interface for governance systems
 *
 * Implement this interface to create a custom governance system plugin.
 * The plugin system will call these methods during the sync lifecycle.
 */
export interface QorLogicSystem {
  /**
   * Get the system manifest
   * This is called during plugin registration to load the system configuration.
   */
  getManifest(): SystemManifest;

  /**
   * Detect if the system is installed/active
   * This is called during system detection phase.
   * Override this method to implement custom detection logic.
   *
   * @param context - Detection context with workspace and VS Code information
   * @returns Detection result indicating if the system is detected
   */
  detect?(
    context: DetectionContext,
  ): DetectionResult | Promise<DetectionResult>;

  /**
   * Pre-sync hook called before synchronization starts
   * Override this method to perform validation or preparation tasks.
   *
   * @param context - Sync context with workspace and manifest information
   * @returns Pre-sync result indicating whether to proceed
   */
  preSync?(context: SyncContext): PreSyncResult | Promise<PreSyncResult>;

  /**
   * Post-sync hook called after synchronization completes
   * Override this method to perform cleanup or notification tasks.
   *
   * @param context - Sync context with workspace and manifest information
   * @param preSyncData - Optional data passed from pre-sync hook
   * @returns Post-sync result indicating success
   */
  postSync?(
    context: SyncContext,
    preSyncData?: Record<string, unknown>,
  ): PostSyncResult | Promise<PostSyncResult>;

  /**
   * Custom template rendering hook
   * Override this method to implement custom template rendering logic.
   *
   * @param context - Template render context with workspace and template information
   * @returns Template render result with rendered content
   */
  renderTemplate?(
    context: TemplateRenderContext,
  ): TemplateRenderResult | Promise<TemplateRenderResult>;

  /**
   * Dispose of any resources held by the plugin
   * This is called when the plugin is deactivated.
   */
  dispose?(): void | Promise<void>;
}

// ============================================================================
// PLUGIN REGISTRY TYPES
// ============================================================================

/**
 * Plugin registration options
 */
export interface PluginRegistrationOptions {
  /** The QorLogicSystem plugin instance */
  plugin: QorLogicSystem;
  /** Optional priority for plugin execution order (lower = earlier) */
  priority?: number;
  /** Whether the plugin should be auto-activated */
  autoActivate?: boolean;
}

/**
 * Plugin registry for managing QorLogicSystem plugins
 */
export interface QorLogicPluginRegistry {
  /**
   * Register a new plugin
   *
   * @param options - Plugin registration options
   * @returns Plugin registration ID
   */
  register(options: PluginRegistrationOptions): string;

  /**
   * Unregister a plugin
   *
   * @param id - Plugin registration ID
   */
  unregister(id: string): void;

  /**
   * Get a registered plugin by ID
   *
   * @param id - Plugin registration ID
   * @returns Plugin instance or undefined
   */
  get(id: string): QorLogicSystem | undefined;

  /**
   * Get all registered plugins
   *
   * @returns Array of all registered plugins
   */
  getAll(): QorLogicSystem[];

  /**
   * Get plugins sorted by priority
   *
   * @returns Array of plugins sorted by priority (ascending)
   */
  getSorted(): QorLogicSystem[];
}

// ============================================================================
// EXTENSION POINT DEFINITIONS
// ============================================================================

/**
 * Extension point: Detection
 *
 * Plugins can extend the detection logic to support custom detection mechanisms.
 */
export interface DetectionExtensionPoint {
  /**
   * Register a custom detection strategy
   *
   * @param systemId - System identifier
   * @param detector - Custom detection function
   */
  registerDetector(
    systemId: string,
    detector: (
      context: DetectionContext,
    ) => DetectionResult | Promise<DetectionResult>,
  ): void;

  /**
   * Unregister a custom detection strategy
   *
   * @param systemId - System identifier
   */
  unregisterDetector(systemId: string): void;
}

/**
 * Extension point: Sync
 *
 * Plugins can extend the sync logic to support custom synchronization behavior.
 */
export interface SyncExtensionPoint {
  /**
   * Register a custom sync strategy
   *
   * @param systemId - System identifier
   * @param strategy - Custom sync function
   */
  registerSyncStrategy(
    systemId: string,
    strategy: (context: SyncContext) => Promise<void>,
  ): void;

  /**
   * Unregister a custom sync strategy
   *
   * @param systemId - System identifier
   */
  unregisterSyncStrategy(systemId: string): void;
}

/**
 * Extension point: Template Rendering
 *
 * Plugins can extend the template rendering logic to support custom template engines.
 */
export interface TemplateExtensionPoint {
  /**
   * Register a custom template renderer
   *
   * @param systemId - System identifier
   * @param renderer - Custom template renderer function
   */
  registerRenderer(
    systemId: string,
    renderer: (
      context: TemplateRenderContext,
    ) => TemplateRenderResult | Promise<TemplateRenderResult>,
  ): void;

  /**
   * Unregister a custom template renderer
   *
   * @param systemId - System identifier
   */
  unregisterRenderer(systemId: string): void;
}

/**
 * Combined extension points interface
 */
export interface QorLogicExtensionPoints {
  /** Detection extension point */
  detection: DetectionExtensionPoint;
  /** Sync extension point */
  sync: SyncExtensionPoint;
  /** Template rendering extension point */
  template: TemplateExtensionPoint;
}

// ============================================================================
// MINIMAL HOOKS RECOMMENDATION
// ============================================================================

/**
 * Minimal hooks for basic plugin functionality
 *
 * These are the essential hooks that most plugins should implement:
 *
 * 1. `detect()` - Required for determining if the system is installed
 * 2. `preSync()` - Recommended for validation before sync
 * 3. `postSync()` - Recommended for cleanup after sync
 * 4. `renderTemplate()` - Optional for custom template rendering
 *
 * Example minimal implementation:
 *
 * ```typescript
 * export class MySystemPlugin implements QorLogicSystem {
 *   getManifest(): SystemManifest {
 *     return { ... };
 *   }
 *
 *   detect(context: DetectionContext): DetectionResult {
 *     return { detected: true };
 *   }
 *
 *   preSync(context: SyncContext): PreSyncResult {
 *     return { proceed: true };
 *   }
 *
 *   postSync(context: SyncContext): PostSyncResult {
 *     return { success: true };
 *   }
 * }
 * ```
 */
export interface MinimalQorLogicSystem extends QorLogicSystem {
  detect(context: DetectionContext): DetectionResult | Promise<DetectionResult>;
  preSync(context: SyncContext): PreSyncResult | Promise<PreSyncResult>;
  postSync(context: SyncContext): PostSyncResult | Promise<PostSyncResult>;
}
