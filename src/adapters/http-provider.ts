/**
 * Reference adapter for a real game server. Expected endpoints:
 *   POST {base}/trials               OpenTrialRequest → TrialOpened
 *   POST {base}/trials/:id/spin      SpinRequest      → SpinResult
 *   POST {base}/trials/:id/collect   CollectRequest   → CollectResult
 *   GET  {base}/balance                                → { balance }
 * Every call sends `Idempotency-Key: <requestId>` and never throws.
 */
import { ProviderErrorCode, type ProviderResult } from '../core/result';
import type { CollectRequest, CollectResult, OpenTrialRequest, SpinRequest, SpinResult, TrialOpened, TrialProvider } from '../engine/ports';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export class HttpProvider implements TrialProvider {
  readonly id = 'http';
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly o: { readonly baseUrl: string; readonly sessionToken: string; readonly timeoutMs?: number; readonly fetchImpl?: typeof fetch }) {
    this.base = o.baseUrl.replace(/\/$/, '');
    this.fetchImpl = o.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  openTrial(req: OpenTrialRequest): Promise<ProviderResult<TrialOpened>> {
    return this.post('/trials', req.requestId, req, (j) => typeof j.trialId === 'string' && typeof j.serverSeedHash === 'string');
  }
  spin(req: SpinRequest): Promise<ProviderResult<SpinResult>> {
    return this.post(`/trials/${encodeURIComponent(req.trialId)}/spin`, req.requestId, req, (j) => Number.isInteger(j.sectorIndex) && typeof j.offset === 'number' && (j.kind === 'advance' || j.kind === 'curse'));
  }
  collect(req: CollectRequest): Promise<ProviderResult<CollectResult>> {
    return this.post(`/trials/${encodeURIComponent(req.trialId)}/collect`, req.requestId, req, (j) => Number.isInteger(j.payout) && typeof j.serverSeed === 'string');
  }
  async getBalance(): Promise<number> {
    const res = await this.fetchImpl(`${this.base}/balance`, { headers: { authorization: `Bearer ${this.o.sessionToken}` } });
    const j: unknown = await res.json();
    if (isObj(j) && typeof j.balance === 'number') return j.balance;
    throw new Error('Malformed balance response');
  }

  private async post<T>(path: string, requestId: number, body: unknown, valid: (j: Record<string, unknown>) => boolean): Promise<ProviderResult<T>> {
    const ctrl = new AbortController();
    const timer = globalThis.setTimeout(() => ctrl.abort(), this.o.timeoutMs ?? 6000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.o.sessionToken}`, 'idempotency-key': String(requestId) },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const code = res.status === 402 ? ProviderErrorCode.INSUFFICIENT_FUNDS : res.status === 404 ? ProviderErrorCode.ROUND_NOT_FOUND : ProviderErrorCode.SERVER;
        return { ok: false, requestId, error: { code, message: `HTTP ${res.status}`, recoverable: res.status < 500 || res.status === 503 } };
      }
      const j: unknown = await res.json();
      if (!isObj(j) || !valid(j)) return { ok: false, requestId, error: { code: ProviderErrorCode.VALIDATION, message: 'Malformed server response.', recoverable: true } };
      return { ok: true, requestId, value: j as T };
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      return { ok: false, requestId, error: { code: aborted ? ProviderErrorCode.TIMEOUT : ProviderErrorCode.NETWORK, message: String(err), recoverable: true } };
    } finally {
      globalThis.clearTimeout(timer);
    }
  }
}
