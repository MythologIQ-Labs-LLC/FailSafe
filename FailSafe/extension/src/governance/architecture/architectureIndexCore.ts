/**
 * Typed wrapper over the architecture index validator core (#531 LD2).
 *
 * The checks are plain CommonJS shared with the repository gate
 * (`scripts/check-architecture-index.cjs`); esbuild inlines the require into
 * dist, and tsc output reaches the same files through `../../../scripts/lib`
 * (src/ and out/ are siblings). The interfaces below are local; the parity rows
 * in `src/test/docs/architecture-index.test.cjs` hold the core to them.
 */

export interface RegistryRow {
  id: string;
  domain: string;
  doc: string;
  status: string;
  owner: string;
  supersedes: string;
  related: string;
  governance_ref: string;
  contract: string;
  verification: string;
  updated_by: string;
  /** Repository-relative POSIX path of the doc link, or null when it is not a safe relative link. */
  docPath: string | null;
}

export interface IndexProblem {
  code: string;
  detail: string;
}

export interface ValidationInput {
  indexText: string;
  readmeText: string;
  governanceText: string;
  tracked: string[];
}

export interface ValidationResult {
  problems: IndexProblem[];
  rows: RegistryRow[];
  globs: string[];
  legacy: string[];
  normativeMatches: string[];
}

export interface IndexProfile {
  indexPath: string;
  readmePath: string;
  governancePath: string;
  linkBase: string;
  registryTail: string;
  dualRegistrationPrefix: string;
  normativeGlobs: string[];
  legacyGlobs: string[];
  checks: Record<string, boolean>;
}

interface CoreModule {
  COLUMNS: string[];
  matchesGlob(glob: string, p: string): boolean;
  hasRegistryHeader(text: string): boolean;
  suggestFor(file: string, rows: Array<Pick<RegistryRow, "docPath" | "domain" | "status">>): string[];
  validate(input: ValidationInput, profile: IndexProfile): ValidationResult;
}

interface ProfilesModule {
  DEFAULT_INDEX_PATH: string;
  userRepoProfile(indexPath?: string): IndexProfile;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require("../../../scripts/lib/architecture-index-core.cjs") as CoreModule;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const profiles = require("../../../scripts/lib/architecture-index-profiles.cjs") as ProfilesModule;

export const REGISTRY_COLUMNS: readonly string[] = core.COLUMNS;
export const DEFAULT_INDEX_PATH: string = profiles.DEFAULT_INDEX_PATH;
export const matchesGlob = (glob: string, p: string): boolean => core.matchesGlob(glob, p);
export const hasRegistryHeader = (text: string): boolean => core.hasRegistryHeader(text);
export const suggestFor = (file: string, rows: Array<Pick<RegistryRow, "docPath" | "domain" | "status">>): string[] =>
  core.suggestFor(file, rows);
export const validateIndex = (input: ValidationInput, profile: IndexProfile): ValidationResult =>
  core.validate(input, profile);
export const userRepoProfile = (indexPath: string): IndexProfile => profiles.userRepoProfile(indexPath);
