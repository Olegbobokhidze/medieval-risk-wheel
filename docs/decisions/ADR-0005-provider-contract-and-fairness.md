# ADR-0005: Server-authoritative TrialProvider with provably-fair spins

- **Date:** 2026-11-23T19:11:35Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0004

## Context

Real-money operators keep outcomes server-side and increasingly expect verifiable fairness. The client must behave as it
would against a real remote game server, including latency, failures and retries.

## Decision

```ts
type TrialProvider = {
  openTrial(req): Promise<ProviderResult<TrialOpened>>;   // serverSeedHash commitment + nonce, stake debited
  spin(req): Promise<ProviderResult<SpinResult>>;          // sectorIndex + landing offset + new rung; curse → disclosure
  collect(req): Promise<ProviderResult<CollectResult>>;    // payout + disclosure
  getBalance(): Promise<number>;
};
```

- Spin *n* of a trial: `h = SHA-256(serverSeed:clientSeed:nonce:n)`. The sector is `uint32(h[0..4]) mod 12`, and the landing offset is
  `uint16(h[4..6]) / 65536`. Both the landing spot inside the sector and the sector itself are server-decided and verifiable.
- The server reveals `serverSeed` when the trial ends. The Inspector re-derives every spin and checks the commitment.
- Idempotent by requestId (a lost response is recovered by retry). Faults and forced outcomes exist for QA, and forced
  outcomes are detected by verification.
- The client cross-checks the reported rung and multiplier against its own maths, and a mismatch becomes a `VALIDATION` error.

## Alternatives Considered

1. **Client-side RNG**: unrealistic for the industry.
2. **Server sends a final angle**: it couples the server to the client's wheel geometry. A sector plus offset is geometry-agnostic.

## Trade-offs

| We gain | We give up |
|---|---|
| Real backend drops in; verifiable outcomes | Mock "server" ships in the demo bundle |
