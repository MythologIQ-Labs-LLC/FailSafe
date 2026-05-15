// Bicameral MCP integration barrel.
export { BicameralMcpClient } from './BicameralMcpClient';
export { probeInstallState, isSafeBicameralCommand } from './install-detector';
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
