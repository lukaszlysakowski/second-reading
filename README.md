# Second Reading

**Written · reread · converged** — a writing system that reads its own output until it stops changing.

**[Live demo →](https://lukaszlysakowski.github.io/second-reading/)**

---

## Origin

Every generative system in this family until now made marks against a field given to it — sine bands, geological folds, word-cluster noise. Second Reading closes the loop: generation 0 writes a classic Field Script page, and every generation after is written against a *reading of the previous generation's ink*. The density field that decides where writing happens **is the writing that already happened**. There is no landscape, no document, no instrument being depicted; the only thing the page refers to is its own history.

The system also decides for itself when it is finished. A homeostat — Ross Ashby's word, used precisely — regulates each generation's appetite so the page neither starves to blank nor drowns in black, and the loop terminates on its own convergence test: when a new reading barely differs from the last one, the system declares the page settled. Nobody rates anything; there is no learning file and no manual feedback loop. The feedback *is* the system's own.

---

## The System

**Reading.** After a generation writes, its marks are binned into a coarse grid (48/64/96 cells per side), blurred once, and peak-normalized. That grid — the system's "reading" of its own page — becomes the density field for the next generation, sampled bilinearly with a square-root response curve and a faint exploration floor.

**Polarity.** Each seed rolls one of three species of feedback:

| Polarity | Behavior | Character |
|---|---|---|
| attract | ink begets ink | sparse, condensed clusters — writing piles onto its own past |
| repel | new writing flees the old | full, lacy, space-filling coverage |
| alternate | polarity flips each generation | oscillating structures that never fully settle |

**Homeostat (guardrails, not compliance).** Each polarity keeps its own gain, corrected each generation toward a target coverage band — but the guarantee is *viability*, not conformity: no extinction, no saturation. Attract characteristically settles sparse; repel full. Coverage is character. If a generation ever leaves the page sub-viable, the system rewrites from nothing: the next generation falls back to the original sine bands — a fresh text for the loop to consume.

**Termination.** The loop stops when the grid delta between consecutive readings drops below a patience threshold (Quick / Standard / Long trade ε against a generation cap), with a hard minimum of three generations. Convergence also requires the page be alive — two near-empty readings agreeing is extinction, not settlement. The signature records the verdict: `gen 7 converged` or `gen 9 halted`.

**Convergence marks.** At termination, the twelve grid cells where the page was still changing most get small red glyph clusters (`#A93B2A`) — the system marking where it was still moving when it declared itself done. On near-perfect convergence, a single red mark at the ink's centroid. That is the only red on the page.

---

## Controls

| Section | Control | Effect |
|---|---|---|
| Feedback | polarity | auto (rolled per seed) / attract / repel / alternate |
| Feedback | grid | reading resolution — Coarse 48 / Medium 64 / Fine 96 |
| Feedback | target | steering band — Sparse / Balanced / Dense |
| Feedback | patience | Quick ε=.02×6 / Standard ε=.012×9 / Long ε=.007×14 |
| Marks | density | Light / Medium / Dense strokes per cell |
| Marks | depth | subdivision depth 5 / 6 / 7 |
| Style | wobble | hand-jitter on all marks — on / off |
| Run | outcome | read-only: `gens: K · converged · attract` |
| — | randomize | reroll all parameters + new seed |
| — | refresh | new seed, same parameters |
| — | svg / png | export |

Click the canvas for a new seed. Every run is deterministic in (seed, parameters); the whole loop executes synchronously on regeneration.

---

## Page & Palette

Square 2170×2170 — Field Script's own format, kept deliberately: this is that system's evolution, not a new document genre. Warm paper (`#F7E6D4`), near-black ink (`#1A1613`), convergence red (`#A93B2A`).

---

## SVG / Plotter Output

One Inkscape pen pass per generation, bottom to top:

1. **Border** — registration frame
2. **Gen 1 … Gen N** — each generation at its own weight; history recedes to hairlines, the converged generation is fullest
3. **Convergence** — the red marks
4. **Signature** — seed, generation count, verdict, timestamp

Plot any prefix of the Gen passes to physically replay the system's run — stop at Gen 3 and you hold the page as the system saw it mid-thought. Files are named `second-reading_<seed>.svg` / `.png`.

---

## Lineage

The historical anchor is cybernetics, not any depicted thing: *Cybernetic Serendipity* (ICA, London, 1968) is where Norbert Wiener's feedback systems became aesthetic practice, and Gordon Pask's *Colloquy of Mobiles* — autonomous systems in rule-based discourse with one another — is this piece's closest single ancestor. Second Reading stages that discourse with one participant: the page, in conversation with its own previous state.

| Work | Connection |
|---|---|
| W. Ross Ashby, *Design for a Brain* (1952) | The homeostat — self-regulation toward viability — used here by name and mechanism |
| *Cybernetic Serendipity* (ICA, 1968) | Feedback machines as art; the exhibition that made Wiener's loop aesthetic |
| Gordon Pask, *Colloquy of Mobiles* (1968) | Autonomous systems responding to each other; here, a system responding to itself |
| [Field Script](https://github.com/lukaszlysakowski/field-script) | The writing system being fed back — carrying its Klee → Nake → Nees chain with it |

---

## Running Locally

No build step, no server-side code. Serve the directory with any static file server:

```bash
npx serve .
```

p5.js is vendored (`p5.min.js`).
