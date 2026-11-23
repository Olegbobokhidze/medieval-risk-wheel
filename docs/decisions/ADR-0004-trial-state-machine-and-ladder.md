# ADR-0004: Trial state machine and escalation ladder

- **Date:** 2026-11-23T19:11:35Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0002, ADR-0005

## Context

The player stakes once, then spins to climb a five-rung ladder (*Novitiate → Squire → Knight → Lord → Sovereign Crown*).
After each climb they choose **Claim** (collect) or **Risk the next spin**. Higher rungs carry more curse sectors.
Double-spin, double-collect and stale-response races must be impossible.

## Decision

States (const object + union): `IDLE, CONFIGURING, SPINNING, RESOLVING_SECTOR, LADDER_DECISION, COLLECTING, ROUND_OVER_BUST, ROUND_OVER_COLLECTED, ERROR_RECOVERABLE`.

```
IDLE ─START→ CONFIGURING ─OPENED→ SPINNING ─SPIN_RESULT→ RESOLVING_SECTOR ─WHEEL_SETTLED→ LADDER_DECISION | ROUND_OVER_BUST | COLLECTING (crown reached)
LADDER_DECISION ─RISK→ SPINNING      LADDER_DECISION ─CLAIM→ COLLECTING ─COLLECTED→ ROUND_OVER_COLLECTED
ROUND_OVER_* ─START→ CONFIGURING (instant restart)      request failures → ERROR_RECOVERABLE
```

- The first spin follows the stake automatically. The wheel launches on entering SPINNING (instant feedback) while the
  request is in flight. RESOLVING_SECTOR lasts until the wheel settles on the server's sector.
- A pure reducer and allow-list table. Events not allowed in the current state are **rejected and logged**, never queued.
  Each request has a monotonic `requestId`, and stale or duplicate answers are discarded.
- Errors: a failed open refunds the stake and returns to IDLE. A failed spin or collect must be **retried** with the same
  requestId (the provider is idempotent).
- **Ladder maths:** every rung has its own wheel with 12 equally likely sectors and `c_k` curse sectors.
  `P(reach k) = Π (1 − c_i/12)`, and the rung multiplier is `floor₂((1 − edge)/P(reach k))`. Every claim-at-k strategy
  therefore returns at most `1 − edge` (4% edge), which is tested exactly.
- Presets: `SQUIRE_SAFE`, `KNIGHT_BALANCED`, `SOVEREIGN_HIGH_RISK` (different curse counts per rung).

## Alternatives Considered

1. **Single static wheel with multiplier sectors**: simpler, but no escalating peril, and the ladder carries no meaning.
2. **Boolean flags**: impossible states become possible.

## Trade-offs

| We gain | We give up |
|---|---|
| Races unrepresentable; exact RTP bound | New states need table and test updates |
| The wheel itself shows the growing peril | The wheel face is re-baked per rung |
