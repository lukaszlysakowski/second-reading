# Second Reading — Generative Plotter Art

## Project
A p5.js maker where the system reads its own output: generation 0 writes a classic Field Script page; every generation after is written into a density grid read from the previous generation's ink. Autonomous — NO rating system, no learning file, no server (the manual feedback loop was deliberately removed by the user). Public repo: https://github.com/lukaszlysakowski/second-reading — live maker: https://lukaszlysakowski.github.io/second-reading/

## The Feedback System
- Reading: marks binned into a 48/64/96 grid, one 3×3 blur, peak-normalized; next generation samples it bilinearly with `d_raw = max(sqrt(sample), 0.09)` (sqrt response + exploration floor — both load-bearing, see spec amendment)
- Polarity species per seed: attract (condensed clusters), repel (lacy fill), alternate (oscillating) — UI can override
- **Homeostat contract (user-approved amendment): viability guardrails [0.05, 0.75], NOT band compliance** — per-polarity gains (attract warm-starts 2.5), EMA-damped sqrt-proportional correction, sub-viable generations trigger a sine-band rewrite. Coverage is character: attract settles sparse, repel full.
- Self-termination: grid delta < ε (patience Quick/Standard/Long) or generation cap; minimum 3 generations; convergence requires the page be alive (cov ≥ 0.05). Red marks = the 12 cells still changing most at termination.

## Lineage
Cybernetic Serendipity (ICA 1968), Pask's Colloquy of Mobiles, Ashby's homeostat — via the digital-art skill's /art-history library (invoke that skill for art work in this family). Generation core ported from [Palimpsest](https://github.com/lukaszlysakowski/palimpsest)'s Field Script port, carrying the Klee → Nake → Nees chain.

## Architecture
- `index.html` / `index.js` — single maker, no build step, p5 vendored; static serve (launch config `second-reading`, npx serve port 3460)
- `runGeneration(prevGrid, gain, effectivePolarity, genSeed, res)` is PURE — reseeds internally; the regenerate loop resolves alternate's per-generation polarity before calling it
- Determinism: (seed, params) → identical run; Math.random only at seed choice and randomizeAll
- Export: one SVG pen pass per generation (Border / Gen 1..N / Convergence / Signature) — plot any prefix to replay the run
- Design history + the homeostat tuning evidence: `docs/superpowers/` and `.superpowers/sdd/progress.md`

## Palette & A11y
Square 2170×2170. Paper #F7E6D4, ink #1A1613, convergence red #A93B2A (only red on the page). Sidebar CSS WCAG-tuned (--muted #969082, .ctrl min-height 24px) — Lighthouse a11y 100; don't regress.

## Controls
Feedback (polarity, grid, target, patience) · Marks (density, depth) · Style (wobble) · Run (read-only outcome) · randomize / refresh / svg / png / png 4x · click canvas = new seed. `exportPNG(scale)` uses `pixelDensity(scale)` to re-render at 4x (8680×8680) then restores the 1x display — no drawing-code changes, wobble is geometry-seeded so hi-res is pixel-faithful.

**`depth` (3/4/5, default 5) = mark scale.** It caps subdivision recursion in `subdivideCell` (`depth < maxDepth`), so lower = larger/coarser glyphs, higher = finer/smaller. The `size > cs / 180` term is only a safety floor (~12px) — it sits below the smallest cell any in-range depth produces, so maxDepth is what binds. Note the historical quirk: the original Field Script depth range was [5,6,7] but the size floor was `cs/64` (~34px), which capped subdivision at ~depth 4 — so 5/6/7 all rendered identically and the control was inert. Fixed 2026-07-07 by moving the range to [3,4,5] and dropping the floor to cs/180. Don't restore the higher range or raise the floor without re-checking depth still binds.
