# ADR-0002: Canvas scene with deterministic wheel kinematics and pin/pointer physics

- **Date:** 2026-11-23T19:11:35Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0001, ADR-0004

## Context

The wheel must feel physical: a launch, high-speed motion, natural friction down to the **server's** sector, and a
hinged pointer that ticks against sector pins. Characters and FX must react without ever blocking or desyncing the trial.

## Decision

- **One Canvas 2D scene, one rAF loop** (delta time) draws the wheel, pointer, characters (alchemist and raven) and FX.
  The static wheel face is pre-rendered to an offscreen canvas, re-baked only when the rung or size changes.
  Each frame then rotates that bitmap.
- **Wheel kinematics are pure engine maths** (`engine/wheel.ts`):
  - launch: a wind-back anticipation, then an impulse to cruise speed. Cruise continues while the outcome is pending.
  - landing: `planLanding(θ, ω, sector, offset)` picks the final angle that puts sector + offset under the pointer.
    It adds whole turns so the deceleration lasts 2.4–4.4 s, then decelerates with
    `θ(u) = θ₀ + D·(1 − (1 − u)³)`, with `T = 3D/ω`, so the velocity is continuous at the hand-off.
  - settle: a small overshoot, then the pointer pin pulls the wheel back exactly onto the target.
- **Pointer** = a damped angular spring hinged at the top. Each sector boundary carries a pin. While a pin passes under
  the pointer tip, it pushes the pointer aside (a geometric constraint). When the pin releases, the spring snaps back
  and a **tick** is emitted (audio, raven, inspector). The number of ticks equals the number of boundaries crossed. This is unit-tested.
- The scene **observes** the trial. The only coupling is `WheelPort.land()`, which resolves when the wheel settles. A
  fallback timeout resolves it anyway if rAF is paused (background tab).

## Alternatives Considered

1. **CSS rotate with cubic-bezier**: no velocity continuity with the cruise phase, no pin contact, and the pointer can't react to the wheel.
2. **Full rigid-body physics (Box2D-style)**: can't land on a server-chosen sector deterministically without cheating forces.
3. **PixiJS**: capable, but about 170 KB for a scene that Canvas 2D draws comfortably at 60 fps.

## Trade-offs

| We gain | We give up |
|---|---|
| Physical feel, yet always lands on the server's sector | Hand-written physics to maintain |
| Exact, testable tick count and landing angle | Canvas text and art are procedural, not illustrated |
