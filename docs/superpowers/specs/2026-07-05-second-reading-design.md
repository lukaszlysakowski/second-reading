# Second Reading — Design Spec

**Date:** 2026-07-05
**Status:** Approved (design sections §1–§3 approved in session)

## Concept

A Field Script evolution with no external referent: the system reads its own
output. Generation 0 writes a classic Field Script page; every generation
after replaces the density wave with a grid-sampled reading of the previous
generation's ink, steered by a per-seed polarity (attract / repel /
alternate). An autonomous homeostat holds every generation inside a viability window (no extinction, no saturation) while steering toward a target band,
and the loop terminates itself when the page stops changing (grid delta < ε)
or a generation cap is reached. There is NO manual feedback loop — no rating
system, no learning file, no server. The full generational history plots as
separate pen passes; small red marks record where the system was still moving
when it declared itself done.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Feedback reading | Approach A — analytic density grid (64×64 default), stroke-length binning + one 3×3 blur, normalized; NO raster readback |
| Polarity | Rolled per seed among attract / repel / alternate; UI override (auto/attract/repel/alternate) |
| What plots | ALL generations, one SVG pen pass each, older = lighter weight |
| Autonomy | Homeostat (proportional gain control on coverage) + self-termination (delta < ε or maxGen); minimum 3 generations |
| Format | Square 2170×2170, Field Script's 4% border idiom; paper #F7E6D4, ink #1A1613, red #A93B2A for convergence marks ONLY |
| Storage | Plain local directory — **NO git repo** (user decision; version control and publishing both deferred). Build process uses file snapshots instead of commits. |
| Server | None. `npx serve` on port **3460** via launch config; no server.py, no persistence |
| Scope | Maker UI + layered SVG/PNG export. No rating/learning system (explicitly removed), no threads, no highways |

## §1 Structure & data model

**Location:** `/Users/lukasz/genuary-2026/sketches/second-reading` (plain
directory, not a git repo).

**Files:**
- `index.html` — sidebar maker; CSS carried from palimpsest
  (`~/genuary-2026/sketches/palimpsest/index.html`, a11y-tuned: `--muted:
  #969082`, `.ctrl` min-height 24px — do not regress). Naming requirement:
  title/sidebar "Second Reading", subtitle "written · reread · converged",
  zero user-visible "Palimpsest"/"Core Samples" strings.
- `index.js` — generation engine, feedback loop, rendering, export.
- `p5.min.js` vendored (copy from palimpsest), `README.md`, `LICENSE`.
- `.claude/launch.json` — `npx serve . --listen 3460`, port 3460.
- No `.gitignore` needed until a repo exists; keep scratch under
  `.superpowers/` anyway (snapshots for build reviews).

**Data model:**

```js
state = {
  masterSeed,
  generations: [            // oldest first
    { idx,
      segments: [],         // page-space marks (same atom shapes as Field Script glyphs)
      field,                // Float64Array grid THIS generation was written against
      stats: { coverage, delta, gain } }
  ],
  polarity,                 // 'attract' | 'repel' | 'alternate' (rolled per seed unless UI overrides)
  converged,                // true if stopped by delta < ε, false if maxGen hit
  convergenceMarks: []      // red atoms placed at termination
}
```

Grid helpers (pure, node-testable):
- `binSegments(segments, res)` → Float64Array res×res — stroke length
  distributed over crossed cells via sampled midpoints
- `blur3(grid, res)` → one 3×3 box blur pass
- `normalize(grid)` → max 1 (all-zero grid stays zero)
- `bilinearSample(grid, res, x, y)` → 0..1
- `coverage(grid)` = fraction of cells > `INK_THRESHOLD` (0.08)
- `delta(a, b)` = mean |a[i] − b[i]|

**Generation engine is one pure function:**
`runGeneration(prevGrid, gain, polarityForGen, genSeed, uiParams)` →
`{ segments, newGrid }`. It reseeds from genSeed internally; no global state
mutated mid-flight. Generation 0 receives `prevGrid = null` and uses Field
Script sine bands (wave freq/phase rolled from the master seed).

## §2 The feedback loop

**Density substitution.** Inside the ported Field Script pass,
`getDensityAt(x, y)` becomes:

```js
d_raw   = prevGrid ? bilinearSample(prevGrid, res, x, y) : sineBands(x, y)
d       = effectivePolarity === 'attract' ? d_raw : 1 - d_raw
density = constrain(d * gain, 0, 1)
```

The regenerate loop resolves `effectivePolarity` per generation BEFORE calling
`runGeneration`: for 'attract'/'repel' it is constant; for 'alternate' it is
`genIdx % 2 === 0 ? 'attract' : 'repel'`. `runGeneration` itself only ever
sees a resolved 'attract' or 'repel' — it stays pure and genIdx-agnostic.

**Ported from Field Script** (`~/genuary-2026/sketches/asemic_writing/index.js`,
READ-ONLY; the palimpsest port at `~/genuary-2026/sketches/palimpsest/index.js`
is the closer starting point since its globals are already parameterized):
subdivision (4×4 root grid — the single-root lesson from palimpsest applies),
the full 8-type bezier glyph vocabulary + Schotter line mode (per-generation
choice), word-weight gating, wobble. NOT ported: threads, highways, spiral
growth orders.

**Per-generation seeds:** `masterSeed + genIdx * 7919` (sibling convention).

**Homeostat (AMENDED during Task 4, user-approved: guardrails, not band).**
The homeostat guarantees *viability*, not band compliance: every settled
generation stays inside `VIABILITY = [0.05, 0.75]` coverage — no extinction,
no saturation — while the target band only *steers*. Implementation, tuned
against measured dynamics:
- Per-polarity gains (`gains.attract` warm-started at 2.5, `gains.repel` at
  1.0) — alternate runs two opposite regimes, each needing its own regulator.
- Damped proportional correction toward the band midpoint, driven by an EMA
  of coverage (0.5 blend): `step = sqrt(bandMid / max(covEMA, 0.02))` clamped
  to [0.6, 1.6]; gain clamped to [0.15, 4.0].
- Grid reads use a sqrt response curve with an exploration floor:
  `d_raw = max(sqrt(sample), 0.09)` — at maximum gain the background reads
  0.36, just past the band-density gate, so starvation pressure unlocks faint
  exploration marks; at gain 1 attract is pure condensation.
- Rewrite guard: a sub-viable generation (< 0.05 coverage) feeds `null`
  forward — the next generation rewrites from sine bands, so any dip lasts at
  most one generation.
Target bands (steering only): Sparse [0.08, 0.22] / Balanced [0.18, 0.42] /
Dense [0.32, 0.60]. Attract characteristically settles sparse and clustered;
repel full and lacy; alternate oscillates — coverage is character, not
compliance (user decision, Task 4).

**Termination.** Stop when `delta(newGrid, prevGrid) < ε` OR
`genIdx === maxGen`. Patience UI: Quick ε=0.02/max 6, Standard ε=0.012/max 9,
Long ε=0.007/max 14. Hard floor: minimum 3 generations always run.
`state.converged` records which condition fired.

**Convergence marks (red).** At termination, take the **12** grid cells with
the largest remaining |delta| — or fewer, keeping only cells whose delta
exceeds ε/2; place a small cluster of 3–6 short leaning strokes (~1/3 cell scale) at each cell center, red #A93B2A. If NO cell's remaining
delta exceeds ε/2 (near-perfect convergence), place ONE red mark at the ink
centroid of the final generation instead. Convergence
marks are the only red on the page.

## §3 Rendering, UI, export, verification

**Rendering.** Generations draw oldest-first; ink weight
`w = 0.5 × max(0.38, 1 − 0.09 × (N−1−idx))` — history recedes, the final
generation is fullest. Wobble gated by `ui.wobble` and seeded from segment
geometry (`seg.x1 * 0.01` — the palimpsest parity convention) so canvas and
SVG match exactly. Signature at page foot:
`Second Reading · seed N · gen K converged|halted  YYYY-MM-DD HH:MM`.

**Maker UI (sidebar sections):**

| Section | Controls |
|---|---|
| Feedback | polarity (auto/attract/repel/alternate), grid (Coarse 48 / Medium 64 / Fine 96), target (Sparse/Balanced/Dense), patience (Quick/Standard/Long) |
| Marks | density (Light/Medium/Dense), depth (5/6/7) |
| Style | wobble (on/off) |
| Run | read-only outcome row: `gens: K · converged` or `gens: K · halted` |
| Actions | randomize (reroll all + new seed) · refresh (new seed, same params) · svg · png |

Click canvas = new seed with current params. Regenerate runs the full loop
synchronously. Defaults: polarity auto, grid Medium, target Balanced,
patience Standard, density Medium, depth 6, wobble on.

**Export.** SVG Inkscape pen passes bottom→top: `Border` / `Gen 1` … `Gen N`
(each at its rendered weight) / `Convergence` (red 0.7) / `Signature`.
Group count = N + 3. PNG full-res. Files `second-reading_<seed>`.

**Verification** (node harness, p5-stub + vm pattern from core-samples; no
git, so task reviews diff against file snapshots under
`.superpowers/snapshots/`):
- Grid math: binSegments/blur3/normalize/bilinearSample unit cases (known
  segment → known bins; blur conserves mass ±ε; sample at cell centers).
- Determinism: same (seed, params) twice → identical generation count,
  per-generation segment counts, final grid, converged flag.
- Homeostat guardrails (amended): across ≥20 seeds — no generation exceeds
  0.80 coverage, never two consecutive generations below 0.05, final
  generation inside [0.05, 0.75], all on ≥90% of seeds; gains always within
  [0.15, 4.0]; pooled median of generations 3+ inside a loose band-centred
  window (steering evidence).
- Termination: ε forced huge → stops at exactly min generations (3, using a
  polarity that is alive at gen 3); ε forced 0 → runs to maxGen with
  converged=false. Convergence additionally requires coverage ≥ 0.05 (a dead
  page cannot "converge").
- Polarity: attract → correlation(newGrid, prevGrid) > 0 on most seeds;
  repel → < 0; alternate flips sign.
- Export: groups = N+3 with correct labels; red only in Convergence pass;
  no NaN; signature regex.
- Browser gates per task + Lighthouse accessibility 100 floor.

## Lineage note (for the README)

Second Reading's historical anchor is cybernetics, not any document or
instrument: *Cybernetic Serendipity* (ICA, 1968) — where Wiener's feedback
systems became aesthetic practice — with Gordon Pask's *Colloquy of Mobiles*
(autonomous systems in rule-based discourse) as the closest single ancestor;
the homeostat is Ross Ashby's term and mechanism. Immediate lineage: Field
Script (the writing system being fed back), continuing its Klee → Nake → Nees
chain. Frame per the digital-art skill's guidance: inform, don't lecture —
one contextual reference, the rest in the lineage table.

## Out of scope for v1

- Git repo, GitHub, Pages (all deferred by user — plain directory)
- Rating/learning system (explicitly removed — the feedback is autonomous)
- Threads, highways, spiral growth orders from Field Script
- Canon/specimen site; plot-ready mm / overdraw SVG variants
