# Second Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A p5.js maker where Field Script writes generation 0, then each later generation is written into a density field read from the previous generation's ink — with an autonomous homeostat, self-termination, red convergence marks, and per-generation SVG pen passes.

**Architecture:** One pure engine function `runGeneration(prevGrid, gain, effectivePolarity, genSeed, res)` wraps a ported Field Script pass whose `getDensityAt` samples a 64×64 analytic grid instead of sine bands (generation 0 keeps the bands). A synchronous loop in `regenerate` applies proportional gain control (homeostat) and stops on grid-delta convergence or a generation cap, then places red convergence marks where the page was still changing.

**Tech Stack:** p5.js (vendored), single `index.html` + `index.js`, `npx serve` port 3460, no build step, no server-side code.

## Global Constraints

- Project root: `/Users/lukasz/genuary-2026/sketches/second-reading` — **PLAIN DIRECTORY, NO GIT REPO** (user decision). NEVER run `git init`, `git add`, or `git commit` here. Task checkpoints are snapshot copies: `mkdir -p .superpowers/snapshots/task-N && cp index.html index.js .superpowers/snapshots/task-N/`. Reviews diff snapshots against current files.
- Canvas: square **2170×2170** (`CS = 2170`), border pad `Math.round(CS * 0.04)` (Field Script idiom).
- Palette: paper `#F7E6D4`, ink `#1A1613`, red `#A93B2A` — red ONLY for convergence marks.
- Naming: title/sidebar "Second Reading", subtitle "written · reread · converged", signature `Second Reading · seed N · gen K converged|halted  YYYY-MM-DD HH:MM`, files `second-reading_<seed>`; zero user-visible "Palimpsest"/"Core Samples" strings (Task 7 greps).
- NO rating/learning system, NO server.py, NO threads/highways — explicitly out of scope.
- Determinism: (masterSeed, params) → identical run twice: generation count, per-gen segment counts, final grid, converged flag. Per-generation seeds `masterSeed + genIdx * 7919`. All downstream randomness under explicit derived seeds.
- Wobble parity: SVG and canvas both seed wobble from `seg.x1 * 0.01` (+50/+15/+30 offsets).
- Accessibility floor: palimpsest CSS carried (`--muted: #969082`, `.ctrl { min-height: 24px; }`); Lighthouse a11y 100 at final QA.
- Port source (READ-ONLY): `/Users/lukasz/genuary-2026/sketches/palimpsest/index.js` — its Field Script port is already parameterized (grep for `function subdivideCell`, `function generateGlyphs`, `function wobble`, `function getWordWeight`). Original at `~/genuary-2026/sketches/asemic_writing/index.js` for reference only.
- Node harnesses: copy `/Users/lukasz/genuary-2026/sketches/core-samples/.superpowers/sdd/p5-stub.js` into `.superpowers/sdd/p5-stub.js` here (Task 2) and use the vm-load pattern (see core-samples `.superpowers/sdd/task-9-verify.js` for the sandbox shape).

## Shared constants (Task 1 defines; every task uses)

```js
const CS = 2170, PAD = Math.round(CS * 0.04);
const PAPER = '#F7E6D4', INK = '#1A1613', RED = '#A93B2A';
const GRID_RES  = [48, 64, 96];                       // Coarse / Medium / Fine
const TARGET_BANDS = [[0.08, 0.22], [0.18, 0.42], [0.32, 0.60]]; // Sparse/Balanced/Dense
const PATIENCE  = [{ eps: 0.02, max: 6 }, { eps: 0.012, max: 9 }, { eps: 0.007, max: 14 }];
const INK_THRESHOLD = 0.08, MIN_GENS = 3;
const GAIN_MIN = 0.15, GAIN_MAX = 4.0;
```

---

### Task 1: Scaffold — square page, border, signature, sidebar shell

**Files:**
- Create: `.claude/launch.json`, `index.html`, `index.js`
- Copy: `LICENSE` and `p5.min.js` from `/Users/lukasz/genuary-2026/sketches/palimpsest/`

**Interfaces:**
- Produces: shared constants above; `state = { masterSeed, generations: [], polarity: null, converged: false, convergenceMarks: [] }`; `ui = { polarity: 'auto', grid: 1, target: 1, patience: 1, density: 1, depth: 6, wobble: true }`; `regenerate(newSeed)` (loop body arrives Task 4), `renderAll()`, `drawBorderAndSignature()`, `mousePressed`.

- [ ] **Step 1: launch.json**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "second-reading", "runtimeExecutable": "npx", "runtimeArgs": ["serve", ".", "--listen", "3460"], "port": 3460 }
  ]
}
```

- [ ] **Step 2: Copy vendored files** — `cp .../palimpsest/LICENSE LICENSE && cp .../palimpsest/p5.min.js p5.min.js` (absolute paths).

- [ ] **Step 3: index.html** — copy palimpsest's full `<style>` block verbatim (a11y-tuned), then: `<title>Second Reading</title>`, sidebar-title "Second Reading", sidebar-sub "written · reread · converged". Empty `#controls`. Footer:

```html
<div class="sidebar-footer">
    <div class="act-row">
        <button class="act primary" id="randomizeBtn">randomize</button>
        <button class="act" id="refreshBtn">refresh</button>
    </div>
    <div class="act-row">
        <button class="act" id="svgBtn">svg</button>
        <button class="act" id="pngBtn">png</button>
    </div>
</div>
```

Stage CSS: `#canvas-container canvas { max-height: 92vh; max-width: 100%; width: auto !important; height: auto !important; }`.

- [ ] **Step 4: index.js skeleton**

```js
// Second Reading — the system reads its own writing until it stops changing.
// Field Script generation core (via the palimpsest port); analytic grid feedback;
// homeostat + self-termination after Ashby. No manual feedback loop.

/* shared constants block from the plan header goes here verbatim */

let state = { masterSeed: 0, generations: [], polarity: null, converged: false, convergenceMarks: [] };
let ui = { polarity: 'auto', grid: 1, target: 1, patience: 1, density: 1, depth: 6, wobble: true };

function setup() {
    let c = createCanvas(CS, CS);
    c.parent('canvas-container');
    pixelDensity(1);
    document.getElementById('randomizeBtn').onclick = () => regenerate(true); // Task 5 replaces
    document.getElementById('refreshBtn').onclick   = () => regenerate(true);
    regenerate(true);
    noLoop();
}

function regenerate(newSeed) {
    if (newSeed) state.masterSeed = Math.floor(Math.random() * 1e9);
    randomSeed(state.masterSeed);
    noiseSeed(state.masterSeed);
    state.generations = []; state.convergenceMarks = []; state.converged = false;
    // Task 4 adds the feedback loop here.
    renderAll();
}

function renderAll() {
    background(PAPER);
    // Task 4 adds generation + convergence-mark drawing here.
    drawBorderAndSignature();
}

function drawBorderAndSignature() {
    stroke(INK); strokeWeight(0.9); noFill();
    rect(PAD, PAD, CS - PAD * 2, CS - PAD * 2);
    noStroke(); fill(INK);
    textFont('Courier New'); textSize(Math.round(CS * 0.012));
    let n = new Date();
    let stamp = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    let K = state.generations.length;
    let outcome = K ? ` · gen ${K} ${state.converged ? 'converged' : 'halted'}` : '';
    text(`Second Reading · seed ${state.masterSeed}${outcome}  ${stamp}`, PAD, CS - PAD + Math.round(CS * 0.022));
}

function mousePressed(e) {
    if (e && e.target && e.target.tagName !== 'CANVAS') return;
    regenerate(true);
}
```

- [ ] **Step 5: Verify** — `node --check index.js`; `grep -ri "palimpsest\|core.samples" index.html index.js` → no hits. Controller does the browser check (square paper page, border, signature without outcome yet).

- [ ] **Step 6: Checkpoint** — `mkdir -p .superpowers/snapshots/task-1 && cp index.html index.js .superpowers/snapshots/task-1/`

---

### Task 2: Grid kit — pure feedback math

**Files:**
- Modify: `index.js` (append `// ─── grid kit ───`)
- Create: `.superpowers/sdd/p5-stub.js` (copied from core-samples), `.superpowers/sdd/task-2-verify.js`

**Interfaces:**
- Produces (all pure, no p5 dependency): `binSegments(segments, res)` → Float64Array(res*res); `blur3(grid, res)` → new Float64Array; `normalizeGrid(grid)` → new Float64Array (max 1; all-zero stays zero); `bilinearSample(grid, res, x, y)` → 0..1 (x,y in page coords 0..CS); `gridCoverage(grid)` → fraction of cells > INK_THRESHOLD; `gridDelta(a, b)` → mean |a[i]−b[i]|. Segments use `{x1,y1,x2,y2}` (bezier segments contribute their endpoints' chord — the same chord approximation the siblings use).

- [ ] **Step 1: Implementation**

```js
// ─── grid kit ─── pure math: how the system reads its own ink.

function binSegments(segments, res) {
    const grid = new Float64Array(res * res);
    const cell = CS / res;
    for (const s of segments) {
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const n = Math.max(1, Math.ceil(len / (cell * 0.5)));
        const per = len / n;
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const x = s.x1 + (s.x2 - s.x1) * t, y = s.y1 + (s.y2 - s.y1) * t;
            const cx = Math.min(res - 1, Math.max(0, Math.floor(x / cell)));
            const cy = Math.min(res - 1, Math.max(0, Math.floor(y / cell)));
            grid[cy * res + cx] += per;
        }
    }
    return grid;
}

function blur3(grid, res) {
    const out = new Float64Array(res * res);
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= res || ny >= res) continue;
            sum += grid[ny * res + nx]; cnt++;
        }
        out[y * res + x] = sum / cnt;
    }
    return out;
}

function normalizeGrid(grid) {
    let max = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
    const out = new Float64Array(grid.length);
    if (max > 0) for (let i = 0; i < grid.length; i++) out[i] = grid[i] / max;
    return out;
}

function bilinearSample(grid, res, x, y) {
    const cell = CS / res;
    const gx = Math.min(res - 1.001, Math.max(0, x / cell - 0.5));
    const gy = Math.min(res - 1.001, Math.max(0, y / cell - 0.5));
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const x1 = Math.min(res - 1, x0 + 1), y1 = Math.min(res - 1, y0 + 1);
    return grid[y0 * res + x0] * (1 - fx) * (1 - fy)
         + grid[y0 * res + x1] * fx * (1 - fy)
         + grid[y1 * res + x0] * (1 - fx) * fy
         + grid[y1 * res + x1] * fx * fy;
}

function gridCoverage(grid) {
    let n = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > INK_THRESHOLD) n++;
    return n / grid.length;
}

function gridDelta(a, b) {
    let t = 0;
    for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]);
    return t / a.length;
}
```

- [ ] **Step 2: Harness** — copy the p5 stub: `cp /Users/lukasz/genuary-2026/sketches/core-samples/.superpowers/sdd/p5-stub.js .superpowers/sdd/p5-stub.js`. Write `task-2-verify.js` (vm-load index.js with the core-samples sandbox shape) asserting: one horizontal segment across the page bins nonzero mass only in one grid row; total binned mass ≈ segment length ±1%; blur3 conserves mass within 2% on an interior impulse and reduces its peak; normalizeGrid → max exactly 1, all-zero stays all-zero; bilinearSample at a cell center ≈ that cell's value ±0.02 (uniform neighbors); gridCoverage of an all-0.5 grid = 1 and all-zero = 0; gridDelta(a,a) = 0.

- [ ] **Step 3: Run** — `node .superpowers/sdd/task-2-verify.js` → all PASS; `node --check index.js`.

- [ ] **Step 4: Checkpoint** — `mkdir -p .superpowers/snapshots/task-2 && cp index.html index.js .superpowers/snapshots/task-2/`

---

### Task 3: Generation engine — Field Script pass over a sampled field

**Files:**
- Modify: `index.js` (append `// ─── generation engine ───`; temporary single-gen wiring in `regenerate`)
- Create: `.superpowers/sdd/task-3-verify.js`

**Interfaces:**
- Consumes: grid kit; palimpsest port source (READ-ONLY).
- Produces: `runGeneration(prevGrid, gain, effectivePolarity, genSeed, res)` → `{ segments, newGrid }` — pure: reseeds internally from genSeed, reads no mutable globals except `ui.density`/`ui.depth`/`CS`; `drawSegment(seg, w)`; `wobble(x, y, seed)` gated by `ui.wobble`. Segment shape: `{ isBezier, x1,y1,x2,y2, [cx1,cy1,cx2,cy2], depth, density, w }`.

- [ ] **Step 1: Port the Field Script core from the palimpsest port** (grep function names in `/Users/lukasz/genuary-2026/sketches/palimpsest/index.js`): `subdivideCell` (keep the 4×4 root grid seeding — dispatch a single root and you reintroduce the blank-page bug palimpsest fixed), `generateGlyphs` (all 8 bezier types + Schotter line mode), `getWordWeight`, `wobble`. Mechanical adaptation: the palimpsest port hangs parameters off a layer object `L`; here hang them off a local `G` (generation params) built inside `runGeneration`: `G = { frame: { size: CS }, wordNoiseOffset, useBezier, waveFreq, phase }` — no rotation, no region, no coverage (this project writes the full square). Density gate constants and `maxLines = [6, 10, 16][ui.density]` follow the palimpsest values; the three-gate cell filter (skipChance/bandThreshold/wordGap) ports as-is.

- [ ] **Step 2: The density substitution** — inside the ported pass, the ONLY change from the source:

```js
function densityAt(G, prevGrid, gain, effectivePolarity, res, x, y) {
    let d_raw;
    if (prevGrid) {
        d_raw = bilinearSample(prevGrid, res, x, y);
    } else {
        // generation 0: classic Field Script sine bands (vertical-angle branch)
        d_raw = (Math.sin((y / CS) * TWO_PI * G.waveFreq + G.phase) + 1) / 2;
    }
    const d = effectivePolarity === 'attract' ? d_raw : 1 - d_raw;
    return constrain(d * gain, 0, 1);
}
```

`runGeneration` shape:

```js
function runGeneration(prevGrid, gain, effectivePolarity, genSeed, res) {
    randomSeed(genSeed); noiseSeed(genSeed);
    const G = {
        frame: { size: CS },
        wordNoiseOffset: random(1000),
        useBezier: random() < 0.6,
        waveFreq: random(1.5, 3) ,
        phase: random(TWO_PI)
    };
    G.cells = []; G.segments = [];
    // 4x4 root subdivision over the bordered area (PAD inset), then cell loop:
    // three-gate filter -> generateGlyphs(G, cell) -> keep segments whose
    // endpoints lie inside [PAD, CS-PAD] on both axes.
    /* ported code */
    const newGrid = normalizeGrid(blur3(binSegments(G.segments.map(chordOf), res), res));
    return { segments: G.segments, newGrid };
}

function chordOf(s) { return { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }; }
```

Note: `densityAt` replaces the ported `getDensityAt(L, ...)` calls inside subdivision and cell gating; thread `prevGrid/gain/effectivePolarity/res` through via `G` fields set once at the top (`G.prevGrid = prevGrid; G.gain = gain; ...`) rather than long parameter chains.

- [ ] **Step 3: Temporary wiring** — in `regenerate`, replace the Task-4 comment with a single-generation call so the browser gate can see a page: `const r = runGeneration(null, 1.0, 'attract', state.masterSeed, GRID_RES[ui.grid]); state.generations = [{ idx: 0, segments: r.segments, field: null, stats: { coverage: gridCoverage(r.newGrid), delta: 1, gain: 1 } }];` and in `renderAll` draw it: `for (const g of state.generations) for (const s of g.segments) drawSegment(s, 0.5);` with:

```js
function drawSegment(seg, w) {
    stroke(seg.red ? RED : INK); strokeWeight(w * (seg.w || 1)); noFill();
    const i = seg.x1 * 0.01;
    const p1 = wobble(seg.x1, seg.y1, i), p2 = wobble(seg.x2, seg.y2, i + 50);
    if (seg.isBezier) {
        const c1 = wobble(seg.cx1, seg.cy1, i + 15), c2 = wobble(seg.cx2, seg.cy2, i + 30);
        bezier(p1.x, p1.y, c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
    } else line(p1.x, p1.y, p2.x, p2.y);
}
```

- [ ] **Step 4: Harness** — `task-3-verify.js`: across 10 seeds, gen-0 run yields > 200 segments each; all endpoints within [PAD, CS−PAD]; determinism (same genSeed twice → identical segment count and newGrid); newGrid max = 1; a second call with `prevGrid = first run's newGrid, 'attract'` produces segments whose binned grid correlates positively with prevGrid (Pearson > 0.15 on ≥8/10 seeds) and with `'repel'` correlates negatively on ≥8/10.

- [ ] **Step 5: Run + browser gate** — node PASS; controller: page shows a banded Field Script composition.

- [ ] **Step 6: Checkpoint** — `mkdir -p .superpowers/snapshots/task-3 && cp index.html index.js .superpowers/snapshots/task-3/`

---

### Task 4: The feedback loop — homeostat, termination, convergence marks, history rendering

**Files:**
- Modify: `index.js` (`// ─── feedback loop ───`; replace Task-3 temporary wiring; extend `renderAll`)
- Create: `.superpowers/sdd/task-4-verify.js`

**Interfaces:**
- Consumes: `runGeneration`, grid kit, `drawSegment`.
- Produces: full `regenerate` loop; `makeConvergenceMarks(finalGrid, prevGrid, eps, res)` → red segment array; `genWeight(idx, N)`; `state.generations/converged/polarity/convergenceMarks` fully populated.

- [ ] **Step 1: The loop** (replaces the temporary wiring inside `regenerate` after the seeding lines):

```js
    state.polarity = ui.polarity === 'auto'
        ? ['attract', 'repel', 'alternate'][Math.floor(random(3))]
        : ui.polarity;
    const pat = PATIENCE[ui.patience], band = TARGET_BANDS[ui.target], res = GRID_RES[ui.grid];
    let gain = 1.0, prevGrid = null, lastGrid = null;
    for (let g = 0; g < pat.max; g++) {
        const eff = state.polarity === 'alternate'
            ? (g % 2 === 0 ? 'attract' : 'repel')
            : state.polarity;
        const { segments, newGrid } = runGeneration(prevGrid, gain, eff, state.masterSeed + g * 7919, res);
        const cov = gridCoverage(newGrid);
        const d = prevGrid ? gridDelta(newGrid, prevGrid) : 1;
        state.generations.push({ idx: g, segments, field: prevGrid, stats: { coverage: cov, delta: d, gain } });
        const canStop = g >= MIN_GENS - 1 && prevGrid !== null;
        if (canStop && d < pat.eps) {
            state.converged = true;
            state.convergenceMarks = makeConvergenceMarks(newGrid, prevGrid, pat.eps, res);
            break;
        }
        if (g === pat.max - 1) {
            state.converged = false;
            state.convergenceMarks = makeConvergenceMarks(newGrid, prevGrid || newGrid, pat.eps, res);
            break;
        }
        if (cov > band[1]) gain *= 0.8;
        else if (cov < band[0]) gain *= 1.25;
        gain = Math.min(GAIN_MAX, Math.max(GAIN_MIN, gain));
        prevGrid = newGrid;
    }
```

- [ ] **Step 2: Convergence marks**

```js
function makeConvergenceMarks(finalGrid, prevGrid, eps, res) {
    const cell = CS / res, marks = [];
    const cds = [];
    for (let i = 0; i < finalGrid.length; i++) {
        const cd = Math.abs(finalGrid[i] - prevGrid[i]);
        if (cd > eps / 2) cds.push({ i, cd });
    }
    cds.sort((a, b) => b.cd - a.cd);
    const chosen = cds.slice(0, 12);
    randomSeed(state.masterSeed + 31337);
    if (chosen.length === 0) {
        // near-perfect convergence: one mark at the ink centroid
        let sx = 0, sy = 0, sw = 0;
        for (let i = 0; i < finalGrid.length; i++) {
            sx += (i % res + 0.5) * cell * finalGrid[i];
            sy += (Math.floor(i / res) + 0.5) * cell * finalGrid[i];
            sw += finalGrid[i];
        }
        if (sw > 0) marks.push(...redCluster(sx / sw, sy / sw, cell / 3));
        return marks;
    }
    for (const c of chosen) {
        const x = (c.i % res + 0.5) * cell, y = (Math.floor(c.i / res) + 0.5) * cell;
        marks.push(...redCluster(x, y, cell / 3));
    }
    return marks;
}

function redCluster(cx, cy, s) {
    const out = [], n = Math.floor(random(3, 7));
    for (let k = 0; k < n; k++) {
        const lean = random(-0.3, 0.3);
        const gx = cx + random(-s, s), top = cy - s * random(0.5, 1), bot = cy + s * random(0.5, 1);
        out.push({ isBezier: false, x1: gx + lean * (bot - top), y1: top, x2: gx, y2: bot, w: 1, red: true });
    }
    return out;
}
```

- [ ] **Step 3: History rendering** — in `renderAll`, replace the Task-3 draw with:

```js
    const N = state.generations.length;
    for (const g of state.generations)
        for (const s of g.segments) drawSegment(s, genWeight(g.idx, N));
    for (const s of state.convergenceMarks) drawSegment(s, 0.7);
```

```js
function genWeight(idx, N) {
    return 0.5 * Math.max(0.38, 1 - 0.09 * (N - 1 - idx));
}
```

- [ ] **Step 4: Harness** — `task-4-verify.js`: determinism (two runs, deep-equal generation count / per-gen segment counts / converged flag / final grid); min-gens (patience forced `{eps: 99, max: 9}` via monkey-patched PATIENCE in the sandbox → stops at exactly 3 with converged=true); cap (`{eps: 0, max: 5}` → exactly 5, converged=false, convergenceMarks non-empty); homeostat [SUPERSEDED during Task 4 by the user-approved guardrails contract — see spec amendment and ledger]: viability assertions (no saturation, no double-death, final gen in [0.05, 0.75]) on ≥90% of seeds plus a loose steering-median check, and gain always within [GAIN_MIN, GAIN_MAX]; polarity 'auto' hits all three values across 30 seeds; all convergence marks red:true and inside the border.

- [ ] **Step 5: Run + browser gate** — node PASS; controller screenshots attract/repel/alternate seeds — history visible as weight recession, red marks present, no all-black or blank pages.

- [ ] **Step 6: Checkpoint** — `mkdir -p .superpowers/snapshots/task-4 && cp index.html index.js .superpowers/snapshots/task-4/`

---

### Task 5: Sidebar UI

**Files:**
- Modify: `index.html` (fill `#controls`), `index.js` (`// ─── controls ───`)
- Create: `.superpowers/sdd/task-5-verify.js`

**Interfaces:**
- Consumes: `ui`, `regenerate`.
- Produces: `CONTROL_DEFS`, `cycleCtrl`, `setupControls()`, `randomizeAll()`, `updateOutcomeUI()` (called at the end of `regenerate`).

- [ ] **Step 1: Markup** inside `#controls` (initial labels MUST match ui defaults):

```html
<div class="section">
    <div class="section-label">Feedback</div>
    <button class="ctrl" id="polarityBtn"><span class="ctrl-name">polarity</span><span class="ctrl-val" id="polarityVal">auto</span></button>
    <button class="ctrl" id="gridBtn"><span class="ctrl-name">grid</span><span class="ctrl-val" id="gridVal">Medium</span></button>
    <button class="ctrl" id="targetBtn"><span class="ctrl-name">target</span><span class="ctrl-val" id="targetVal">Balanced</span></button>
    <button class="ctrl" id="patienceBtn"><span class="ctrl-name">patience</span><span class="ctrl-val" id="patienceVal">Standard</span></button>
</div>
<div class="rule"></div>
<div class="section">
    <div class="section-label">Marks</div>
    <button class="ctrl" id="densityBtn"><span class="ctrl-name">density</span><span class="ctrl-val" id="densityVal">Medium</span></button>
    <button class="ctrl" id="depthBtn"><span class="ctrl-name">depth</span><span class="ctrl-val" id="depthVal">6</span></button>
</div>
<div class="rule"></div>
<div class="section">
    <div class="section-label">Style</div>
    <button class="ctrl" id="wobbleBtn"><span class="ctrl-name">wobble</span><span class="ctrl-val" id="wobbleVal">on</span></button>
</div>
<div class="rule"></div>
<div class="section">
    <div class="section-label">Run</div>
    <div class="ctrl" style="cursor:default;"><span class="ctrl-name">outcome</span><span class="ctrl-val" id="outcomeVal">—</span></div>
</div>
```

- [ ] **Step 2: Wiring** — `cycleCtrl` copied verbatim from palimpsest; then:

```js
const CONTROL_DEFS = [
    ['polarityBtn', 'polarityVal', ['auto','attract','repel','alternate'], null, 'polarity'],
    ['gridBtn',     'gridVal',     [0,1,2], ['Coarse','Medium','Fine'], 'grid'],
    ['targetBtn',   'targetVal',   [0,1,2], ['Sparse','Balanced','Dense'], 'target'],
    ['patienceBtn', 'patienceVal', [0,1,2], ['Quick','Standard','Long'], 'patience'],
    ['densityBtn',  'densityVal',  [0,1,2], ['Light','Medium','Dense'], 'density'],
    ['depthBtn',    'depthVal',    [5,6,7], null, 'depth'],
    ['wobbleBtn',   'wobbleVal',   [true,false], ['on','off'], 'wobble']
];
function setupControls() { for (const d of CONTROL_DEFS) cycleCtrl(...d); }
function randomizeAll() {
    for (const [, valId, options, labels, uiKey] of CONTROL_DEFS) {
        const i = Math.floor(Math.random() * options.length);
        ui[uiKey] = options[i];
        document.getElementById(valId).textContent = labels ? labels[i] : String(options[i]);
    }
    regenerate(true);
}
function updateOutcomeUI() {
    const el = document.getElementById('outcomeVal');
    if (!el) return;
    el.textContent = `gens: ${state.generations.length} · ${state.converged ? 'converged' : 'halted'} · ${state.polarity}`;
}
```

`setup()`: `setupControls();` + `randomizeBtn.onclick = randomizeAll;` (refresh stays `regenerate(true)`). `regenerate` calls `updateOutcomeUI()` after `renderAll()` (null guard covers node/vm).

- [ ] **Step 3: Node check** — `task-5-verify.js` text-level (core-samples task-8 pattern): every btnId/valId exists in index.html; every uiKey exists in the ui literal; initial labels match defaults.

- [ ] **Step 4: Run + browser gate** — node PASS; controller click-tests: polarity override forces the species, outcome row updates, randomize syncs labels, refresh deterministic per params.

- [ ] **Step 5: Checkpoint** — `mkdir -p .superpowers/snapshots/task-5 && cp index.html index.js .superpowers/snapshots/task-5/`

---

### Task 6: SVG + PNG export

**Files:**
- Modify: `index.js` (`// ─── export ───`; wire buttons in `setup()`)
- Create: `.superpowers/sdd/task-6-verify.js`

**Interfaces:**
- Consumes: `state.generations`, `state.convergenceMarks`, `wobble`, `genWeight`.
- Produces: `buildSVG()` → string; `exportSVG()`, `exportPNG()`.

- [ ] **Step 1: Implementation**

```js
function segToPath(seg) {
    const i = seg.x1 * 0.01;
    const p1 = wobble(seg.x1, seg.y1, i), p2 = wobble(seg.x2, seg.y2, i + 50);
    if (seg.isBezier) {
        const c1 = wobble(seg.cx1, seg.cy1, i + 15), c2 = wobble(seg.cx2, seg.cy2, i + 30);
        return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

function svgPass(label, color, weight, paths, extraPaths = []) {
    let g = `  <g inkscape:groupmode="layer" inkscape:label="${label}" fill="none" stroke="${color}" stroke-width="${weight}" stroke-linecap="round">\n`;
    for (const p of [...extraPaths, ...paths]) g += `    <path d="${p}"/>\n`;
    return g + `  </g>\n`;
}

function buildSVG() {
    const N = state.generations.length;
    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${CS}" height="${CS}" viewBox="0 0 ${CS} ${CS}">\n  <rect width="100%" height="100%" fill="${PAPER}"/>\n`;
    svg += svgPass('Border', INK, 0.9, [], [`M ${PAD} ${PAD} H ${CS - PAD} V ${CS - PAD} H ${PAD} Z`]);
    for (const g of state.generations)
        svg += svgPass(`Gen ${g.idx + 1}`, INK, genWeight(g.idx, N).toFixed(2), g.segments.map(segToPath));
    svg += svgPass('Convergence', RED, 0.7, state.convergenceMarks.map(segToPath));
    const n = new Date();
    const stamp = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    svg += `  <g inkscape:groupmode="layer" inkscape:label="Signature"><text x="${PAD}" y="${CS - PAD + Math.round(CS * 0.022)}" font-family="Courier New, Courier, monospace" font-size="${Math.round(CS * 0.012)}" fill="${INK}">Second Reading · seed ${state.masterSeed} · gen ${N} ${state.converged ? 'converged' : 'halted'}  ${stamp}</text></g>\n`;
    return svg + `</svg>`;
}

function exportSVG() {
    const blob = new Blob([buildSVG()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `second-reading_${state.masterSeed}.svg`; a.click();
    URL.revokeObjectURL(url);
}
function exportPNG() { saveCanvas(`second-reading_${state.masterSeed}`, 'png'); }
```

Wire in `setup()`: `svgBtn.onclick = exportSVG; pngBtn.onclick = exportPNG;`

- [ ] **Step 2: Harness** — `task-6-verify.js`: run full pipeline for one seed; groups = N + 3 labeled `Border, Gen 1..Gen N, Convergence, Signature`; `stroke="#A93B2A"` only inside the Convergence group; per-Gen stroke-widths strictly non-decreasing with idx; root dims `2170`; no NaN; signature regex `Second Reading · seed \d+ · gen \d+ (converged|halted)`.

- [ ] **Step 3: Run + browser gate** — node PASS; controller clicks both buttons, console clean.

- [ ] **Step 4: Checkpoint** — `mkdir -p .superpowers/snapshots/task-6 && cp index.html index.js .superpowers/snapshots/task-6/`

---

### Task 7: README + final QA

**Files:**
- Create: `README.md`

- [ ] **Step 1: README** — follow the palimpsest README structure; write Second Reading's own story. Must cover: the feedback concept (system reads its own ink; generation 0 is classic Field Script); polarity species (attract/repel/alternate, rolled per seed); the homeostat and self-termination (coverage band, gain control, delta < ε — and that the piece decides when it is finished); convergence marks (red = where it was still moving); the controls table from Task 5 exactly; per-generation pen passes ("plot any prefix to replay the run"); the lineage per the spec's Lineage note — *Cybernetic Serendipity* (ICA 1968), Wiener's feedback-as-aesthetic, Pask's *Colloquy of Mobiles*, Ashby's homeostat, plus Field Script (Klee → Nake → Nees chain) — one contextual reference in prose, the rest in the lineage table, don't lecture; running locally `npx serve .` (port 3460 via launch config); state plainly: local-only, no repo yet, no rating system by design — the feedback is the system's own.

- [ ] **Step 2: Naming sweep** — `grep -rin "palimpsest\|core.samples" index.html index.js README.md` → only permitted hits are source-credit mentions in README/comments; zero user-visible strings.

- [ ] **Step 3: Full-suite re-run** — `node .superpowers/sdd/task-N-verify.js` for N in 2 3 4 5 6 → all PASS. Controller browser QA: sweep across polarities × targets × patience, outcome row correct, screenshots of one attract / one repel / one alternate sheet, Lighthouse accessibility = 100.

- [ ] **Step 4: Checkpoint** — `mkdir -p .superpowers/snapshots/task-7 && cp index.html index.js README.md .superpowers/snapshots/task-7/`
