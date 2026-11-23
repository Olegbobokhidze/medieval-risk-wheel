# AGENTS.md: Operating Guide for AI Coding Agents

*The Sovereign's Trial & Alchemist Wheel*, created by **Oleg Bobokhidze**.
Read this whole file before your first edit in a session.

---

## 1. Mandatory workflow before editing

1. **Read every ADR** in [`docs/decisions/`](docs/decisions/). `Accepted` ADRs are binding. To change direction,
   write a new ADR that supersedes the old one (§5). Never diverge silently.
2. **Read the recent log**: `tail -n 20 docs/ai/decision-log.jsonl` (newest last).
3. **Read the latest session report**: `ls docs/ai/reports/ | sort | tail -n 2`. *Known limitations* and *Next steps* are the backlog.
4. **Run the baseline**: `pnpm verify` must pass before you change anything. If it fails, report it first.

## 2. Directory structure and layer boundaries

```
src/
  core/      generic infra: table-driven Machine runner + transition log, clock, rng, money, provider results
  engine/    ladder & payout maths, wheel angle maths, pointer/pin geometry, trial state machine, controller, ports
  adapters/  TrialProvider implementations: MockProvider (provably fair, latency, faults), HttpProvider, verifyTrial
  config/    risk presets & ladder tiers, medieval palette, audio cue map
  audio/     synthesized Web Audio cues (ratchet, chime, fanfare, thud, seal), mute + safe fallback
  scene/     Canvas 2D: wheel renderer, pointer physics, characters (alchemist, raven), FX, rAF loop
  ui/        React HUD: ledger, escalation ladder, risk selector, controls, rules drawer, Provider Inspector
```

| Layer | May import | Must NOT import |
|---|---|---|
| `core`, `engine` | each other (engine → core) | React, DOM globals, `adapters`, `scene`, `ui`, `audio`, `config` |
| `adapters`, `audio`, `config` | `core`, `engine` | React, `scene`, `ui` |
| `scene` | `core`, `engine`, `config` | React, `ui`, `adapters`, `audio` |
| `ui` | everything | — |

ESLint enforces these rules (`eslint.config.js`). Do not disable them; change them through an ADR.

**Scene rule (ADR-0002):** characters, wheel animation and FX only **observe** the game. The single sanctioned
coupling is `WheelPort.land()`: the trial waits for the wheel to settle on the server's sector, and a fallback timeout
guarantees progress if animation frames are paused.

## 3. Coding standards

- Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **No `enum`, no `interface`.** Use `const X = { … } as const` + `type X = (typeof X)[keyof typeof X]`, and `type` aliases.
- Results cross boundaries as discriminated unions. Providers never throw.
- Engine code is pure: inject `Clock`/`Rng`. Never call `Math.random()` or `Date.now()` there.
- Money is integer minor units. Multipliers are numbers floored to 2 decimals; round only when converting to money.
- Numbers in the UI use `font-variant-numeric: tabular-nums` so they never jitter.
- CSS: even integer-pixel line heights from `src/ui/styles/tokens.css`. Primary actions in modals and drawers are right-aligned.
- Animate only `transform` and `opacity` in CSS. Canvas work stays allocation-free per frame (pools, pre-rendered layers).
- **Visual direction (ADR-0003):** a medieval court and alchemist's hall: stone, oak, wrought iron, tarnished brass,
  crimson velvet, vellum. **Forbidden:** neon or glow tropes, purple/cyan gradients, SaaS-style uniform rounded cards,
  default drop shadows, flat grey dashboards.
- Every engine behaviour gets a Vitest test next to it (`*.test.ts`).
- Commits: imperative, ≤72 chars, scoped (`engine:`, `scene:`, `ui:`, `docs:` …).

## 4. Recording decisions (timestamped)

```bash
pnpm log:decision -- --actor agent --area engine/state-machine \
  --decision "…" --rationale "…" --files src/engine/machine.ts --tradeoffs "…"
```

The script validates the fields and appends one JSONL line with an ISO-8601 UTC `timestamp`.
The log is **append-only**: never edit or delete lines. Reverse a decision by appending a new entry.

## 5. When to write an ADR

Write `docs/decisions/ADR-XXXX-kebab-title.md` (copy `ADR-TEMPLATE.md`, next free number) when you change a layer
boundary or a port contract (`TrialProvider`, `WheelPort`), add or remove a runtime dependency, change the visual
direction, or supersede an ADR. In that last case, mark the old one `Superseded by ADR-XXXX`; that's the only allowed edit.
Also add a log entry that points to the new ADR.

## 6. End-of-session report (mandatory)

```bash
pnpm report:new -- <slug>     # docs/ai/reports/YYYY-MM-DD-<slug>.md
```

Fill in every section with **real command output**. Never claim a check you didn't run.

## 7. Verification

```bash
pnpm verify      # typecheck → lint (architecture rules) → tests → build
pnpm dev         # http://localhost:5175 · ` (backtick) opens the Provider Inspector
pnpm e2e         # with pnpm dev running. Env: BASE_URL, CHROME_PATH, E2E_GPU=0
```

UI, scene or state-flow changes must also pass `pnpm e2e`. Only quote FPS numbers from a hardware-GPU run.
