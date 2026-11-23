# ADR-0003: Native medieval craft and living characters (anti-generic-AI direction)

- **Date:** 2026-11-23T19:11:35Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)

## Context

Generic AI-made game UIs look the same: neon glows, purple/cyan gradients, uniform rounded SaaS cards, default
shadows, flat grey panels. This project must look native to a medieval royal court or alchemist's hall, and every
element should feel crafted for this world.

## Decision

- **Materials as tokens:** dark stone (`#1E1A16`…), charred oak, hammered wrought iron, tarnished brass and antique gold
  (`#D4A24C`), crimson velvet (`#7A1F1F`), vellum (`#F3E7CE`) with paper grain (SVG turbulence, no image files).
  Ink is `#1A140E`/`#241B12` on parchment, and vellum or gold on stone and iron.
- **Shapes:** no uniform rounded boxes. Panels are parchment sheets, iron-banded oak boards, pennants and wax seals,
  with bevels, rivets and engraved rules. Shadows are directional (lamp-light from the upper left).
- **Type:** *IM Fell English SC* for display (printed early-modern feel), with fallbacks to *Cinzel* and Georgia.
  *EB Garamond* for text, with `tabular-nums lining-nums` for every multiplier, payout, odds value and tier number.
- **Wheel:** procedural astrolabe-like geometry: engraved radial divisions, a Roman-numeral chapter ring, a riveted iron
  tyre, a brass hub with concentric rings, and heraldic charges (crown, fleur-de-lis, sword, chalice) on advance sectors
  versus a skull on crimson and soot for curse sectors.
- **Characters:** *Master Alchemist Aldric Vane*, a robed figure with a tall hat, beard, satchel and flask, rigged in Canvas
  (FK, keyframed clips plus a procedural layer). Clips: idle, wind-up and push the wheel, watch the pointer, tension near
  curses, triumph, flinch, bow on collect. A **raven familiar** perches on the pointer housing: it bobs and preens,
  cocks its head at ticks, and flaps on a bust.
- **FX:** dust motes in lamp light; warm embers and brass glints only on high rungs; wax-seal stamps on ladder advance;
  soot, ash and a controlled shake on a curse; coins on collect. No neon and no glow blooms.

## Alternatives Considered

1. **Component library + theme**: fast, but it reads as a generic web app in costume.
2. **Illustrated sprite sheets**: richer art, but no runtime aim/look and needs an art pipeline. Possible later behind the same rig.

## Trade-offs

| We gain | We give up |
|---|---|
| Cohesive, recognisably hand-made world | More custom CSS and canvas code |
| Characters react precisely to physics (pointer, sectors) | Procedural art is stylised |
