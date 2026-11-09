// FEM tab: a separate module that talks to /api/fem/solve (fem.py). Remove this file, fem.css, fem.py and the
// registration lines in index.html, server.py and sims.js to take the tab out. See docs/FEM_PLAN.md.
import { registerModule, plotLayout, css, fmt } from './sims.js';

const $ = (id) => document.getElementById(id);

const MATERIALS = { steel: ['Steel', 200, 0.30], al: ['Aluminium 6061', 70, 0.33], ti: ['Titanium Ti-6Al-4V', 114, 0.34], cu: ['Copper', 117, 0.34] };

const ELEMENT_TEXT = {
    hex8: 'Eight-node brick (hexahedron): trilinear displacement, 2×2×2 Gauss points, three unknowns per node. Stress is extrapolated from the Gauss points to the corners and averaged over the bricks sharing a node. Only a quarter of the block is meshed, because the two symmetry planes act as supports.',
    bar: 'Two-node bar element. Displacement varies linearly inside each element, so strain and stress are constant per element. Stiffness k = E·A/h · [[1, −1], [−1, 1]].',
    beam: 'Euler–Bernoulli beam element with a cubic (Hermite) displacement, two nodes and two unknowns per node: deflection v and slope θ. Moment varies linearly inside an element.',
    cst: 'Constant-strain triangle (CST): three nodes, linear displacement, so strain and stress are constant in each triangle. Simple, but stiff in bending until the mesh is fine.',
    q4: 'Four-node quadrilateral (Q4): bilinear displacement integrated with 2×2 Gauss points. Stress is evaluated at the Gauss points and extrapolated to the corners, then averaged over the elements that share a node.',
};

const ELEMENT_INPUT = { k: 'element', label: 'Element type', type: 'select', options: [['q4', 'Q4 quadrilateral'], ['cst', 'CST triangle']], def: 'q4' };
const MESH = (min, max, def, label) => ({ k: 'n', label, min, max, step: 1, def });

const CASES = [
    {
        id: 'bar', title: 'Tapered bar', chapters: 'Ch. 5, 6, 10',
        blurb: 'An axial bar whose cross-section tapers, fixed at one end with a load at the other. The smallest finite-element problem: one unknown per node.',
        inputs: [
            { k: 'L', label: 'Length', unit: 'm', min: 0.2, max: 3, step: 0.1, def: 1 },
            { k: 'b', label: 'Root width', unit: 'mm', min: 10, max: 100, step: 1, def: 20 },
            { k: 'h', label: 'Root depth', unit: 'mm', min: 10, max: 100, step: 1, def: 20 },
            { k: 'taper', label: 'End area / root area', min: 0.2, max: 1, step: 0.05, def: 0.4 },
            { k: 'P', label: 'End load', unit: 'kN', min: 1, max: 100, step: 1, def: 20 },
            MESH(1, 60, 4, 'Elements'),
        ],
        element: 'bar',
        significance: 'When the area changes along the bar, σ = P/A(x) still holds but the displacement is no longer a straight line. FEM replaces the bar with a chain of short uniform bars whose stiffnesses are assembled in series. As the elements shrink the answer approaches the exact integral of P/EA.',
        equations: ['u(x) = (P / E m) · ln(A(x) / A₀),  A(x) = A₀ + m x', 'k_e = E A_e / h · [[1, −1], [−1, 1]]', 'K u = f'],
    },
    {
        id: 'beam', title: 'Cantilever beam', chapters: 'Ch. 8, 9, 10',
        blurb: 'A slender cantilever solved with beam elements. Each node carries a deflection and a slope.',
        inputs: [
            { k: 'L', label: 'Length', unit: 'm', min: 0.5, max: 5, step: 0.1, def: 2 },
            { k: 'b', label: 'Width', unit: 'mm', min: 20, max: 200, step: 1, def: 50 },
            { k: 'h', label: 'Depth', unit: 'mm', min: 20, max: 300, step: 1, def: 100 },
            { k: 'load_type', label: 'Load', type: 'select', options: [['tip', 'Point load at the tip'], ['udl', 'Uniformly distributed load']], def: 'tip' },
            { k: 'P', label: 'Tip load', unit: 'kN', min: 1, max: 100, step: 1, def: 10 },
            { k: 'w', label: 'Distributed load', unit: 'kN/m', min: 1, max: 100, step: 1, def: 10 },
            MESH(1, 40, 4, 'Elements'),
        ],
        element: 'beam',
        significance: 'The beam element is built from the same cubic deflection shape that Euler–Bernoulli theory produces under an end load, so deflections at the nodes come out exact for any load. What the mesh limits is the bending moment: it is linear inside each element, so a distributed load needs several elements to resolve M(x).',
        equations: ['EI v″ = M(x)', 'k_e = EI/h³ · [[12, 6h, −12, 6h], [6h, 4h², −6h, 2h²], …]', 'δ_tip = P L³ / 3EI  or  w L⁴ / 8EI'],
    },
    {
        id: 'cantilever', title: 'Plane-stress cantilever', chapters: 'Ch. 6, 8, 9',
        blurb: 'The same cantilever as a two-dimensional elastic body. The solver knows nothing about beam theory, so agreement with it is a real test.',
        inputs: [
            { k: 'L', label: 'Length', unit: 'm', min: 1, max: 8, step: 0.1, def: 2 },
            { k: 'h', label: 'Depth', unit: 'mm', min: 100, max: 1000, step: 10, def: 500 },
            { k: 'b', label: 'Thickness', unit: 'mm', min: 20, max: 200, step: 1, def: 100 },
            { k: 'P', label: 'Tip load', unit: 'kN', min: 10, max: 500, step: 10, def: 100 },
            ELEMENT_INPUT,
            MESH(2, 24, 8, 'Elements through the depth'),
        ],
        element: 'element',
        significance: 'Beam theory assumes plane sections stay plane. A 2D elasticity solution relaxes that: it includes shear deformation, so the tip deflection lands near the Timoshenko value, and the fixed end is a real clamp. Triangles with a linear field cannot bend, so they come out too stiff until refined: this is the mesh-dependence FEM users must always check.',
        equations: ['σ = D ε,  ε = B u', 'k_e = ∫ Bᵀ D B t dA', 'δ_EB = P L³ / 3EI,  δ_T = δ_EB + P L / κGA'],
    },
    {
        id: 'hole', title: 'Plate with a hole', chapters: 'Ch. 2, 3, 6',
        blurb: 'One quarter of a plate in tension with a circular hole, using the symmetry planes as supports. A stress concentration that closed-form elasticity (Kirsch) predicts.',
        inputs: [
            { k: 'ratio', label: 'Plate half-width / hole radius', min: 4, max: 12, step: 0.5, def: 10 },
            { k: 'sigma', label: 'Remote stress', unit: 'MPa', min: 10, max: 300, step: 10, def: 100 },
            ELEMENT_INPUT,
            MESH(2, 20, 8, 'Mesh density'),
        ],
        element: 'element',
        significance: 'A hole forces the stress to flow around it, so the stress at the edge is three times the remote value in an infinite plate. The peak is a local feature: a coarse mesh smooths it away, and only a fine mesh near the hole recovers it. This is where FEM goes beyond what the half-space solution in the 3D tab can describe, because the body has real free boundaries.',
        equations: ['σθ(r, θ=90°) = σ∞ [1 + a²/2r² + 3a⁴/2r⁴]', 'Kt = σmax / σ∞ = 3', 'free hole boundary: σ·n = 0'],
    },
    {
        id: 'block', title: '3D block, patch load', chapters: 'Ch. 2, 3, 6',
        blurb: 'A finite cuboid with a square patch load on its top face, solved in 3D. The 3D stress field tab treats the body as an infinite half-space; here every face is a real boundary.',
        inputs: [
            { k: 'L', label: 'Plan side (square)', unit: 'm', min: 1, max: 6, step: 0.5, def: 4 },
            { k: 'H', label: 'Depth', unit: 'm', min: 1, max: 6, step: 0.5, def: 3 },
            { k: 'patch', label: 'Patch width / block width', min: 0.1, max: 0.9, step: 0.05, def: 0.25 },
            { k: 'sigma', label: 'Surface pressure', unit: 'MPa', min: 10, max: 300, step: 10, def: 100 },
            { k: 'bottom', label: 'Base', type: 'select', options: [['roller', 'Smooth rigid base (vertical support)'], ['fixed', 'Fixed base']], def: 'roller' },
            MESH(3, 14, 8, 'Elements along the half-width'),
        ],
        element: 'hex8',
        significance: 'The half-space solution has no sides and no bottom, so it leaves stress on any plane you cut through it. In a real block the side faces carry no load: the finite-element solution enforces that, and a rigid base raises the stress under the load. Compare the side-face chart with the 3D tab\'s field. Far from the edges and the base the two agree, which is the check that the 3D tab is a good model for a deep, wide body.',
        equations: ['σz(0, 0, z) = q · 4 I(a/z, a/z) (half-space, Newmark)', 'σ · n = 0 on the free faces (natural condition in FEM)', 'K u = f, solved by conjugate gradients'],
    },
];

const store = { c: CASES[0], values: {}, material: 'steel', data: null, field: null, seq: 0, ctrl: null, timer: null };

function defaults(c) { store.values = {}; c.inputs.forEach((i) => { store.values[i.k] = i.def; }); }

// ------------------------------------------------------------------ layout
const root = document.createElement('main');
root.className = 'sim-layout'; root.id = 'fem-layout'; root.hidden = true;
root.innerHTML = `
<aside class="sim-sidebar">
  <div class="sim-sidebar-head">
    <h2>Finite element method</h2>
    <p id="fem-blurb" class="sim-blurb"></p>
  </div>
  <div class="sim-controls">
    <div class="control-group"><label for="fem-case">Problem</label><select id="fem-case">${CASES.map((c) => `<option value="${c.id}">${c.title}</option>`).join('')}</select></div>
    <div class="control-group"><label for="fem-mat">Material</label><select id="fem-mat">${Object.entries(MATERIALS).map(([k, m]) => `<option value="${k}">${m[0]} (${m[1]} GPa)</option>`).join('')}</select></div>
    <div id="fem-controls"></div>
  </div>
  <div class="sim-actions">
    <button type="button" class="btn-secondary" id="fem-reset">Reset inputs</button>
    <button type="button" class="btn-secondary" id="fem-csv">CSV data</button>
    <p class="sim-hint">Solved on the server with numpy; each chart has its own PNG button.</p>
  </div>
</aside>
<section class="sim-main">
  <div id="fem-status" class="sim-status" role="status"></div>
  <div class="sim-top">
    <div class="fem-view">
      <div class="fem-view-head">
        <label>Colour by <select id="fem-field"></select></label>
        <div class="fem-legend"><span id="fem-min"></span><i></i><span id="fem-max"></span></div>
      </div>
      <canvas id="fem-canvas" aria-label="Finite-element mesh coloured by stress"></canvas>
      <p id="fem-view-note" class="sim-hint"></p>
    </div>
    <div id="fem-charts" class="sim-charts"></div>
  </div>
  <div id="fem-compare" class="readout-grid sim-readouts"></div>
  <div class="fem-learn">
    <div><h3>What the solver did</h3><ol id="fem-steps"></ol></div>
    <div><h3 id="fem-k-title">The element</h3><p id="fem-element" class="sim-hint"></p><div id="fem-kwrap" class="fem-kwrap"></div></div>
  </div>
  <div class="sim-notes">
    <div><h3>Physical significance</h3><p id="fem-significance"></p></div>
    <div><h3>Governing equations</h3><ul id="fem-eq"></ul></div>
  </div>
</section>`;
$('sim-layout').after(root);

// ------------------------------------------------------------------ controls
function buildControls() {
    const host = $('fem-controls'); host.innerHTML = '';
    store.c.inputs.forEach((inp) => {
        const g = document.createElement('div'); g.className = 'control-group'; g.dataset.k = inp.k;
        const id = `fem-in-${inp.k}`;
        if (inp.type === 'select') {
            g.innerHTML = `<label for="${id}">${inp.label}</label><select id="${id}">${inp.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
            host.appendChild(g);
            const el = g.querySelector('select'); el.value = store.values[inp.k];
            el.addEventListener('change', () => { store.values[inp.k] = el.value; syncVisibility(); schedule(); });
        } else {
            g.innerHTML = `<label for="${id}-n"><span>${inp.label}</span><span class="val"><input type="number" id="${id}-n" min="${inp.min}" max="${inp.max}" step="${inp.step}" aria-label="${inp.label}"> ${inp.unit || ''}</span></label><input type="range" id="${id}" min="${inp.min}" max="${inp.max}" step="${inp.step}">`;
            host.appendChild(g);
            const r = g.querySelector('input[type=range]'), n = g.querySelector('input[type=number]');
            r.value = n.value = store.values[inp.k];
            r.addEventListener('input', () => { n.value = r.value; store.values[inp.k] = parseFloat(r.value); schedule(); });
            n.addEventListener('input', () => { if (n.value === '' || isNaN(+n.value)) return; r.value = n.value; store.values[inp.k] = parseFloat(n.value); schedule(); });
        }
    });
    syncVisibility();
}
// The beam shows the tip-load or the UDL slider depending on the chosen load type.
function syncVisibility() {
    if (store.c.id !== 'beam') return;
    const udl = store.values.load_type === 'udl';
    document.querySelector('#fem-controls [data-k="P"]').hidden = udl;
    document.querySelector('#fem-controls [data-k="w"]').hidden = !udl;
}

function selectCase(id) {
    store.c = CASES.find((c) => c.id === id) || CASES[0];
    $('fem-case').value = store.c.id;
    defaults(store.c);
    $('fem-blurb').textContent = store.c.blurb;
    $('fem-significance').textContent = store.c.significance;
    $('fem-eq').innerHTML = store.c.equations.map((e) => `<li><code>${e}</code></li>`).join('');
    store.field = null;
    buildControls();
    schedule(0);
}

// ------------------------------------------------------------------ requests
function schedule(delay = 120) { clearTimeout(store.timer); store.timer = setTimeout(solve, delay); }

async function solve() {
    const my = ++store.seq;
    if (store.ctrl) store.ctrl.abort();
    store.ctrl = new AbortController();
    const [, E, nu] = MATERIALS[store.material];
    const body = { case: store.c.id, E_GPa: E, nu, ...store.values };
    try {
        const res = await fetch('/api/fem/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: store.ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (my !== store.seq) return;
        store.data = data; render();
    } catch (e) {
        if (e.name === 'AbortError' || my !== store.seq) return;
        console.error('FEM request failed:', e);
        const st = $('fem-status'); st.className = 'sim-status bad';
        st.innerHTML = '<span class="badge">No result</span><span class="summary">The FEM server did not respond. Start it with ./run_shape_analytics.sh.</span>';
    }
}

// ------------------------------------------------------------------ rendering
const RAMP = [[0.2, 0.42, 0.66], [0.95, 0.94, 0.90], [0.82, 0.27, 0.11]];
function ramp(t) {
    const [a, b, f] = t < 0.5 ? [RAMP[0], RAMP[1], t * 2] : [RAMP[1], RAMP[2], (t - 0.5) * 2];
    return `rgb(${a.map((c, k) => Math.round(255 * (c + (b[k] - c) * f))).join(',')})`;
}

function drawView() {
    const v = store.data && store.data.view; if (!v) return;
    const cv = $('fem-canvas'), dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = v.nodes.concat(v.nodes_def);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = 14, s = Math.min((w - 2 * pad) / ((x1 - x0) || 1), (h - 2 * pad) / ((y1 - y0) || 1));
    const ox = (w - s * (x1 - x0)) / 2 - s * x0, oy = (h + s * (y1 - y0)) / 2 + s * y0;
    const P = (p) => [ox + s * p[0], oy - s * p[1]];
    const vals = v.values[store.field], lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    $('fem-min').textContent = fmt(lo, Math.abs(lo) >= 100 ? 0 : 2); $('fem-max').textContent = fmt(hi, Math.abs(hi) >= 100 ? 0 : 2);
    const edge = css('--color-text');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = css('--color-text-muted'); ctx.globalAlpha = 0.35; ctx.lineWidth = 0.6; ctx.setLineDash([3, 3]);
    v.polys.forEach((q) => { ctx.beginPath(); q.forEach((i, k) => { const [px, py] = P(v.nodes[i]); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); ctx.stroke(); });
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    v.polys.forEach((q, e) => {
        ctx.beginPath(); q.forEach((i, k) => { const [px, py] = P(v.nodes_def[i]); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath();
        ctx.fillStyle = ramp((vals[e] - lo) / span); ctx.fill();
        ctx.strokeStyle = edge; ctx.globalAlpha = v.polys.length > 600 ? 0.12 : 0.4; ctx.lineWidth = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
    });
    $('fem-view-note').textContent = `Dashed outline: undeformed mesh. Displacements are drawn ×${fmt(v.scale, v.scale >= 100 ? 0 : 1)} so they can be seen. Each element is coloured by the mean of its corner values.`;
}

function trace(t) {
    const col = t.kind === 'ref' ? css('--color-text') : t.kind === 'alt' ? css('--s3') : css('--s1');
    return {
        x: t.x, y: t.y, name: t.name, type: 'scatter',
        mode: t.noline ? 'markers' : t.markers ? 'lines+markers' : 'lines',
        line: { color: col, width: t.kind === 'ref' ? 1.5 : 2, dash: t.kind === 'ref' ? 'dash' : 'solid' },
        marker: { color: col, size: t.noline ? 8 : 6, symbol: t.kind === 'alt' ? 'square' : 'circle' },
    };
}

function renderCharts(d) {
    const host = $('fem-charts');
    const keep = d.charts.map((c) => 'fem-chart-' + c.id);
    [...host.children].forEach((el) => { if (!keep.includes(el.id)) { Plotly.purge(el); el.remove(); } });
    d.charts.forEach((c) => {   // create or reuse each card, then put the cards in the server's order
        let el = $('fem-chart-' + c.id);
        if (!el) { el = document.createElement('div'); el.id = 'fem-chart-' + c.id; el.className = 'chart-card'; }
        host.appendChild(el);
        el.classList.toggle('primary', !!c.primary);
    });
    d.charts.forEach((c) => {
        const el = $('fem-chart-' + c.id);
        const lay = plotLayout(c, el.clientHeight || 340);
        if (c.logx) {
            const xs = c.traces[0].x;
            Object.assign(lay.xaxis, { type: 'log', tickmode: 'array', tickvals: xs, ticktext: xs.map(String) });
        }
        Plotly.react(el, c.traces.map(trace), lay, { responsive: true, displaylogo: false, toImageButtonOptions: { filename: `fem-${d.case}-${c.id}` } });
    });
}

function renderKMatrix(d) {
    const k = d.kmatrix, wrap = $('fem-kwrap');
    $('fem-k-title').textContent = k ? 'Global stiffness matrix K' : 'The element';
    if (!k) { wrap.innerHTML = ''; return; }
    const m = Math.max(...k.values.flat().map(Math.abs)) || 1;
    const head = `<tr><th></th>${k.labels.map((l) => `<th>${l}</th>`).join('')}</tr>`;
    const rows = k.values.map((r, i) => `<tr><th>${k.labels[i]}</th>${r.map((x) => (Math.abs(x) < 1e-12 * m ? '<td class="z">·</td>' : `<td>${(x / m).toFixed(3)}</td>`)).join('')}</tr>`).join('');
    wrap.innerHTML = `<table class="fem-kmat">${head}${rows}</table><p class="sim-hint">Entries in units of ${m.toExponential(3)}. Blank dots are zeros: each node only couples to its neighbours, so K is banded and symmetric.</p>`;
}

function renderSteps(d) {
    const g = d.diag, pct = (g.zero_fraction * 100).toFixed(0);
    const eq = Math.abs(g.reaction_sum + g.load_sum) / Math.max(Math.abs(g.load_sum), 1e-12);
    const twoD = ['cantilever', 'hole', 'block'].includes(store.c.id);
    $('fem-steps').innerHTML = [
        `<b>Mesh.</b> The body is cut into <code>${g.n_elem}</code> elements. Their nodes carry <code>${g.n_dof}</code> unknown displacements (degrees of freedom).`,
        `<b>Element stiffness.</b> Each element gets a small matrix <code>k = ∫ Bᵀ D B dV</code>: B turns nodal displacements into strain, D is Hooke's law.`,
        g.cg_iters
            ? `<b>Assembly.</b> The element matrices would fill a ${g.n_dof} × ${g.n_dof} matrix K that is ${pct}% zeros, so it is never formed: every product K·x is built brick by brick. Each element matrix is symmetric to ${g.sym_err.toExponential(1)} (Maxwell–Betti reciprocity).`
            : `<b>Assembly.</b> The element matrices add into one global matrix K of size ${g.n_dof} × ${g.n_dof}. It is ${pct}% zeros and symmetric to ${g.sym_err.toExponential(1)} (Maxwell–Betti reciprocity).`,
        `<b>Loads and supports.</b> Loads become nodal forces f. ${g.n_fixed} displacements are fixed${store.c.id === 'hole' ? ' (the two symmetry planes)' : store.c.id === 'block' ? ' (the two symmetry planes and the base)' : ''}; without that K cannot be solved because the body could move freely.`,
        g.cg_iters
            ? `<b>Solve.</b> <code>K u = f</code> is solved iteratively (conjugate gradients): ${g.cg_iters} iterations to a relative residual of ${g.cg_residual.toExponential(1)}, ${g.solve_ms.toFixed(0)} ms in total.`
            : `<b>Solve.</b> <code>K u = f</code> gives all nodal displacements in ${g.solve_ms.toFixed(0)} ms.`,
        `<b>Recover stress.</b> From u the program computes strain <code>ε = B u</code> and stress <code>σ = D ε</code> ${twoD ? 'at each element, then averages them at the nodes' : 'in each element'}.`,
        `<b>Check.</b> Support reactions sum to ${fmt(-g.reaction_sum, 1)} N against ${fmt(g.load_sum, 1)} N applied: equilibrium holds to ${eq.toExponential(1)} relative.`,
    ].map((s) => `<li>${s}</li>`).join('');
}

function render() {
    const d = store.data; if (!d || d.case !== store.c.id) return;
    const c = store.c;
    const maxErr = Math.max(...d.compare.filter((x) => !x.info).map((x) => (x.ref ? Math.abs((x.fem - x.ref) / x.ref) : 0))) * 100;
    const st = $('fem-status'), g = d.diag;
    const loose = maxErr > 5;
    st.className = 'sim-status ' + (loose ? 'bad' : 'ok');
    st.innerHTML = `<span class="badge">${loose ? 'Coarse mesh' : 'FEM'}</span><span class="summary">${g.n_elem} elements, ${g.n_dof} DOF, largest difference from the reference ${maxErr.toFixed(maxErr < 10 ? 2 : 1)}%${loose ? ': refine the mesh' : ''}</span>`;

    const fields = Object.keys(d.view.values);
    const sel = $('fem-field');
    if (sel.dataset.case !== c.id || !store.field) {
        store.field = d.view.default;
        sel.innerHTML = fields.map((f) => `<option value="${f}">${d.view.labels[f]}</option>`).join('');
        sel.dataset.case = c.id; sel.value = store.field; sel.disabled = fields.length < 2;
    }
    $('fem-canvas').style.height = c.element === 'bar' || c.element === 'beam' ? '190px' : '';
    drawView();
    renderCharts(d);
    $('fem-compare').innerHTML = d.compare.map((x) => {
        const err = x.ref ? (x.fem - x.ref) / x.ref * 100 : 0;
        const dec = (v) => fmt(v, Math.abs(v) >= 100 ? 1 : 3);
        const delta = x.ref === null ? '' : x.info ? `half-space ${dec(x.ref)}` : `reference ${dec(x.ref)} · ${err >= 0 ? '+' : ''}${err.toFixed(2)}%`;
        return `<div class="readout-card${!x.info && Math.abs(err) > 5 ? ' off' : ''}"><span class="label">${x.label}</span><span class="value">${dec(x.fem)} <span class="unit">${x.unit}</span></span><span class="delta">${delta}</span></div>`;
    }).join('') + (d.note ? `<p class="sim-hint" style="grid-column:1/-1">${d.note}</p>` : '');
    $('fem-element').textContent = ELEMENT_TEXT[c.element === 'element' ? store.values.element : c.element];
    renderKMatrix(d); renderSteps(d);
}

function exportCSV() {
    const d = store.data; if (!d) return;
    const rows = [['quantity', 'FEM', 'reference', 'unit'], ...d.compare.map((x) => [x.label, x.fem, x.ref, x.unit]), [], ['chart', 'trace', 'x', 'y']];
    d.charts.forEach((c) => c.traces.forEach((t) => t.x.forEach((xx, i) => rows.push([c.title, t.name, xx, t.y[i]]))));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((q) => q.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `fem-${d.case}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------------ wiring
$('fem-case').addEventListener('change', (e) => selectCase(e.target.value));
$('fem-mat').addEventListener('change', (e) => { store.material = e.target.value; schedule(0); });
$('fem-field').addEventListener('change', (e) => { store.field = e.target.value; drawView(); });
$('fem-reset').addEventListener('click', () => selectCase(store.c.id));
$('fem-csv').addEventListener('click', exportCSV);
new MutationObserver(() => { if (!root.hidden) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
new ResizeObserver(() => { if (!root.hidden) drawView(); }).observe($('fem-canvas'));

registerModule({ id: 'fem', title: 'Finite elements', chapters: 'Beyond the syllabus', el: root, show() { if (!store.data) selectCase(store.c.id); else render(); } });
