/** Errors crossing a provider port. Providers never throw (ADR-0005). */
export const ProviderErrorCode = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  VALIDATION: 'VALIDATION',
  ROUND_NOT_FOUND: 'ROUND_NOT_FOUND',
  SERVER: 'SERVER',
} as const;
export type ProviderErrorCode = (typeof ProviderErrorCode)[keyof typeof ProviderErrorCode];

export type ProviderError = {
  readonly code: ProviderErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
};

export type ProviderResult<T> =
  | { readonly ok: true; readonly requestId: number; readonly value: T }
  | { readonly ok: false; readonly requestId: number; readonly error: ProviderError };
