// Bicameral MCP integration barrel.
export { BicameralMcpClient } from './BicameralMcpClient';
export {
  DEFAULT_WINDOWS_EXTRA_ROOTS,
  defaultExtraRoots,
  isSafeBicameralCommand,
  isSafeBicameralCommandResolved,
  probeInstallState,
} from './install-detector';
export type { SafeCommandOptions } from './install-detector';
export { runBicameralInstall } from './install-handler';
export type {
  BicameralInstallState,
  BicameralInstallProbe,
  BicameralDecision,
  BicameralCodeBinding,
  BicameralFeatureBrief,
  BicameralDriftStatus,
  BicameralPreflightResult,
  BicameralRatifyVerdict,
  InstallMode,
  InstallStep,
  InstallProgressEvent,
} from './types';
