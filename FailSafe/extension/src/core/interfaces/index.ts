/**
 * Core abstraction interfaces for FailSafe dual-track architecture
 *
 * These interfaces decouple all services from vscode.* APIs,
 * enabling platform-agnostic implementations and testability.
 */

export type { ISecretStore } from './ISecretStore';
export type { IStateStore } from './IStateStore';
export type { IConfigProvider } from './IConfigProvider';
export type { ILogSink, LogLevel } from './ILogSink';
export type { INotificationService } from './INotificationService';
export type { IFeatureGate, FeatureTier, FeatureFlag } from './IFeatureGate';
export { FeatureGateError } from './IFeatureGate';
