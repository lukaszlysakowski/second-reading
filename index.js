// Second Reading — the system reads its own writing until it stops changing.
// Field Script generation core; analytic grid feedback;
// homeostat + self-termination after Ashby. No manual feedback loop.

const CS = 2170, PAD = Math.round(CS * 0.04);
const PAPER = '#F7E6D4', INK = '#1A1613', RED = '#A93B2A';
const GRID_RES  = [48, 64, 96];                       // Coarse / Medium / Fine
const TARGET_BANDS = [[0.08, 0.22], [0.18, 0.42], [0.32, 0.60]]; // Sparse/Balanced/Dense
const PATIENCE  = [{ eps: 0.02, max: 6 }, { eps: 0.012, max: 9 }, { eps: 0.007, max: 14 }];
const INK_THRESHOLD = 0.08, MIN_GENS = 3;
const GAIN_MIN = 0.15, GAIN_MAX = 4.0;
// Homeostat contract (guardrails, not band): every settled generation stays
// inside VIABILITY — no extinction, no saturation. TARGET_BANDS only steer.
const VIABILITY = [0.05, 0.75];

let state = { masterSeed: 0, generations: [], polarity: null, converged: false, convergenceMarks: [] };
let ui = { polarity: 'auto', grid: 1, target: 1, patience: 1, density: 1, depth: 5, wobble: true };

function setup() {
    let c = createCanvas(CS, CS);
    c.parent('canvas-container');
    pixelDensity(1);
    setupControls();
    document.getElementById('randomizeBtn').onclick = randomizeAll;
    document.getElementById('refreshBtn').onclick   = () => regenerate(true);
    document.getElementById('svgBtn').onclick = exportSVG;
    document.getElementById('pngBtn').onclick = exportPNG;
    regenerate(true);
    noLoop();
}

function regenerate(newSeed) {
    if (newSeed) state.masterSeed = Math.floor(Math.random() * 1e9);
    randomSeed(state.masterSeed);
    noiseSeed(state.masterSeed);
    state.generations = []; state.convergenceMarks = []; state.converged = false;
    state.polarity = ui.polarity === 'auto'
        ? ['attract', 'repel', 'alternate'][Math.floor(random(3))]
        : ui.polarity;
    const pat = PATIENCE[ui.patience], band = TARGET_BANDS[ui.target], res = GRID_RES[ui.grid];
    // Per-polarity homeostat: alternate runs two opposite regimes, so each
    // effective polarity keeps its own gain — two coupled regulators, each
    // steering its own phase toward the coverage band.
    // attract warm-starts hot: its equilibrium gain sits near the ceiling
    // (sparse peak-normalized fields read weak), and a cold start crashes the
    // first read before the regulator can catch it.
    const gains = { attract: 2.5, repel: 1.0 };
    const covEMA = { attract: null, repel: null };   // smoothed per-polarity coverage
    const bandMid = (band[0] + band[1]) / 2;
    let prevGrid = null;
    for (let g = 0; g < pat.max; g++) {
        const eff = state.polarity === 'alternate'
            ? (g % 2 === 0 ? 'attract' : 'repel')
            : state.polarity;
        const gain = gains[eff];
        const { segments, newGrid } = runGeneration(prevGrid, gain, eff, state.masterSeed + g * 7919, res);
        const cov = gridCoverage(newGrid);
        const d = prevGrid ? gridDelta(newGrid, prevGrid) : 1;
        state.generations.push({ idx: g, segments, field: prevGrid, stats: { coverage: cov, delta: d, gain } });
        // Convergence requires the page be ALIVE: two near-empty grids also
        // have a tiny delta, but that is extinction, not settlement.
        const canStop = g >= MIN_GENS - 1 && prevGrid !== null && cov >= VIABILITY[0];
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
        // Damped proportional correction toward the band midpoint, per
        // polarity, driven by an EMA of coverage — single generations are
        // noisy (each has its own subdivision luck), so the regulator reacts
        // to the trend, not the spike. sqrt = half-strength correction.
        covEMA[eff] = covEMA[eff] === null ? cov : 0.5 * covEMA[eff] + 0.5 * cov;
        let step = Math.sqrt(bandMid / Math.max(covEMA[eff], 0.02));
        step = Math.min(1.6, Math.max(0.6, step));
        gains[eff] = Math.min(GAIN_MAX, Math.max(GAIN_MIN, gains[eff] * step));
        // Rewrite guard: a sub-viable generation (below the guardrail floor)
        // is treated as extinction — feeding it forward under attract is a
        // permanent dead state (near-zero density everywhere). The system
        // rewrites from nothing: the next generation falls back to sine
        // bands, so any dip lasts at most one generation.
        prevGrid = cov < VIABILITY[0] ? null : newGrid;
    }
    renderAll();
    updateOutcomeUI();
}

function renderAll() {
    background(PAPER);
    const N = state.generations.length;
    for (const g of state.generations)
        for (const s of g.segments) drawSegment(s, genWeight(g.idx, N));
    for (const s of state.convergenceMarks) drawSegment(s, 0.7);
    drawBorderAndSignature();
}

function genWeight(idx, N) {
    return 0.5 * Math.max(0.38, 1 - 0.09 * (N - 1 - idx));
}

// ─── convergence marks ─── where the system was still moving when it stopped.

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

// ─── controls ───

function cycleCtrl(btnId, valId, options, labels, uiKey) {
    document.getElementById(btnId).onclick = () => {
        let i = (options.indexOf(ui[uiKey]) + 1) % options.length;
        ui[uiKey] = options[i];
        document.getElementById(valId).textContent = labels ? labels[i] : String(options[i]);
        regenerate(false);
    };
}

const CONTROL_DEFS = [
    ['polarityBtn', 'polarityVal', ['auto','attract','repel','alternate'], null, 'polarity'],
    ['gridBtn',     'gridVal',     [0,1,2], ['Coarse','Medium','Fine'], 'grid'],
    ['targetBtn',   'targetVal',   [0,1,2], ['Sparse','Balanced','Dense'], 'target'],
    ['patienceBtn', 'patienceVal', [0,1,2], ['Quick','Standard','Long'], 'patience'],
    ['densityBtn',  'densityVal',  [0,1,2], ['Light','Medium','Dense'], 'density'],
    ['depthBtn',    'depthVal',    [3,4,5], null, 'depth'],
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

// ─── export ───

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

// ─── generation engine ───
// Ported from Field Script (palimpsest/index.js, itself ported from
// asemic_writing/index.js). Palimpsest hangs per-layer state off `L`; here we
// hang per-generation state off a local `G` built inside runGeneration. This
// project writes the full square in page coordinates directly — no rotation,
// no region clipping, no coverage sub-rects (those were palimpsest-only).
// The one substantive change from the source is densityAt() replacing
// getDensityAt(): generation 0 uses sine bands, later generations sample the
// previous generation's grid (the "second reading" of its own ink).

const SKIP_CHANCE = [0.40, 0.20, 0.05]; // Light / Medium / Dense — from Field Script densityOptions

function densityAt(G, x, y) {
    let d_raw;
    if (G.prevGrid) {
        // sqrt response curve: the grid is peak-normalized, so raw values sit
        // low; sqrt lifts the mid-tones so attract stays alive. The small
        // floor keeps faint exploration everywhere — without it, subdivision
        // midpoint-samples a mostly-zero field and whole quadrants never
        // split, starving attract at any gain.
        // Floor 0.09: at maximum homeostat gain (4.0) the background reads
        // 0.36 — just past the band-density gate — so starvation pressure
        // unlocks faint exploration marks; at gain 1 the background stays
        // silent and attract is pure condensation.
        d_raw = Math.max(Math.sqrt(bilinearSample(G.prevGrid, G.res, x, y)), 0.09);
    } else {
        // generation 0: classic Field Script sine bands (vertical-angle branch)
        d_raw = (Math.sin((y / CS) * TWO_PI * G.waveFreq + G.phase) + 1) / 2;
    }
    const d = G.effectivePolarity === 'attract' ? d_raw : 1 - d_raw;
    return constrain(d * G.gain, 0, 1);
}

// Word spacing — slow X-axis noise creates "word" clusters within each band.
// Returns 0 (gap) → 1 (dense word). Seeded via G.wordNoiseOffset.
function getWordWeight(G, x, y) {
    let coarse = noise(x * 0.008 + G.wordNoiseOffset, y * 0.003 + G.wordNoiseOffset + 50);
    let fine   = noise(x * 0.025 + G.wordNoiseOffset + 100, y * 0.006 + G.wordNoiseOffset + 150);
    return coarse * 0.7 + fine * 0.3;
}

function subdivideCell(G, x, y, size, depth) {
    let cs       = G.frame.size;
    let maxDepth = ui.depth;
    let mid      = { x: x + size / 2, y: y + size / 2 };
    let density  = densityAt(G, mid.x, mid.y);

    // `depth` (3/4/5) is the real mark-scale control: it caps recursive
    // splits, so lower = larger cells/coarser glyphs, higher = finer. The
    // size term is now just a safety floor (cs/180 ≈ 12px) that stops
    // pathologically small cells; it sits below the min cell any depth in
    // range produces, so maxDepth — not the floor — is what binds.
    let shouldSplit = depth < maxDepth
        && size > cs / 180
        && random() < density * 0.85;

    if (shouldSplit) {
        let h  = size / 2;
        let w  = size * 0.08 * noise(x * 0.01, y * 0.01, depth * 0.5);
        let sx = constrain(h + w * (random() > 0.5 ? 1 : -1), h * 0.65, h * 1.35);
        let sy = constrain(h + w * (random() > 0.5 ? 1 : -1), h * 0.65, h * 1.35);

        subdivideCell(G, x,      y,      sx,        depth + 1);
        subdivideCell(G, x + sx, y,      size - sx, depth + 1);
        subdivideCell(G, x,      y + sy, sx,        depth + 1);
        subdivideCell(G, x + sx, y + sy, size - sx, depth + 1);
    } else {
        let frameCentre = { x: G.frame.size / 2, y: G.frame.size / 2 };
        let cell = {
            x, y, size, depth, density,
            distFromCenter: dist(mid.x, mid.y, frameCentre.x, frameCentre.y)
        };
        G.cells.push(cell);
        cell.wordWeight = getWordWeight(G, mid.x, mid.y);
    }
}

function wobble(x, y, seed) {
    if (!ui.wobble) return { x, y };
    return {
        x: x + (noise(x * 0.01, y * 0.01, seed) - 0.5) * 8,
        y: y + (noise(x * 0.01 + 100, y * 0.01 + 100, seed) - 0.5) * 8
    };
}

function generateGlyphs(G, cell) {
    let cs = G.frame.size;
    let s  = cell.size;
    let xo = cell.x;
    let yo = cell.y;
    let m  = s * 0.12;
    let cx = xo + s / 2;
    let cy = yo + s / 2;
    let growthCenter = { x: G.frame.size / 2, y: G.frame.size / 2 };

    let angle = atan2(growthCenter.y - cy, growthCenter.x - cx);
    let tb    = constrain(s * 0.1 * sin(angle + noise(cx * 0.005, cy * 0.005) * 0.4 - 0.2), -s * 0.2, s * 0.2);

    let sizeRatio  = s / (cs / 16);
    let maxLines   = [6, 10, 16][ui.density];
    let maxStrokes = max(1, floor(maxLines / max(1, sizeRatio)));
    // Word weight modulates stroke count: "word-centre" cells get more strokes
    let n = max(1, floor(random(1, maxStrokes + 1) * cell.density * cell.wordWeight));

    let out = [];

    if (G.useBezier) {
        let baseType = floor(noise(cx * 0.006, cy * 0.006) * 8);

        for (let a = 0; a < n; a++) {
            let gt = (baseType + a) % 8;
            let w  = random(0.35, 1.7);
            let x1, y1, cx1, cy1, cx2, cy2, x2, y2;

            if (gt === 0) {
                x1  = xo + random(m * 1.2, s - m * 1.2);
                y1  = yo + m;
                x2  = constrain(x1 + random(-s * 0.15, s * 0.15) + tb * 0.5, xo + m, xo + s - m);
                y2  = yo + s - m;
                cx1 = constrain(x1 + tb * 0.3 + random(-s * 0.15, s * 0.15), xo + m * 0.5, xo + s - m * 0.5);
                cy1 = yo + s * 0.30;
                cx2 = constrain(x2 - tb * 0.3 + random(-s * 0.15, s * 0.15), xo + m * 0.5, xo + s - m * 0.5);
                cy2 = yo + s * 0.70;
            } else if (gt === 1) {
                x1  = xo + random(m, s - m);
                y1  = yo + m;
                x2  = xo + s * (x1 < cx ? 0.78 : 0.22);
                y2  = yo + s - m * 0.6;
                cx1 = constrain(x1 + tb * 0.2, xo + m, xo + s - m);
                cy1 = yo + s * 0.35;
                cx2 = constrain(x2 + (x1 < cx ? s * 0.18 : -s * 0.18), xo + m, xo + s - m);
                cy2 = yo + s * 0.65;
            } else if (gt === 2) {
                x1  = xo + random(m, s * 0.45);
                y1  = yo + s * 0.55 + random(0, s * 0.18);
                x2  = xo + random(s * 0.55, s - m);
                y2  = y1 + random(-s * 0.08, s * 0.08);
                cx1 = constrain(x1 + (x2 - x1) * 0.25 + tb * 0.2, xo + m, xo + s - m);
                cy1 = yo + m * 0.8;
                cx2 = constrain(x2 - (x2 - x1) * 0.25 - tb * 0.2, xo + m, xo + s - m);
                cy2 = yo + m * 0.8;
            } else if (gt === 3) {
                x1  = xo + random(m, s - m);
                y1  = yo + m;
                x2  = xo + random(m, s - m);
                y2  = yo + s - m;
                cx1 = constrain(xo + s * 0.82 + tb * 0.25, xo + m, xo + s - m);
                cy1 = yo + s * 0.22;
                cx2 = constrain(xo + s * 0.18 - tb * 0.25, xo + m, xo + s - m);
                cy2 = yo + s * 0.78;
            } else if (gt === 4) {
                let rr = cos(angle) > 0;
                x1  = xo + (rr ? m * 1.5 : s - m * 1.5);
                y1  = yo + s * 0.22;
                x2  = x1;
                y2  = yo + s * 0.78;
                let ax = rr ? xo + s * 0.88 : xo + s * 0.12;
                cx1 = ax; cy1 = yo + m * 0.9;
                cx2 = ax; cy2 = yo + s - m * 0.9;
            } else if (gt === 5) {
                let rr = cos(angle) <= 0;
                x1  = xo + (rr ? m * 1.5 : s - m * 1.5);
                y1  = yo + s * 0.22;
                x2  = x1;
                y2  = yo + s * 0.78;
                let ax = rr ? xo + s * 0.88 : xo + s * 0.12;
                cx1 = ax; cy1 = yo + m * 0.9;
                cx2 = ax; cy2 = yo + s - m * 0.9;
            } else if (gt === 6) {
                x1  = xo + s * 0.5;
                y1  = yo + m;
                x2  = x1 + random(-s * 0.06, s * 0.06);
                y2  = yo + m + random(s * 0.02, s * 0.1);
                cx1 = constrain(xo + s * 0.88 + tb * 0.15, xo + m, xo + s - m);
                cy1 = yo + s * 0.22;
                cx2 = constrain(xo + s * 0.12 - tb * 0.15, xo + m, xo + s - m);
                cy2 = yo + s * 0.72;
            } else {
                x1  = xo + m;
                y1  = yo + m;
                x2  = xo + s - m;
                y2  = yo + s - m;
                cx1 = constrain(xo + s * 0.65 + tb * 0.25, xo + m, xo + s - m);
                cy1 = yo + s * 0.10;
                cx2 = constrain(xo + s * 0.10 - tb * 0.25, xo + m, xo + s - m);
                cy2 = yo + s * 0.78;
            }

            out.push({ isBezier: true, x1, y1, cx1, cy1, cx2, cy2, x2, y2, depth: cell.depth, density: cell.density, w });
        }

    } else {
        // Schotter-style: disorder increases as wordWeight decreases.
        // Word-centre cells → vertical parallel marks. Word-edge cells → scattered, rotated.
        let disorder  = 1.0 - cell.wordWeight;
        let maxAngle  = HALF_PI * 0.65;  // up to ~58° at full disorder
        // Organic lean from growth centre, scaled down in disordered zones
        let leanBase  = s * 0.12 * sin(angle + noise(cx * 0.005, cy * 0.005) * 0.4 - 0.2) * cell.wordWeight;

        for (let a = 0; a < n; a++) {
            let randAngle = random(-maxAngle, maxAngle) * disorder;

            // Line length: ordered = tall, disordered = variable/shorter
            let heightFrac = 0.5 + cell.wordWeight * 0.45 + random(-0.12, 0.12) * disorder;
            let lineLen    = s * constrain(heightFrac, 0.2, 0.95);

            // Midpoint: neatly spaced when ordered, scattered when disordered
            let spread = m * 1.2 + (s - m * 2.4) * (disorder * random() + (1 - disorder) * (a / max(1, n - 1)));
            let midX   = xo + spread + leanBase * noise(a * 0.3, cx * 0.01);
            let midY   = yo + s * 0.5 + random(-s * 0.06, s * 0.06) * disorder;

            // Rotate about midpoint
            let x1 = midX + sin(randAngle) * lineLen * 0.5;
            let y1 = midY - cos(randAngle) * lineLen * 0.5;
            let x2 = midX - sin(randAngle) * lineLen * 0.5;
            let y2 = midY + cos(randAngle) * lineLen * 0.5;

            let w = random(0.35, 1.5);

            if (a % 2 === 0) {
                out.push({ isBezier: false, x1, y1, x2, y2, depth: cell.depth, density: cell.density, w });
            } else {
                out.push({ isBezier: false, x1: x2, y1: y2, x2: x1, y2: y1, depth: cell.depth, density: cell.density, w });
            }
        }
    }

    return out;
}

function chordOf(s) { return { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }; }

function runGeneration(prevGrid, gain, effectivePolarity, genSeed, res) {
    randomSeed(genSeed); noiseSeed(genSeed);
    const G = {
        frame: { size: CS },
        wordNoiseOffset: random(1000),
        useBezier: random() < 0.6,
        waveFreq: random(1.5, 3),
        phase: random(TWO_PI),
        prevGrid, gain, effectivePolarity, res,
        cells: [], segments: []
    };

    // 4×4 root subdivision over the bordered area (PAD inset on all sides).
    // A single root would reintroduce the blank-page bug palimpsest fixed:
    // one early failed split roll can starve an entire pass of cells.
    const inner    = CS - 2 * PAD;
    const baseSize = inner / 4;
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            subdivideCell(G, PAD + col * baseSize, PAD + row * baseSize, baseSize, 0);
        }
    }

    for (let cell of G.cells) {
        // Three-gate filter, ported as-is from Field Script (palimpsest/index.js
        // generateLayerContentOnce): per-density skip chance, band-density gate,
        // word-gap gate.
        if (random() < SKIP_CHANCE[ui.density]) continue;

        let sizeRatio = cell.size / (inner / 16);
        let bandThreshold = 0.35 * Math.max(1, sizeRatio * 0.55);
        if (cell.density < bandThreshold) continue;

        if (cell.wordWeight < 0.12) continue;

        for (let seg of generateGlyphs(G, cell)) {
            // Endpoint containment: this project writes the full square in page
            // coords directly (no rotation/region transform), so we just require
            // both endpoints — and both bezier control points — to lie inside
            // the bordered area.
            if (!inBounds(seg.x1, seg.y1) || !inBounds(seg.x2, seg.y2)) continue;
            if (seg.isBezier && (!inBounds(seg.cx1, seg.cy1) || !inBounds(seg.cx2, seg.cy2))) continue;
            G.segments.push(seg);
        }
    }

    const newGrid = normalizeGrid(blur3(binSegments(G.segments.map(chordOf), res), res));
    return { segments: G.segments, newGrid };
}

function inBounds(x, y) {
    return x >= PAD && x <= CS - PAD && y >= PAD && y <= CS - PAD;
}

function drawSegment(seg, w) {
    stroke(seg.red ? RED : INK); strokeWeight(w * (seg.w || 1)); noFill();
    const i = seg.x1 * 0.01;
    const p1 = wobble(seg.x1, seg.y1, i), p2 = wobble(seg.x2, seg.y2, i + 50);
    if (seg.isBezier) {
        const c1 = wobble(seg.cx1, seg.cy1, i + 15), c2 = wobble(seg.cx2, seg.cy2, i + 30);
        bezier(p1.x, p1.y, c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
    } else line(p1.x, p1.y, p2.x, p2.y);
}
