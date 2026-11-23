/** Ports (ADR-0005, ADR-0002). Implementations: adapters/ (backend) and scene/ (wheel). */
import type { ProviderResult } from '../core/result';
import type { RiskPresetId, SectorKind } from './ladder';

export type TrialParams = {
  readonly presetId: RiskPresetId;
  /** Stake in minor units. */
  readonly bet: number;
  readonly clientSeed: string;
};

export type OpenTrialRequest = TrialParams & { readonly requestId: number };

export type TrialOpened = {
  readonly trialId: string;
  /** SHA-256(serverSeed): the commitment, shown before any spin. */
  readonly serverSeedHash: string;
  readonly nonce: number;
  readonly balanceAfter: number;
};

export type SpinRequest = { readonly requestId: number; readonly trialId: string; /** 1-based spin number within the trial. */ readonly spin: number };

export type SpinResult = {
  readonly spin: number;
  readonly sectorIndex: number;
  /** 0..1 landing position inside the sector (server-decided, verifiable). */
  readonly offset: number;
  readonly kind: SectorKind;
  /** Rung after this spin (unchanged on a curse). */
  readonly rung: number;
  readonly multiplier: number;
  /** Revealed when the trial ends on a curse. */
  readonly serverSeed: string | null;
};

export type CollectRequest = { readonly requestId: number; readonly trialId: string };

export type CollectResult = {
  readonly payout: number;
  readonly multiplier: number;
  readonly rung: number;
  readonly balanceAfter: number;
  readonly serverSeed: string;
};

export type TrialProvider = {
  readonly id: string;
  openTrial(req: OpenTrialRequest): Promise<ProviderResult<TrialOpened>>;
  /** Idempotent per requestId. */
  spin(req: SpinRequest): Promise<ProviderResult<SpinResult>>;
  collect(req: CollectRequest): Promise<ProviderResult<CollectResult>>;
  getBalance(): Promise<number>;
};

/** The wheel as the trial sees it. The scene implements it (ADR-0002). */
export type WheelPort = {
  /** Start the launch immediately (instant feedback while the request is in flight). */
  launch(options: { readonly turbo: boolean; readonly rung: number }): void;
  /** Decelerate onto the server's sector; resolves when the wheel has settled. */
  land(sectorIndex: number, offset: number, options: { readonly turbo: boolean; readonly kind: SectorKind }): Promise<void>;
  /** Error path: coast to a stop without an outcome. */
  abort(): void;
};

export function createImmediateWheel(): WheelPort {
  return { launch: () => undefined, land: () => Promise.resolve(), abort: () => undefined };
}
