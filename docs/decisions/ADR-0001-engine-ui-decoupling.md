# ADR-0001: Pure engine, layered single-package repo

- **Date:** 2026-11-23T19:11:35Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0002, ADR-0004, ADR-0005

## Context

The game ships as its own deployable with its own link. Reviewers at game providers look for deterministic,
testable game logic that is clearly separated from rendering, so that double-spin and double-collect races
can't hide inside component lifecycles.

## Decision

- One Vite package with ESLint-enforced layers: `core ← engine ← adapters/audio/config ← scene ← ui`.
- `core` and `engine` are pure TypeScript (no DOM, no React). Time and randomness are injected.
- The engine talks to the outside only through ports: `TrialProvider` (backend) and `WheelPort` (wheel animation).
- `scene` is plain Canvas 2D with no React. `ui` composes everything and reads engine state through `useSyncExternalStore`.

## Alternatives Considered

1. **Monorepo packages**: stronger physical boundaries, but heavier tooling for one deployable.
2. **Store library as engine** (Redux/Zustand): couples rules to UI state and hides effect ordering.

## Trade-offs

| We gain | We give up |
|---|---|
| Engine and physics maths tested in Node in milliseconds | Boundaries rely on lint rules |
| Single build and deploy | Port contracts need design up front |
