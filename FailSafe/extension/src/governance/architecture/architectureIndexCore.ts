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
  /** #531 slice 2: the row's 1-based line in the index text. */
  line: number;
}

/** #531 slice 2: optional structured fields beside `code` and `detail` (never parsed from `detail`). */
export interface IndexProblem {
  code: string;
  detail: string;
  /** Registry row ids the problem is about. */
  ids?: string[];
  /** The domain key (conflicting-canonical). */
  domain?: string;
  /** The registry column (missing-path, unsafe-link, dangling-ref). */
  field?: string;
  /** The id a supersedes or related cell names (dangling-ref). */
  ref?: string;
  /** A repository path (missing-path, duplicate-path, unregistered-normative). */
  path?: string;
  /** The normative glob a document matched (unregistered-normative). */
  glob?: string;
  /** bad-row with the wrong cell count: the row's 1-based line and its cell count (the row is not parsed). */
  line?: number;
  cells?: number;
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
  STATUSES: string[];
  matchesGlob(glob: string, p: string): boolean;
  hasRegistryHeader(text: string): boolean;
  suggestFor(file: string, rows: Array<Pick<RegistryRow, "docPath" | "domain" | "status">>): string[];
  validate(input: ValidationInput, profile: IndexProfile): ValidationResult;
  domainKey(domain: string): string;
  INTAKE_CHARSET: RegExp;
  nonAsciiCodePoints(s: string): string[];
  hiddenCharacterProblem(s: string): string | null;
  domainIntakeProblem(domain: unknown, registeredDomains: string[], options?: { authority?: boolean }): string | null;
  renderDomainForReview(s: string): string;
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
export const REGISTRY_STATUSES: readonly string[] = core.STATUSES;
export const DEFAULT_INDEX_PATH: string = profiles.DEFAULT_INDEX_PATH;
export const matchesGlob = (glob: string, p: string): boolean => core.matchesGlob(glob, p);
export const hasRegistryHeader = (text: string): boolean => core.hasRegistryHeader(text);
export const suggestFor = (file: string, rows: Array<Pick<RegistryRow, "docPath" | "domain" | "status">>): string[] =>
  core.suggestFor(file, rows);
export const validateIndex = (input: ValidationInput, profile: IndexProfile): ValidationResult =>
  core.validate(input, profile);
export const userRepoProfile = (indexPath: string): IndexProfile => profiles.userRepoProfile(indexPath);
// #531 slice 2: domain keys, intake and review rendering (see the core for the rules).
export const domainKey = (domain: string): string => core.domainKey(domain);
export const INTAKE_CHARSET: RegExp = core.INTAKE_CHARSET;
export const nonAsciiCodePoints = (s: string): string[] => core.nonAsciiCodePoints(s);
export const hiddenCharacterProblem = (s: string): string | null => core.hiddenCharacterProblem(s);
export const domainIntakeProblem = (domain: unknown, registeredDomains: string[], options: { authority?: boolean } = {}): string | null =>
  core.domainIntakeProblem(domain, registeredDomains, options);
export const renderDomainForReview = (s: string): string => core.renderDomainForReview(s);
