// Solid mechanics simulators (SiliconWit-style suite). Each simulator is a plain config:
// inputs -> compute(v) -> { status, readouts, charts, diagram }. The framework renders live
// updates, A/B baseline overlay, CSV / PNG / SVG export, design spec and lab report.
// All units: N, mm, MPa unless an input label says otherwise.

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 2) => (Number.isFinite(x) ? (Math.abs(x) >= 1e5 || (x !== 0 && Math.abs(x) < 1e-3) ? x.toExponential(2) : x.toFixed(d)) : x === Infinity ? '∞' : x === -Infinity ? '−∞' : '–');   // ∞: e.g. a safety factor with no load
const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function cumtrapz(x, y, y0 = 0) {
    const out = [y0];
    for (let i = 1; i < x.length; i++) out.push(out[i - 1] + 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]));
    return out;
}
const trapz = (x, y) => cumtrapz(x, y).at(-1);

const MATERIALS = {
    steel: { name: 'Mild steel', E: 200, nu: 0.3, alpha: 12, sy: 250 },
    al: { name: 'Aluminium 6061-T6', E: 69, nu: 0.33, alpha: 23.6, sy: 275 },
    ti: { name: 'Titanium Ti-6Al-4V', E: 114, nu: 0.34, alpha: 8.6, sy: 880 },
    cu: { name: 'Copper (annealed)', E: 117, nu: 0.34, alpha: 17, sy: 70 },
};
const matOpts = Object.entries(MATERIALS).map(([k, m]) => [k, `${m.name} (E ${m.E} GPa)`]);
const mat = (v) => MATERIALS[v.mat];

// ---------------------------------------------------------------- Mohr's circle (Ch. 2, 4)
function eig3(S) {
    // Principal stresses of a symmetric 3x3 via the trigonometric solution (Ch. 4.1, 4.6).
    const [[a, d, f], [, b, e], [, , c]] = S;
    const p = (a + b + c) / 3;
    const s = [[a - p, d, f], [d, b - p, e], [f, e, c - p]];
    const j2 = 0.5 * (s[0][0] ** 2 + s[1][1] ** 2 + s[2][2] ** 2) + d * d + e * e + f * f;
    if (j2 <= 1e-24 * (a * a + b * b + c * c + 2 * (d * d + e * e + f * f))) return { p1: p, p2: p, p3: p, j2: 0, p }; // hydrostatic to rounding
    const j3 = s[0][0] * (s[1][1] * s[2][2] - e * e) - d * (d * s[2][2] - e * f) + f * (d * e - s[1][1] * f);
    const r = 2 * Math.sqrt(j2 / 3);
    const c3 = Math.max(-1, Math.min(1, (3 * Math.sqrt(3) * j3) / (2 * j2 ** 1.5)));
    const phi = Math.acos(c3) / 3;
    const vals = [0, 1, 2].map((k) => p + r * Math.cos(phi - (2 * Math.PI * k) / 3)).sort((x, y) => y - x);
    return { p1: vals[0], p2: vals[1], p3: vals[2], j2, p };
}
function circlePts(c, R, n = 121) {
    const t = linspace(0, 2 * Math.PI, n);
    return { x: t.map((u) => c + R * Math.cos(u)), y: t.map((u) => R * Math.sin(u)) };
}
function elementSVG(r) {
    const th = r.theta;
    const f = (s) => (Math.abs(s) < 0.05 ? '0' : s.toFixed(0));
    return `<svg viewBox="-160 -150 320 300" role="img" aria-label="Stress element rotated by ${th} degrees">
  <g stroke="var(--color-text-label)" stroke-width="1" stroke-dasharray="3 3"><line x1="-140" y1="0" x2="140" y2="0"/><line x1="0" y1="-135" x2="0" y2="135"/></g>
  <g transform="rotate(${-th})">
    <rect x="-70" y="-70" width="140" height="140" fill="var(--color-accent-dim)" stroke="var(--color-accent)" stroke-width="2"/>
    <g stroke="var(--s2)" stroke-width="2" fill="var(--s2)">
      <line x1="70" y1="0" x2="${70 + Math.min(40, Math.abs(r.sxp) / 6 + 12) * Math.sign(r.sxp || 1)}" y2="0"/>
      <line x1="-70" y1="0" x2="${-70 - Math.min(40, Math.abs(r.sxp) / 6 + 12) * Math.sign(r.sxp || 1)}" y2="0"/>
      <line x1="0" y1="-70" x2="0" y2="${-70 - Math.min(40, Math.abs(r.syp) / 6 + 12) * Math.sign(r.syp || 1)}"/>
      <line x1="0" y1="70" x2="0" y2="${70 + Math.min(40, Math.abs(r.syp) / 6 + 12) * Math.sign(r.syp || 1)}"/>
    </g>
  </g>
  <g font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--color-text)">
    <text x="-152" y="-128">x′ axis at θ = ${th}°</text>
    <text x="-152" y="112">σx′ = ${f(r.sxp)}  σy′ = ${f(r.syp)} MPa</text>
    <text x="-152" y="128">τx′y′ = ${f(r.txyp)} MPa</text>
  </g>
</svg>`;
}
const mohr = {
    id: 'mohr', title: "Mohr's circle", chapters: 'Ch. 2, 4',
    blurb: 'Rotate a stress element and watch its face stresses ride around the Mohr circles. Read principal stresses, maximum shear, invariants and the failure margin.',
    inputs: [
        { k: 'sx', label: 'σx', unit: 'MPa', min: -300, max: 300, step: 1, value: 80 },
        { k: 'sy', label: 'σy', unit: 'MPa', min: -300, max: 300, step: 1, value: -20 },
        { k: 'sz', label: 'σz', unit: 'MPa', min: -300, max: 300, step: 1, value: 0 },
        { k: 'txy', label: 'τxy', unit: 'MPa', min: -200, max: 200, step: 1, value: -39 },
        { k: 'tyz', label: 'τyz', unit: 'MPa', min: -200, max: 200, step: 1, value: 0 },
        { k: 'tzx', label: 'τzx', unit: 'MPa', min: -200, max: 200, step: 1, value: 0 },
        { k: 'theta', label: 'Element rotation θ about z', unit: '°', min: -90, max: 90, step: 1, value: 38 },
        { k: 'syield', label: 'Yield strength σy (tension test)', unit: 'MPa', min: 50, max: 1000, step: 5, value: 250 },
        { k: 'theory', label: 'Failure theory', type: 'select', options: [['vm', 'von Mises (distortional energy)'], ['tresca', 'Tresca (max shear stress)']], value: 'vm' },
    ],
    compute(v) {
        const { sx, sy, sz, txy, tyz, tzx, theta, syield } = v;
        const t2 = rad(2 * theta), avg = (sx + sy) / 2, d = (sx - sy) / 2;
        const sxp = avg + d * Math.cos(t2) + txy * Math.sin(t2);
        const syp = avg - d * Math.cos(t2) - txy * Math.sin(t2);
        const txyp = -d * Math.sin(t2) + txy * Math.cos(t2);
        const e = eig3([[sx, txy, tzx], [txy, sy, tyz], [tzx, tyz, sz]]);
        const { p1, p2, p3 } = e;
        const thetaP = 0.5 * deg(Math.atan2(2 * txy, sx - sy));
        const tmax = (p1 - p3) / 2;
        const I1 = sx + sy + sz;
        const I2 = sx * sy + sy * sz + sz * sx - txy ** 2 - tyz ** 2 - tzx ** 2;
        const I3 = p1 * p2 * p3;
        const vm = Math.sqrt(0.5 * ((p1 - p2) ** 2 + (p2 - p3) ** 2 + (p3 - p1) ** 2));
        const tresca = p1 - p3;
        const eq = v.theory === 'vm' ? vm : tresca;
        const sf = eq > 1e-9 ? syield / eq : Infinity;
        const circles = [[p1, p3, 'σ1–σ3'], [p1, p2, 'σ1–σ2'], [p2, p3, 'σ2–σ3']].map(([a, b, n], i) => {
            const c = (a + b) / 2, R = (a - b) / 2, pts = circlePts(c, R);
            return { name: n, x: pts.x, y: pts.y, mode: 'lines', line: { width: i === 0 ? 2.5 : 1.5, color: i === 0 ? 'var(--s1)' : 'var(--color-text-label)' } };
        });
        const pt = { name: `face x′ (${fmt(sxp, 0)}, ${fmt(txyp, 0)})`, x: [sxp, syp], y: [txyp, -txyp], mode: 'lines+markers', line: { color: 'var(--s2)', width: 2 }, marker: { size: 9, color: 'var(--s2)' } };
        const th = linspace(-90, 90, 181);
        const sn = th.map((a) => avg + d * Math.cos(rad(2 * a)) + txy * Math.sin(rad(2 * a)));
        const ts = th.map((a) => -d * Math.sin(rad(2 * a)) + txy * Math.cos(rad(2 * a)));
        return {
            status: { ok: sf >= 1, label: sf >= 1 ? 'SAFE' : 'YIELD', summary: `θ = ${theta}°  σx′ = ${fmt(sxp, 0)} MPa  τx′y′ = ${fmt(txyp, 0)} MPa  σ1 = ${fmt(p1, 0)}  σ3 = ${fmt(p3, 0)}  SF = ${fmt(sf)}` },
            readouts: [
                { label: 'σx′ (rotated)', value: sxp, unit: 'MPa' }, { label: 'σy′ (rotated)', value: syp, unit: 'MPa' }, { label: 'τx′y′ (rotated)', value: txyp, unit: 'MPa' },
                { label: 'σ1 principal', value: p1, unit: 'MPa' }, { label: 'σ2 principal', value: p2, unit: 'MPa' }, { label: 'σ3 principal', value: p3, unit: 'MPa' },
                { label: 'In-plane principal angle', value: thetaP, unit: '°' }, { label: 'Max shear τmax', value: tmax, unit: 'MPa' },
                { label: 'Invariant I1', value: I1, unit: 'MPa' }, { label: 'Invariant I2', value: I2, unit: 'MPa²' }, { label: 'Invariant I3', value: I3, unit: 'MPa³' },
                { label: 'Hydrostatic p = I1/3', value: I1 / 3, unit: 'MPa' },
                { label: 'von Mises σeq', value: vm, unit: 'MPa' }, { label: 'Tresca σ1 − σ3', value: tresca, unit: 'MPa' }, { label: 'Safety factor', value: sf, unit: '' },
            ],
            charts: [
                { id: 'circle', title: "Mohr's circles (σ, τ)", x: 'Normal stress σ (MPa)', y: 'Shear stress τ (MPa)', traces: [...circles, pt], square: true, primary: true },
                { id: 'rot', title: 'Face stresses versus element angle', x: 'θ (°)', y: 'Stress (MPa)', traces: [{ name: 'σx′', x: th, y: sn, mode: 'lines', line: { color: 'var(--s1)' } }, { name: 'τx′y′', x: th, y: ts, mode: 'lines', line: { color: 'var(--s2)' } }, { name: 'current θ', x: [theta, theta], y: [Math.min(...sn, ...ts), Math.max(...sn, ...ts)], mode: 'lines', line: { color: 'var(--color-text-label)', dash: 'dot' }, showlegend: false }] },
            ],
            diagram: elementSVG({ theta, sxp, syp, txyp }),
            csvNote: 'Mohr circle traces',
            equations: ['σx′ = (σx+σy)/2 + (σx−σy)/2·cos2θ + τxy·sin2θ', 'τx′y′ = −(σx−σy)/2·sin2θ + τxy·cos2θ', 'tan2θp = 2τxy/(σx−σy)', 'σ³ − I1σ² + I2σ − I3 = 0', 'σvM = √(½[(σ1−σ2)²+(σ2−σ3)²+(σ3−σ1)²])'],
        };
    },
    significance: 'A stress tensor is one physical state described in many coordinate systems. Mohr\'s circle is the graph of how the traction on a plane (normal and shear parts) changes as the plane rotates. The principal stresses are the extremes of the normal component; the largest shear is half the difference of the extreme principals. The invariants do not change with rotation, so they carry the physical content and feed every failure criterion.',
};

// ---------------------------------------------------------------- Beams (Ch. 8, 9)
function section(v) {
    const m = mat(v);
    if (v.sec === 'rect') {
        const A = v.b * v.h, I = (v.b * v.h ** 3) / 12, c = v.h / 2;
        return { A, I, c, ks: (10 * (1 + m.nu)) / (12 + 11 * m.nu), width: () => v.b, tauMaxFactor: 1.5 };
    }
    const D = v.sec === 'circ' ? v.b : v.b, di = v.sec === 'tube' ? v.h : 0;
    const A = (Math.PI * (D * D - di * di)) / 4, I = (Math.PI * (D ** 4 - di ** 4)) / 64;
    return {
        A, I, c: D / 2,
        ks: di ? (2 * (1 + m.nu)) / (4 + 3 * m.nu) : (6 * (1 + m.nu)) / (7 + 6 * m.nu),
        width: (y) => 2 * (Math.sqrt(Math.max(0, (D / 2) ** 2 - y * y)) - (di ? Math.sqrt(Math.max(0, (di / 2) ** 2 - y * y)) : 0)),
    };
}
function beamSVG(v) {
    const L = 280, x0 = 20, y0 = 90, a = x0 + (v.a / v.L) * L;
    const sup = v.type === 'ss'
        ? `<polygon points="${x0},${y0 + 4} ${x0 - 10},${y0 + 24} ${x0 + 10},${y0 + 24}" fill="none" stroke="var(--color-text)" stroke-width="1.5"/><polygon points="${x0 + L},${y0 + 4} ${x0 + L - 10},${y0 + 24} ${x0 + L + 10},${y0 + 24}" fill="none" stroke="var(--color-text)" stroke-width="1.5"/>`
        : `<rect x="${x0 - 12}" y="${y0 - 28}" width="12" height="64" fill="var(--color-text-label)"/>`;
    const arrow = (x, h) => `<line x1="${x}" y1="${y0 - h}" x2="${x}" y2="${y0 - 3}" stroke="var(--s2)" stroke-width="2"/><polygon points="${x},${y0 - 1} ${x - 4},${y0 - 9} ${x + 4},${y0 - 9}" fill="var(--s2)"/>`;
    const udl = v.w ? [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => arrow(x0 + 4 + (i * (L - 8)) / 8, 24)).join('') + `<line x1="${x0}" y1="${y0 - 24}" x2="${x0 + L}" y2="${y0 - 24}" stroke="var(--s2)" stroke-width="1.5"/>` : '';
    return `<svg viewBox="0 0 320 150" role="img" aria-label="Beam loading diagram">
  <rect x="${x0}" y="${y0 - 3}" width="${L}" height="6" fill="var(--color-accent)"/>${sup}${udl}${v.P ? arrow(a, 54) : ''}
  <g font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--color-text)">
    ${v.P ? `<text x="${a + 6}" y="${y0 - 52}">P = ${v.P} kN</text>` : ''}${v.w ? `<text x="${x0 + 4}" y="${y0 - 30}">w = ${v.w} kN/m</text>` : ''}${v.M0 ? `<text x="${a - 20}" y="${y0 + 42}">M0 = ${v.M0} kN·m ↻</text>` : ''}
    <text x="${x0 + L / 2 - 20}" y="${y0 + 52}" fill="var(--color-text-label)">L = ${v.L} m</text></g></svg>`;
}
const beam = {
    id: 'beam', title: 'Beam analysis', chapters: 'Ch. 8, 9',
    blurb: 'Shear-force and bending-moment diagrams for simply supported and cantilever beams, with bending stress, shear stress and deflection for the chosen cross-section. Switch between Euler–Bernoulli and Timoshenko theory.',
    inputs: [
        { k: 'type', label: 'Support', type: 'select', options: [['ss', 'Simply supported'], ['cant', 'Cantilever (fixed at left)']], value: 'ss' },
        { k: 'L', label: 'Span L', unit: 'm', min: 0.5, max: 10, step: 0.1, value: 3 },
        { k: 'P', label: 'Point load P', unit: 'kN', min: 0, max: 100, step: 0.5, value: 10 },
        { k: 'a', label: 'Load position a', unit: 'm', min: 0, max: 10, step: 0.1, value: 1.5 },
        { k: 'w', label: 'Distributed load w', unit: 'kN/m', min: 0, max: 50, step: 0.5, value: 0 },
        { k: 'M0', label: 'Applied moment M0 (clockwise)', unit: 'kN·m', min: -50, max: 50, step: 0.5, value: 0 },
        { k: 'sec', label: 'Cross-section', type: 'select', options: [['rect', 'Rectangle b × h'], ['circ', 'Solid circle (d = b)'], ['tube', 'Hollow circle (D = b, d = h)']], value: 'rect' },
        { k: 'b', label: 'Width / diameter b', unit: 'mm', min: 10, max: 400, step: 1, value: 80 },
        { k: 'h', label: 'Depth / inner diameter h', unit: 'mm', min: 5, max: 600, step: 1, value: 160 },
        { k: 'mat', label: 'Material', type: 'select', options: matOpts, value: 'steel' },
        { k: 'theory', label: 'Beam theory', type: 'select', options: [['ebt', 'Euler–Bernoulli'], ['tbt', 'Timoshenko (adds shear deflection)']], value: 'ebt' },
    ],
    compute(v0) {
        const v = { ...v0 };
        v.a = Math.min(v.a, v.L);
        if (v.sec === 'tube' && v.h >= v.b) v.h = v.b * 0.8;
        const m = mat(v), sec = section(v);
        const E = m.E * 1000, G = E / (2 * (1 + m.nu)), EI = E * sec.I;
        const L = v.L * 1000, a = v.a * 1000, P = v.P * 1000, w = v.w, M0 = v.M0 * 1e6;
        const n = 401, x = linspace(0, L, n);
        let Vx, Mx, RA, RB, MA;
        if (v.type === 'ss') {
            RB = (P * a + (w * L * L) / 2 + M0) / L; RA = P + w * L - RB;
            Vx = x.map((s) => RA - (s > a ? P : 0) - w * s);
            Mx = x.map((s) => RA * s - (s > a ? P * (s - a) : 0) - (w * s * s) / 2 + (s > a ? M0 : 0));
        } else {
            RA = P + w * L; RB = 0; MA = -(P * a + (w * L * L) / 2 + M0);
            Vx = x.map((s) => (s < a ? P : 0) + w * (L - s));
            Mx = x.map((s) => -((s < a ? P * (a - s) : 0) + (w * (L - s) ** 2) / 2) - (s < a ? M0 : 0));
        }
        const slope0 = cumtrapz(x, Mx.map((q) => q / EI));
        const raw = cumtrapz(x, slope0);
        let vy;
        if (v.type === 'ss') vy = raw.map((q, i) => q - (raw.at(-1) * x[i]) / L);
        else vy = raw;
        let shearDefl = x.map(() => 0);
        if (v.theory === 'tbt') {
            const ys = cumtrapz(x, Vx.map((q) => q / (sec.ks * G * sec.A)));
            shearDefl = v.type === 'ss' ? ys.map((q, i) => q - (ys.at(-1) * x[i]) / L) : ys;
        }
        const defl = vy.map((q, i) => q - shearDefl[i]); // v up; shear adds downward deflection
        const iM = Mx.reduce((b, q, i) => (Math.abs(q) > Math.abs(Mx[b]) ? i : b), 0);
        const Mmax = Mx[iM], Vmax = Math.max(...Vx.map(Math.abs));
        const iD = defl.reduce((b, q, i) => (Math.abs(q) > Math.abs(defl[b]) ? i : b), 0);
        const sMax = (Math.abs(Mmax) * sec.c) / sec.I;
        const ys = linspace(-sec.c, sec.c, 81);
        const Q = ys.map((y) => { let q = 0; const steps = 60; for (let i = 0; i < steps; i++) { const yy = y + ((sec.c - y) * (i + 0.5)) / steps; q += yy * sec.width(yy) * ((sec.c - y) / steps); } return q; });
        const tau = ys.map((y, i) => { const bw = sec.width(y); return bw > 1e-6 ? (Vmax * Q[i]) / (sec.I * bw) : 0; });
        const tauMax = Math.max(...tau);
        const sy = ys.map((y) => (Mmax * y) / sec.I);
        const sf = sMax > 1e-9 ? m.sy / sMax : Infinity;
        const dmax = Math.abs(defl[iD]);
        const mm = (arr, f) => arr.map(f);
        return {
            status: { ok: sf >= 1, label: sf >= 1 ? 'SAFE' : 'YIELD', summary: `Mmax = ${fmt(Math.abs(Mmax) / 1e6)} kN·m  Vmax = ${fmt(Vmax / 1000)} kN  σmax = ${fmt(sMax, 1)} MPa  δmax = ${fmt(dmax)} mm  SF = ${fmt(sf)}` },
            readouts: [
                { label: 'Reaction at left RA', value: RA / 1000, unit: 'kN' }, v.type === 'ss' ? { label: 'Reaction at right RB', value: RB / 1000, unit: 'kN' } : { label: 'Fixed-end moment', value: MA / 1e6, unit: 'kN·m' },
                { label: 'Max shear force', value: Vmax / 1000, unit: 'kN' }, { label: 'Max bending moment', value: Math.abs(Mmax) / 1e6, unit: 'kN·m' },
                { label: 'Max bending stress', value: sMax, unit: 'MPa' }, { label: 'Max shear stress', value: tauMax, unit: 'MPa' },
                { label: 'Max deflection', value: dmax, unit: 'mm' }, { label: 'Second moment I', value: sec.I / 1e4, unit: 'cm⁴' },
                { label: 'Area A', value: sec.A / 100, unit: 'cm²' }, { label: 'Safety factor (σy / σmax)', value: sf, unit: '' },
            ],
            charts: [
                { id: 'v', title: 'Shear-force diagram', x: 'x (m)', y: 'V (kN)', traces: [{ name: 'V', x: mm(x, (q) => q / 1000), y: mm(Vx, (q) => q / 1000), mode: 'lines', fill: 'tozeroy', line: { color: 'var(--s1)' } }], primary: true },
                { id: 'm', title: 'Bending-moment diagram (sagging +)', x: 'x (m)', y: 'M (kN·m)', traces: [{ name: 'M', x: mm(x, (q) => q / 1000), y: mm(Mx, (q) => q / 1e6), mode: 'lines', fill: 'tozeroy', line: { color: 'var(--s2)' } }] },
                { id: 'd', title: `Deflected shape (${v.theory === 'tbt' ? 'Timoshenko' : 'Euler–Bernoulli'})`, x: 'x (m)', y: 'Deflection (mm, down −)', traces: [{ name: 'v(x)', x: mm(x, (q) => q / 1000), y: defl, mode: 'lines', line: { color: 'var(--s1)' } }] },
                { id: 'sig', title: 'Stress through the depth at the critical section', x: 'Stress (MPa)', y: 'y from neutral axis (mm)', traces: [{ name: 'σ bending', x: sy, y: ys, mode: 'lines', line: { color: 'var(--s2)' } }, { name: 'τ shear', x: tau, y: ys, mode: 'lines', line: { color: 'var(--s1)' } }] },
            ],
            diagram: beamSVG(v),
            equations: ['EI·v″ = M(x)   (Euler–Bernoulli)', 'σ = M·y / I', 'τ = V·Q / (I·b)', 'Timoshenko adds shear deflection ∫V / (ks·G·A) dx', 'dV/dx = −w,  dM/dx = V'],
        };
    },
    significance: 'A beam carries transverse load by internal bending moment (stretching the fibres on one side and shortening those on the other) and shear force. Bending stress grows linearly from the neutral axis, so material far from the axis does the work, which is why deep sections are efficient. Shear stress peaks at the neutral axis. Euler–Bernoulli assumes plane sections stay normal to the axis; Timoshenko relaxes that and matters for short, deep beams.',
};

// ---------------------------------------------------------------- Shaft torsion (Ch. 7.5)
function torsionSVG(v, tmax) {
    const R = 60, r = (v.d / v.D) * R;
    const ring = [0, 60, 120, 180, 240, 300].map((a) => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return `<line x1="${r * c}" y1="${r * s}" x2="${R * c}" y2="${R * s}" stroke="var(--s2)" stroke-width="2" stroke-dasharray="${Math.max(0.1, 1)}"/>`; }).join('');
    return `<svg viewBox="-110 -100 220 200" role="img" aria-label="Shaft cross-section">
  <circle r="${R}" fill="var(--color-accent-dim)" stroke="var(--color-accent)" stroke-width="2"/>${v.d > 0 ? `<circle r="${r}" fill="var(--color-surface)" stroke="var(--color-accent)" stroke-width="2"/>` : ''}${ring}
  <g font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--color-text)"><text x="-100" y="-86">τ at r = D/2: ${fmt(tmax, 1)} MPa</text><text x="-100" y="94" fill="var(--color-text-label)">τ grows with radius</text></g></svg>`;
}
const torsion = {
    id: 'torsion', title: 'Shaft torsion', chapters: 'Ch. 7',
    blurb: 'Twist a circular shaft: shear-stress distribution across the radius, angle of twist along the length and torsional stiffness of solid and hollow sections against an allowable shear stress.',
    inputs: [
        { k: 'T', label: 'Torque T', unit: 'N·m', min: 0, max: 5000, step: 10, value: 800 },
        { k: 'L', label: 'Length L', unit: 'm', min: 0.1, max: 5, step: 0.1, value: 1.2 },
        { k: 'D', label: 'Outer diameter D', unit: 'mm', min: 10, max: 200, step: 1, value: 50 },
        { k: 'd', label: 'Inner diameter d (0 = solid)', unit: 'mm', min: 0, max: 190, step: 1, value: 0 },
        { k: 'mat', label: 'Material', type: 'select', options: matOpts, value: 'steel' },
        { k: 'tau_allow', label: 'Allowable shear stress', unit: 'MPa', min: 10, max: 500, step: 5, value: 100 },
    ],
    compute(v0) {
        const v = { ...v0 }; if (v.d >= v.D) v.d = v.D * 0.9;
        const m = mat(v), G = (m.E * 1000) / (2 * (1 + m.nu));
        const J = (Math.PI * (v.D ** 4 - v.d ** 4)) / 32, T = v.T * 1000, L = v.L * 1000;
        const tmax = (T * (v.D / 2)) / J, tmin = (T * (v.d / 2)) / J;
        const phi = (T * L) / (G * J), k = (G * J) / L / 1000; // N·m/rad
        const A = (Math.PI * (v.D ** 2 - v.d ** 2)) / 4;
        const r = linspace(v.d / 2, v.D / 2, 60), x = linspace(0, L, 60);
        const sf = tmax > 1e-9 ? v.tau_allow / tmax : Infinity;
        const Js = (Math.PI * v.D ** 4) / 32;
        return {
            status: { ok: sf >= 1, label: sf >= 1 ? 'SAFE' : 'OVERSTRESSED', summary: `τmax = ${fmt(tmax, 1)} MPa  φ = ${fmt(deg(phi))}°  k = ${fmt(k, 0)} N·m/rad  SF = ${fmt(sf)}` },
            readouts: [
                { label: 'Max shear stress τmax', value: tmax, unit: 'MPa' }, { label: 'Inner-surface shear τmin', value: tmin, unit: 'MPa' },
                { label: 'Angle of twist φ', value: deg(phi), unit: '°' }, { label: 'Torsional stiffness GJ/L', value: k, unit: 'N·m/rad' },
                { label: 'Polar moment J', value: J / 1e4, unit: 'cm⁴' }, { label: 'Shear modulus G', value: G / 1000, unit: 'GPa' },
                { label: 'Safety factor', value: sf, unit: '' }, { label: 'Mass per metre', value: (A * 1e-6 * 7850) , unit: 'kg/m (steel density)' },
                { label: 'Solid-shaft stiffness (same D)', value: ((G * Js) / L) / 1000, unit: 'N·m/rad' },
            ],
            charts: [
                { id: 'tr', title: 'Shear stress across the radius', x: 'Radius r (mm)', y: 'τ (MPa)', traces: [{ name: 'τ(r) = T·r/J', x: r, y: r.map((q) => (T * q) / J), mode: 'lines', fill: 'tozeroy', line: { color: 'var(--s2)' } }, { name: 'allowable', x: [r[0], r.at(-1)], y: [v.tau_allow, v.tau_allow], mode: 'lines', line: { color: 'var(--color-text-label)', dash: 'dash' } }], primary: true },
                { id: 'phi', title: 'Angle of twist along the length', x: 'x (m)', y: 'φ (°)', traces: [{ name: 'φ(x)', x: x.map((q) => q / 1000), y: x.map((q) => deg((T * q) / (G * J))), mode: 'lines', line: { color: 'var(--s1)' } }] },
            ],
            diagram: torsionSVG(v, tmax),
            view3d: { kind: 'torsion', D: v.D, d: v.d, L: v.L * 1000, phi: phi, ratio: sf > 0 ? Math.min(1, tmax / v.tau_allow) : 1 },
            equations: ['τ(r) = T·r / J', 'J = π(D⁴ − d⁴)/32', 'φ = T·L / (G·J)', 'k = G·J / L', 'G = E / 2(1+ν)'],
        };
    },
    significance: 'Torque is carried by shear stress that must balance the applied twist at every cross-section. In a circular shaft plane sections stay plane (no warping), so shear strain, and therefore stress, grows linearly with radius. The material near the axis carries little load, so a hollow shaft keeps most of the stiffness for much less mass.',
};

// ---------------------------------------------------------------- Axial loading (Ch. 6, 7)
const axial = {
    id: 'axial', title: 'Axial loading', chapters: 'Ch. 6, 7',
    blurb: 'Stretch and compress stepped bars: internal force, normal stress and elongation segment by segment, with thermal and stiffness effects and a statically indeterminate fixed–fixed option.',
    inputs: [
        { k: 'n', label: 'Segments', type: 'select', options: [['1', '1'], ['2', '2'], ['3', '3']], value: '3' },
        { k: 'bc', label: 'Right end', type: 'select', options: [['free', 'Free'], ['fixed', 'Fixed (statically indeterminate)']], value: 'free' },
        { k: 'L1', label: 'Length L1', unit: 'mm', min: 50, max: 1000, step: 10, value: 400 }, { k: 'A1', label: 'Area A1', unit: 'mm²', min: 20, max: 2000, step: 10, value: 600 }, { k: 'P1', label: 'Load at node 1', unit: 'kN', min: -100, max: 100, step: 1, value: 0 },
        { k: 'L2', label: 'Length L2', unit: 'mm', min: 50, max: 1000, step: 10, value: 300 }, { k: 'A2', label: 'Area A2', unit: 'mm²', min: 20, max: 2000, step: 10, value: 400 }, { k: 'P2', label: 'Load at node 2', unit: 'kN', min: -100, max: 100, step: 1, value: 20 },
        { k: 'L3', label: 'Length L3', unit: 'mm', min: 50, max: 1000, step: 10, value: 300 }, { k: 'A3', label: 'Area A3', unit: 'mm²', min: 20, max: 2000, step: 10, value: 250 }, { k: 'P3', label: 'Load at node 3', unit: 'kN', min: -100, max: 100, step: 1, value: 15 },
        { k: 'mat', label: 'Material', type: 'select', options: matOpts, value: 'steel' },
        { k: 'dT', label: 'Temperature change ΔT', unit: '°C', min: -100, max: 200, step: 1, value: 0 },
    ],
    compute(v) {
        const n = +v.n, m = mat(v), E = m.E * 1000, al = m.alpha * 1e-6;
        const seg = Array.from({ length: n }, (_, i) => ({ L: v['L' + (i + 1)], A: v['A' + (i + 1)], P: v['P' + (i + 1)] * 1000 }));
        const Nfree = seg.map((_, i) => seg.slice(i).reduce((s, q) => s + q.P, 0));
        let X = 0;
        if (v.bc === 'fixed') {
            const num = seg.reduce((s, q, i) => s + (Nfree[i] * q.L) / (E * q.A), 0) + al * v.dT * seg.reduce((s, q) => s + q.L, 0);
            const den = seg.reduce((s, q) => s + q.L / (E * q.A), 0);
            X = -num / den;
        }
        const N = Nfree.map((q) => q + X);
        const sig = N.map((q, i) => q / seg[i].A);
        const ext = seg.map((q, i) => (N[i] * q.L) / (E * q.A) + al * v.dT * q.L);
        const xs = [0], Ns = [], ss = [], us = [0];
        let pos = 0, disp = 0;
        const xplot = [], Nplot = [], splot = [], uplot = [];
        seg.forEach((q, i) => {
            xplot.push(pos, pos + q.L); Nplot.push(N[i] / 1000, N[i] / 1000); splot.push(sig[i], sig[i]);
            uplot.push(disp, disp + ext[i]); pos += q.L; disp += ext[i];
        });
        const smax = Math.max(...sig.map(Math.abs)), sf = smax > 1e-9 ? m.sy / smax : Infinity;
        const crit = sig.findIndex((q) => Math.abs(q) === smax) + 1;
        return {
            status: { ok: sf >= 1, label: sf >= 1 ? 'SAFE' : 'YIELD', summary: `σmax = ${fmt(smax, 1)} MPa (segment ${crit})  total elongation = ${fmt(disp, 3)} mm  SF = ${fmt(sf)}` },
            readouts: [
                ...seg.map((q, i) => ({ label: `Segment ${i + 1}: N / σ`, value: N[i] / 1000, unit: `kN  /  ${fmt(sig[i], 1)} MPa` })),
                ...seg.map((q, i) => ({ label: `Segment ${i + 1} elongation`, value: ext[i], unit: 'mm' })),
                { label: 'Total elongation of free end', value: disp, unit: 'mm' }, { label: 'Max normal stress', value: smax, unit: 'MPa' },
                { label: 'Stiffness (axial, series)', value: 1 / seg.reduce((s, q) => s + q.L / (E * q.A), 0) / 1000, unit: 'kN/mm' },
                ...(v.bc === 'fixed' ? [{ label: 'Right-wall reaction', value: -(N.at(-1)) / 1000 + 0, unit: 'kN' }] : []),
                { label: 'Safety factor', value: sf, unit: '' },
            ],
            charts: [
                { id: 'N', title: 'Internal force along the bar', x: 'x (mm)', y: 'N (kN)', traces: [{ name: 'N(x)', x: xplot, y: Nplot, mode: 'lines', fill: 'tozeroy', line: { color: 'var(--s2)' } }], primary: true },
                { id: 's', title: 'Normal stress along the bar', x: 'x (mm)', y: 'σ (MPa)', traces: [{ name: 'σ(x)', x: xplot, y: splot, mode: 'lines', fill: 'tozeroy', line: { color: 'var(--s1)' } }] },
                { id: 'u', title: 'Displacement along the bar', x: 'x (mm)', y: 'u (mm)', traces: [{ name: 'u(x)', x: xplot, y: uplot, mode: 'lines+markers', line: { color: 'var(--s1)' } }] },
            ],
            equations: ['N(x) = Σ loads beyond x (free end)', 'σ = N / A', 'δ = N·L / (E·A) + α·ΔT·L', 'Fixed–fixed: Σδ = 0 gives the redundant reaction'],
        };
    },
    significance: 'In a bar loaded along its axis, equilibrium of any cut fixes the internal force N, and stress is N spread over the area. Stiffness EA/L adds in series for stepped bars, so the softest segment dominates elongation. A temperature change creates free strain αΔT; if supports prevent it, the unrealised strain becomes stress.',
};

// ---------------------------------------------------------------- Pressure vessels (Ch. 7 inflation)
function vesselSVG(v, a, b) {
    const R = 70, r = (a / b) * R;
    const arrows = [0, 45, 90, 135, 180, 225, 270, 315].map((t) => { const c = Math.cos(rad(t)), s = Math.sin(rad(t)); return `<line x1="${(r - 24) * c}" y1="${(r - 24) * s}" x2="${(r - 4) * c}" y2="${(r - 4) * s}" stroke="var(--s2)" stroke-width="2"/>`; }).join('');
    return `<svg viewBox="-110 -100 220 200" role="img" aria-label="Pressure vessel wall"><circle r="${R}" fill="var(--color-accent-dim)" stroke="var(--color-accent)" stroke-width="2"/><circle r="${r}" fill="var(--color-surface)" stroke="var(--color-accent)" stroke-width="2"/>${arrows}
  <g font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--color-text)"><text x="-100" y="-88">inner pressure ${v.pi} MPa</text><text x="-100" y="94" fill="var(--color-text-label)">a = ${a} mm, b = ${fmt(b, 1)} mm</text></g></svg>`;
}
const pressure = {
    id: 'pressure', title: 'Pressure vessel', chapters: 'Ch. 7',
    blurb: 'Hoop, axial and radial stress in thin-walled cylinders and spheres and in thick-walled (Lamé) vessels, with the inflation displacement and a failure check.',
    inputs: [
        { k: 'kind', label: 'Vessel', type: 'select', options: [['cyl', 'Cylinder, closed ends'], ['sph', 'Sphere']], value: 'cyl' },
        { k: 'pi', label: 'Internal pressure pi', unit: 'MPa', min: 0, max: 100, step: 0.5, value: 10 },
        { k: 'po', label: 'External pressure po', unit: 'MPa', min: 0, max: 50, step: 0.5, value: 0 },
        { k: 'a', label: 'Inner radius a', unit: 'mm', min: 20, max: 500, step: 5, value: 200 },
        { k: 't', label: 'Wall thickness t', unit: 'mm', min: 1, max: 200, step: 1, value: 12 },
        { k: 'mat', label: 'Material', type: 'select', options: matOpts, value: 'steel' },
    ],
    compute(v) {
        const m = mat(v), E = m.E * 1000, nu = m.nu, a = v.a, b = v.a + v.t, pi = v.pi, po = v.po;
        const cyl = v.kind === 'cyl', rm = a + v.t / 2;
        const thin = cyl ? { th: (pi * rm) / v.t, z: (pi * rm) / (2 * v.t) } : { th: (pi * rm) / (2 * v.t), z: (pi * rm) / (2 * v.t) };
        const r = linspace(a, b, 80);
        let A, B, sr, st, sz, u;
        if (cyl) {
            A = (pi * a * a - po * b * b) / (b * b - a * a); B = ((pi - po) * a * a * b * b) / (b * b - a * a);
            sr = r.map((q) => A - B / (q * q)); st = r.map((q) => A + B / (q * q)); sz = r.map(() => A);
            u = r.map((q, i) => (q / E) * (st[i] - nu * (sr[i] + sz[i])));
        } else {
            A = (pi * a ** 3 - po * b ** 3) / (b ** 3 - a ** 3); B = ((pi - po) * a ** 3 * b ** 3) / (2 * (b ** 3 - a ** 3));
            sr = r.map((q) => A - (2 * B) / q ** 3); st = r.map((q) => A + B / q ** 3); sz = st;
            u = r.map((q, i) => (q / E) * (st[i] - nu * (st[i] + sr[i])));
        }
        const vm = (i) => Math.sqrt(0.5 * ((sr[i] - st[i]) ** 2 + (st[i] - sz[i]) ** 2 + (sz[i] - sr[i]) ** 2));
        const vmA = vm(0), sf = vmA > 1e-9 ? m.sy / vmA : Infinity;
        const ratio = v.t / a;
        return {
            status: { ok: sf >= 1, label: sf >= 1 ? 'SAFE' : 'YIELD', summary: `σθ(inner) = ${fmt(st[0], 1)} MPa  σvM = ${fmt(vmA, 1)} MPa  t/a = ${fmt(ratio, 2)} (${ratio < 0.1 ? 'thin-wall valid' : 'use Lamé'})  SF = ${fmt(sf)}` },
            readouts: [
                { label: 'Thin-wall hoop σθ = p·r/t' + (cyl ? '' : '/2'), value: thin.th, unit: 'MPa' }, { label: 'Thin-wall axial σz', value: thin.z, unit: 'MPa' },
                { label: 'Lamé hoop at inner wall', value: st[0], unit: 'MPa' }, { label: 'Lamé hoop at outer wall', value: st.at(-1), unit: 'MPa' },
                { label: 'Radial stress at inner wall', value: sr[0], unit: 'MPa' }, { label: cyl ? 'Axial stress σz (uniform)' : 'σθ = σφ in sphere', value: sz[0], unit: 'MPa' },
                { label: 'Inner-wall radial growth', value: u[0] * 1000, unit: 'µm' }, { label: 'Thin-wall error vs Lamé', value: (100 * (thin.th - st[0])) / Math.abs(st[0] || 1), unit: '%' },
                { label: 'von Mises at inner wall', value: vmA, unit: 'MPa' }, { label: 'Safety factor', value: sf, unit: '' },
            ],
            charts: [
                { id: 'lame', title: 'Stress through the wall (Lamé)', x: 'Radius r (mm)', y: 'Stress (MPa)', traces: [{ name: 'σθ hoop', x: r, y: st, mode: 'lines', line: { color: 'var(--s2)' } }, { name: 'σr radial', x: r, y: sr, mode: 'lines', line: { color: 'var(--s1)' } }, { name: 'σz axial', x: r, y: sz, mode: 'lines', line: { color: 'var(--s3)' } }, { name: 'thin-wall hoop', x: [a, b], y: [thin.th, thin.th], mode: 'lines', line: { color: 'var(--color-text-label)', dash: 'dash' } }], primary: true },
                { id: 'u', title: 'Radial displacement (inflation)', x: 'Radius r (mm)', y: 'u (µm)', traces: [{ name: 'u(r)', x: r, y: u.map((q) => q * 1000), mode: 'lines', line: { color: 'var(--s1)' } }] },
            ],
            diagram: vesselSVG(v, a, b),
            equations: cyl ? ['Thin: σθ = p·r/t,  σz = p·r/2t', 'σr = A − B/r²,  σθ = A + B/r²', 'A = (pi·a² − po·b²)/(b² − a²)', 'B = (pi − po)·a²b²/(b² − a²)', 'σz = A (closed ends)'] : ['Thin: σθ = σφ = p·r/2t', 'σr = A − 2B/r³,  σθ = A + B/r³', 'A = (pi·a³ − po·b³)/(b³ − a³)', 'B = (pi − po)·a³b³/(2(b³ − a³))'],
        };
    },
    significance: 'Internal pressure tries to enlarge the vessel; the wall resists with hoop tension, like the tension in a hoop around a barrel. Equilibrium of a half-vessel gives the thin-wall formulas. In a thick wall the hoop stress is not uniform and peaks at the inner surface, where the radial stress also equals −p, which the Lamé solution captures from equilibrium plus Hooke\'s law.',
};

// ---------------------------------------------------------------- Thermal stress (Ch. 6.6)
const thermal = {
    id: 'thermal', title: 'Thermal stress', chapters: 'Ch. 6',
    blurb: 'Stress from constrained heating in a bar, plate or block, with the combined thermal and mechanical case and the temperature rise that causes yield.',
    inputs: [
        { k: 'mat', label: 'Material', type: 'select', options: matOpts, value: 'steel' },
        { k: 'dT', label: 'Temperature change ΔT', unit: '°C', min: -200, max: 300, step: 1, value: 60 },
        { k: 'L', label: 'Length L', unit: 'mm', min: 50, max: 5000, step: 10, value: 1000 },
        { k: 'case', label: 'Constraint', type: 'select', options: [['1d', 'Bar (uniaxial)'], ['2d', 'Plate (biaxial)'], ['3d', 'Block (triaxial)']], value: '1d' },
        { k: 'f', label: 'Restraint', unit: '%', min: 0, max: 100, step: 5, value: 100 },
        { k: 'smech', label: 'Mechanical stress added', unit: 'MPa', min: -200, max: 200, step: 5, value: 0 },
    ],
    compute(v) {
        const m = mat(v), E = m.E * 1000, nu = m.nu, al = m.alpha * 1e-6, f = v.f / 100;
        const factor = { '1d': 1, '2d': 1 / (1 - nu), '3d': 1 / (1 - 2 * nu) };
        const sth = (c, dT) => -E * al * dT * f * factor[c];
        const sT = sth(v.case, v.dT), sTot = sT + v.smech;
        const free = al * v.L * v.dT * (1 - f);
        const dTy = m.sy / (E * al * f * factor[v.case] || 1e-9);
        const sf = Math.abs(sTot) > 1e-9 ? m.sy / Math.abs(sTot) : Infinity;
        const dts = linspace(-200, 300, 101);
        const cases = [['1d', 'bar', 's1'], ['2d', 'plate', 's2'], ['3d', 'block', 's3']];
        return {
            status: { ok: sf >= 1, label: sf >= 1 ? 'SAFE' : 'YIELD', summary: `σthermal = ${fmt(sT, 1)} MPa  σtotal = ${fmt(sTot, 1)} MPa  free expansion = ${fmt(free, 3)} mm  SF = ${fmt(sf)}` },
            readouts: [
                { label: 'Free thermal strain αΔT', value: al * v.dT * 1e6, unit: 'µε' }, { label: 'Thermal stress', value: sT, unit: 'MPa' }, { label: 'Total stress', value: sTot, unit: 'MPa' },
                { label: 'Free expansion of length', value: free, unit: 'mm' }, { label: 'ΔT to reach yield', value: dTy, unit: '°C' }, { label: 'Safety factor', value: sf, unit: '' },
                { label: 'Stress per °C', value: sth(v.case, 1), unit: 'MPa/°C' },
            ],
            charts: [
                { id: 'sdt', title: 'Thermal stress versus temperature change', x: 'ΔT (°C)', y: 'σ (MPa)', traces: [...cases.map(([c, n, col]) => ({ name: n, x: dts, y: dts.map((q) => sth(c, q)), mode: 'lines', line: { color: `var(--${col})`, width: c === v.case ? 3 : 1.2 } })), { name: 'yield ±σy', x: [-200, 300], y: [m.sy, m.sy], mode: 'lines', line: { color: 'var(--color-text-label)', dash: 'dash' } }, { name: '−σy', x: [-200, 300], y: [-m.sy, -m.sy], mode: 'lines', line: { color: 'var(--color-text-label)', dash: 'dash' }, showlegend: false }, { name: 'operating point', x: [v.dT], y: [sT], mode: 'markers', marker: { size: 11, color: 'var(--s2)' } }], primary: true },
                { id: 'rest', title: 'Stress versus restraint', x: 'Restraint (%)', y: 'σ (MPa)', traces: [{ name: 'σ thermal', x: linspace(0, 100, 21), y: linspace(0, 100, 21).map((q) => -E * al * v.dT * (q / 100) * factor[v.case]), mode: 'lines', line: { color: 'var(--s1)' } }, { name: 'current', x: [v.f], y: [sT], mode: 'markers', marker: { size: 11, color: 'var(--s2)' } }] },
            ],
            equations: ['εfree = α·ΔT', 'Bar: σ = −E·α·ΔT', 'Plate: σ = −E·α·ΔT / (1−ν)', 'Block: σ = −E·α·ΔT / (1−2ν)', 'σ_total = σ_thermal + σ_mechanical'],
        };
    },
    significance: 'Heating makes a free body expand with no stress. Stress appears only when the expansion is blocked: the body is pushed back to its constrained length, so the stress equals the elastic strain needed to cancel the free thermal strain. Constraining more directions makes the material stiffer in effect, so the same ΔT gives larger stress.',
};

// ---------------------------------------------------------------- Failure theories (Ch. 11)
const failure = {
    id: 'failure', title: 'Failure theories', chapters: 'Ch. 11',
    blurb: 'Compare maximum principal stress, maximum normal strain, Tresca and von Mises (octahedral shear) criteria for a given principal stress state against the simple-tension critical value.',
    inputs: [
        { k: 's1', label: 'σ1', unit: 'MPa', min: -400, max: 400, step: 1, value: 150 },
        { k: 's2', label: 'σ2', unit: 'MPa', min: -400, max: 400, step: 1, value: 60 },
        { k: 's3', label: 'σ3', unit: 'MPa', min: -400, max: 400, step: 1, value: 0 },
        { k: 'scr', label: 'Critical value σcr (simple tension)', unit: 'MPa', min: 50, max: 1000, step: 5, value: 250 },
        { k: 'nu', label: "Poisson's ratio ν", min: 0, max: 0.49, step: 0.01, value: 0.3 },
    ],
    compute(v) {
        const [a, b, c] = [v.s1, v.s2, v.s3].sort((p, q) => q - p), { scr: S, nu } = v;
        const rank = Math.max(...[a, b, c].map(Math.abs));
        const tre = a - c;
        const vm = Math.sqrt(0.5 * ((a - b) ** 2 + (b - c) ** 2 + (c - a) ** 2));
        const sv = Math.max(...[[a, b, c], [b, a, c], [c, a, b]].map(([i, j, k]) => Math.abs(i - nu * (j + k))));
        const SFs = [['Max principal stress', S / rank], ['Max normal strain', S / sv], ['Max shear (Tresca)', S / tre], ['Distortional energy (von Mises)', S / vm]].map(([n, q]) => [n, Number.isFinite(q) ? q : Infinity]);
        const minSF = Math.min(...SFs.map((q) => q[1])), gov = SFs.find((q) => q[1] === minSF)[0];
        const t = linspace(0, 2 * Math.PI, 181);
        const sq = nu / (1 - nu * nu), g = 1 / (1 - nu * nu);
        const stv = [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]].map(([s1, s2]) => [S * (g * s1 + sq * s2), S * (g * s2 + sq * s1)]);
        const ell = t.map((q) => { const x = Math.SQRT2 * S * Math.cos(q), y = Math.sqrt(2 / 3) * S * Math.sin(q); return [(x - y) / Math.SQRT2, (x + y) / Math.SQRT2]; });
        const line = (pts, name, col, dash) => ({ name, x: pts.map((q) => q[0]), y: pts.map((q) => q[1]), mode: 'lines', line: { color: col, dash, width: 2 } });
        return {
            status: { ok: minSF >= 1, label: minSF >= 1 ? 'SAFE' : 'FAILS', summary: `governing: ${gov}  minimum SF = ${fmt(minSF)}` },
            readouts: [...SFs.map(([n, q]) => ({ label: `SF: ${n}`, value: q, unit: '' })), { label: 'Governing theory', value: gov, unit: '' }, { label: 'von Mises equivalent', value: vm, unit: 'MPa' }, { label: 'Tresca equivalent', value: tre, unit: 'MPa' }, { label: 'Max shear τmax', value: tre / 2, unit: 'MPa' }],
            charts: [{ id: 'locus', title: 'Failure envelopes in the σ1–σ2 plane (σ3 = 0)', x: 'σ1 (MPa)', y: 'σ2 (MPa)', square: true, primary: true, traces: [
                line([[S, S], [S, -S], [-S, -S], [-S, S], [S, S]], 'Max principal', 'var(--color-text-label)', 'dot'),
                line(stv, 'Max normal strain', 'var(--s3)', 'dashdot'),
                line([[S, 0], [S, S], [0, S], [-S, 0], [-S, -S], [0, -S], [S, 0]], 'Tresca', 'var(--s1)'),
                line(ell, 'von Mises', 'var(--s2)'),
                { name: 'operating state', x: [v.s1], y: [v.s2], mode: 'markers', marker: { size: 12, color: 'var(--color-text)', symbol: 'x' } },
            ] }],
            equations: ['Max principal: max|σi| ≤ σcr', 'Max normal strain: ε1 = [σ1 − ν(σ2+σ3)]/E ≤ σcr/E', 'Tresca: σ1 − σ3 ≤ σcr', 'von Mises: √(½[(σ1−σ2)²+(σ2−σ3)²+(σ3−σ1)²]) ≤ σcr', 'Octahedral shear τoct = √2/3·σvM'],
        };
    },
    significance: 'A failure theory converts the full stress state into one number that can be compared with a single tension test. Ductile metals yield by shear, so Tresca (largest shear) and von Mises (distortional energy, equal to octahedral shear) fit them; Tresca is slightly conservative. Maximum principal stress suits brittle fracture. Each envelope shows which combinations of σ1 and σ2 are safe.',
};

// ---------------------------------------------------------------- Energy methods (Ch. 10)
const energy = {
    id: 'energy', title: 'Energy methods', chapters: 'Ch. 10',
    blurb: "Strain energy in a bar, shaft or beam and Castigliano's first theorem: the deflection under a load is the derivative of strain energy with respect to that load. Includes a Maxwell–Betti reciprocity check.",
    inputs: [
        { k: 'case', label: 'Member', type: 'select', options: [['axial', 'Axial bar'], ['torsion', 'Circular shaft in torsion'], ['cant', 'Cantilever, end load'], ['ss', 'Simply supported, central load']], value: 'cant' },
        { k: 'P', label: 'Load P (N, or N·m for torsion)', unit: 'N', min: 1, max: 20000, step: 10, value: 2000 },
        { k: 'L', label: 'Length L', unit: 'mm', min: 100, max: 3000, step: 10, value: 1000 },
        { k: 'd', label: 'Section diameter d', unit: 'mm', min: 5, max: 200, step: 1, value: 40 },
        { k: 'mat', label: 'Material', type: 'select', options: matOpts, value: 'steel' },
        { k: 'shear', label: 'Include shear energy in beams', type: 'select', options: [['0', 'No (bending only)'], ['1', 'Yes (Timoshenko)']], value: '0' },
    ],
    compute(v) {
        const m = mat(v), E = m.E * 1000, G = E / (2 * (1 + m.nu)), A = (Math.PI * v.d ** 2) / 4, I = (Math.PI * v.d ** 4) / 64, J = 2 * I;
        const ks = (6 * (1 + m.nu)) / (7 + 6 * m.nu), L = v.L, sh = v.shear === '1';
        const U = (P) => ({
            axial: (P * P * L) / (2 * A * E), torsion: (P * 1000) ** 2 * L / (2 * G * J),
            cant: (P * P * L ** 3) / (6 * E * I) + (sh ? (P * P * L) / (2 * ks * G * A) : 0),
            ss: (P * P * L ** 3) / (96 * E * I) + (sh ? (P * P * L) / (8 * ks * G * A) : 0),
        }[v.case]);
        const h = Math.max(1e-3 * v.P, 1e-6), cast = (U(v.P + h) - U(v.P - h)) / (2 * h);
        const direct = {
            axial: (v.P * L) / (A * E), torsion: ((v.P * 1000 * L) / (G * J)) * 1000,
            cant: (v.P * L ** 3) / (3 * E * I) + (sh ? (v.P * L) / (ks * G * A) : 0),
            ss: (v.P * L ** 3) / (48 * E * I) + (sh ? (v.P * L) / (4 * ks * G * A) : 0),
        }[v.case];
        const unit = { axial: 'mm', torsion: 'rad (×1000)', cant: 'mm', ss: 'mm' }[v.case];
        const castOut = cast; // torsion: dU/dT in N·mm per N·m = φ × 1000 (rad ×1000), like the closed form
        const x = linspace(0, L, 101);
        const Mx = x.map((s) => ({ axial: 0, torsion: 0, cant: v.P * (L - s), ss: s < L / 2 ? (v.P * s) / 2 : (v.P * (L - s)) / 2 }[v.case]));
        const dens = Mx.map((q) => (q * q) / (2 * E * I));
        const Ps = linspace(0, 2 * v.P, 41);
        // Maxwell–Betti: SS beam, unit-type load at a = 0.3L and b = 0.7L.
        const infl = (xx, xi) => { const lo = Math.min(xx, xi), hi = Math.max(xx, xi); return (lo * (L - hi) * (L * L - lo * lo - (L - hi) ** 2)) / (6 * E * I * L); };
        const dab = infl(0.7 * L, 0.3 * L) * v.P, dba = infl(0.3 * L, 0.7 * L) * v.P;
        const Utotal = U(v.P);
        return {
            status: { ok: Math.abs(cast - direct) / Math.abs(direct) < 1e-4, label: 'CHECKED', summary: `U = ${fmt(Utotal / 1000, 3)} J  δ = ∂U/∂P = ${fmt(castOut, 4)} ${unit}  closed form ${fmt(direct, 4)}` },
            readouts: [
                { label: 'Strain energy U', value: Utotal / 1000, unit: 'J' }, { label: "Castigliano ∂U/∂P (numeric)", value: castOut, unit: unit },
                { label: 'Closed-form displacement', value: direct, unit: unit }, { label: 'Work of load ½Pδ', value: (0.5 * v.P * direct) / 1000, unit: 'J (equals U)' },
                { label: 'Reciprocity δab (load at 0.3L, read at 0.7L)', value: dab, unit: 'mm' }, { label: 'Reciprocity δba (load at 0.7L, read at 0.3L)', value: dba, unit: 'mm' },
            ],
            charts: [
                { id: 'UP', title: 'Strain energy versus load (slope = displacement)', x: 'P', y: 'U (N·mm)', traces: [{ name: 'U(P)', x: Ps, y: Ps.map(U), mode: 'lines', line: { color: 'var(--s1)' } }, { name: 'tangent at P', x: [0, 2 * v.P], y: [U(v.P) - cast * v.P, U(v.P) + cast * v.P], mode: 'lines', line: { color: 'var(--s2)', dash: 'dash' } }], primary: true },
                ...(v.case === 'cant' || v.case === 'ss' ? [{ id: 'dens', title: 'Bending-energy density M²/2EI along the beam', x: 'x (mm)', y: 'M²/2EI (N)', traces: [{ name: 'M²/2EI', x, y: dens, mode: 'lines', fill: 'tozeroy', line: { color: 'var(--s2)' } }] }] : []),
            ],
            equations: ['Linear elasticity: U = ½·P·δ', 'Axial: U = P²L/2AE;  Torsion: U = T²L/2GJ', 'Bending: U = ∫ M²/(2EI) dx;  Shear: U = ∫ V²/(2ks·G·A) dx', 'Castigliano: δi = ∂U/∂Pi', 'Maxwell–Betti: Pa·δab = Pb·δba'],
        };
    },
    significance: 'External work done on an elastic body is stored as strain energy and returned on unloading. Because U depends only on the final loads, differentiating U with respect to a load gives the displacement at that load in its direction (Castigliano). Linearity gives reciprocity: the deflection at b due to a load at a equals the deflection at a due to the same load at b.',
};

// ---------------------------------------------------------------- Column buckling (Ch. 9.4)
const buckling = {
    id: 'buckling', title: 'Column buckling', chapters: 'Ch. 9',
    blurb: 'Euler buckling load for different end conditions, slenderness ratio, critical stress against yield and the buckled mode shape.',
    inputs: [
        { k: 'end', label: 'End conditions', type: 'select', options: [['pp', 'Pinned–pinned (K = 1)'], ['fp', 'Fixed–pinned (K ≈ 0.7)'], ['ff', 'Fixed–fixed (K = 0.5)'], ['fr', 'Fixed–free (K = 2)']], value: 'pp' },
        { k: 'L', label: 'Length L', unit: 'm', min: 0.2, max: 6, step: 0.1, value: 2 },
        { k: 'b', label: 'Section width b', unit: 'mm', min: 5, max: 200, step: 1, value: 30 },
        { k: 'h', label: 'Section depth h', unit: 'mm', min: 5, max: 200, step: 1, value: 50 },
        { k: 'mat', label: 'Material', type: 'select', options: matOpts, value: 'steel' },
        { k: 'P', label: 'Applied axial load P', unit: 'kN', min: 0, max: 500, step: 1, value: 10 },
    ],
    compute(v) {
        const m = mat(v), E = m.E * 1000, K = { pp: 1, fp: 0.699, ff: 0.5, fr: 2 }[v.end], L = v.L * 1000;
        const Imin = (Math.min(v.b, v.h) ** 3 * Math.max(v.b, v.h)) / 12, A = v.b * v.h, r = Math.sqrt(Imin / A);
        const Pcr = (Math.PI ** 2 * E * Imin) / (K * L) ** 2, lam = (K * L) / r, scr = Pcr / A;
        const lamC = Math.PI * Math.sqrt(E / m.sy), valid = lam >= lamC;
        const sJ = m.sy * (1 - (m.sy * lam * lam) / (4 * Math.PI ** 2 * E)); // Johnson parabola, joins Euler at λc with σ = σy/2
        const sdes = valid ? scr : Math.max(sJ, 0), Pdes = sdes * A;      // Euler stress exceeds yield for short columns, so it cannot be used there
        const sf = v.P > 0 ? Pdes / (v.P * 1000) : Infinity;
        const lams = linspace(10, 250, 120);
        const x = linspace(0, 1, 101);
        const shape = { pp: x.map((s) => Math.sin(Math.PI * s)), fr: x.map((s) => 1 - Math.cos((Math.PI * s) / 2)), ff: x.map((s) => (1 - Math.cos(2 * Math.PI * s)) / 2), fp: x.map((s) => { const kL = 4.4934; return (Math.sin(kL * s) - s * Math.sin(kL)) / 0.9; }) }[v.end];
        return {
            status: { ok: sf >= 1, label: sf >= 1 ? 'STABLE' : 'BUCKLES', summary: `Pcr = ${fmt(Pdes / 1000)} kN  λ = ${fmt(lam, 0)}  σcr = ${fmt(sdes, 1)} MPa  ${valid ? 'Euler valid' : 'short column: Johnson parabola'}  SF = ${fmt(sf)}` },
            readouts: [
                { label: 'Euler load Pcr', value: Pcr / 1000, unit: 'kN' }, { label: 'Effective length factor K', value: K, unit: '' }, { label: 'Slenderness λ = KL/r', value: lam, unit: '' },
                { label: 'Critical stress (Euler, or Johnson if short)', value: sdes, unit: 'MPa' }, { label: 'Design critical load', value: Pdes / 1000, unit: 'kN' }, { label: 'Transition slenderness', value: lamC, unit: '' }, { label: 'Radius of gyration r', value: r, unit: 'mm' },
                { label: 'Buckling safety factor', value: sf, unit: '' }, { label: 'Euler theory valid?', value: valid ? 'yes' : 'no, short column', unit: '' },
            ],
            charts: [
                { id: 'sl', title: 'Critical stress versus slenderness', x: 'Slenderness λ', y: 'σcr (MPa)', traces: [{ name: 'Euler', x: lams, y: lams.map((q) => Math.min((Math.PI ** 2 * E) / q ** 2, m.sy * 3)), mode: 'lines', line: { color: 'var(--s1)' } }, { name: 'yield', x: [10, 250], y: [m.sy, m.sy], mode: 'lines', line: { color: 'var(--color-text-label)', dash: 'dash' } }, { name: 'Johnson (short columns)', x: linspace(10, lamC, 40), y: linspace(10, lamC, 40).map((q) => m.sy * (1 - (m.sy * q * q) / (4 * Math.PI ** 2 * E))), mode: 'lines', line: { color: 'var(--s3)' } }, { name: 'this column', x: [lam], y: [Math.min(sdes, m.sy * 3)], mode: 'markers', marker: { size: 12, color: 'var(--s2)' } }], primary: true },
                { id: 'mode', title: 'First buckling mode', x: 'x / L', y: 'Lateral deflection (normalised)', traces: [{ name: 'mode 1', x, y: shape, mode: 'lines', line: { color: 'var(--s2)' } }] },
            ],
            equations: ['Pcr = π²·E·I / (K·L)²', 'λ = K·L / r,  r = √(I/A)', 'σcr = π²·E / λ²', 'Euler valid for λ > π√(E/σy)', 'Short columns: σcr = σy[1 − σy λ² / 4π²E] (Johnson)'],
        };
    },
    significance: 'A slender column under compression can become unstable long before the material yields: the straight shape stops being the stable equilibrium and the member bows sideways. The critical load falls with the square of the effective length, so end restraint matters, and it depends on bending stiffness EI rather than material strength.',
};

const SIMS = [mohr, beam, torsion, axial, pressure, thermal, failure, energy, buckling];

// ---------------------------------------------------------------- Framework
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function resolveColor(c) { return typeof c === 'string' && c.startsWith('var(') ? css(c.slice(4, -1)) : c; }
function themed(tr, baseline) {
    const t = JSON.parse(JSON.stringify(tr));
    if (t.line) { t.line.color = resolveColor(t.line.color); if (baseline) { t.line.dash = 'dot'; t.line.width = 1.5; } }
    if (t.marker) t.marker.color = resolveColor(t.marker.color);
    if (baseline) { t.name = (t.name || '') + ' (A)'; t.opacity = 0.65; t.fill = 'none'; t.showlegend = false; }
    return t;
}
function plotLayout(ch, height) {
    const text = css('--color-text'), muted = css('--color-text-muted'), grid = css('--color-panel-border');
    return {
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: css('--color-surface'),
        font: { color: muted, family: 'IBM Plex Mono, monospace', size: 11 },
        title: { text: ch.title, font: { family: 'IBM Plex Sans Condensed, sans-serif', size: 14, color: text }, x: 0.02 },
        margin: { t: 40, r: 16, b: 46, l: 56 }, autosize: true, height,
        xaxis: { title: { text: ch.x }, gridcolor: grid, zerolinecolor: muted, linecolor: text },
        yaxis: { title: { text: ch.y }, gridcolor: grid, zerolinecolor: muted, linecolor: text, ...(ch.square ? { scaleanchor: 'x', scaleratio: 1 } : {}) },
        legend: { orientation: 'h', y: -0.22, font: { size: 10 } }, hovermode: 'closest',
    };
}

// var() is not valid in SVG presentation attributes, so move them into style.
const svgVars = (s) => s.replace(/\b(fill|stroke)="(var\(--[\w-]+\))"/g, 'style="$1:$2"');

// ---- 3D view (torsion): twisted shaft, rings and axial lines show the rotation of each section.
const view = { renderer: null, scene: null, camera: null, controls: null, group: null, ro: null };
function ensureView() {
    if (view.renderer || typeof THREE === 'undefined') return !!view.renderer;
    const canvas = $('sim-canvas3d');
    view.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    view.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    view.scene = new THREE.Scene();
    view.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    view.camera.position.set(5.2, 3.4, 6.4);
    view.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(3, 6, 4); view.scene.add(dl);
    view.group = new THREE.Group(); view.scene.add(view.group);
    if (THREE.OrbitControls) { view.controls = new THREE.OrbitControls(view.camera, canvas); view.controls.enableDamping = false; view.controls.addEventListener('change', draw3d); }
    view.ro = new ResizeObserver(() => { const w = canvas.clientWidth, h = canvas.clientHeight; if (w && h) { view.renderer.setSize(w, h, false); view.camera.aspect = w / h; view.camera.updateProjectionMatrix(); draw3d(); } });
    view.ro.observe(canvas);
    return true;
}
const draw3d = () => { if (view.renderer) view.renderer.render(view.scene, view.camera); };
function rampColor(t) { const [r, g, b] = [0, 1, 2].map((k) => { const lo = [0.23, 0.42, 0.66], mid = [0.95, 0.94, 0.9], hi = [0.82, 0.27, 0.11]; return t < 0.5 ? lo[k] + (mid[k] - lo[k]) * (t * 2) : mid[k] + (hi[k] - mid[k]) * ((t - 0.5) * 2); }); return new THREE.Color(r, g, b); }
function update3d(info) {
    if (!ensureView()) return;
    const g = view.group;
    while (g.children.length) { const c = g.children.pop(); c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); }
    const R = 0.8, ri = R * (info.d / info.D), len = Math.min(5.5, Math.max(2.2, (info.L / info.D) * R * 0.7));
    // visual twist: exaggerate small twists so they can be seen, and say so
    const realDeg = deg(info.phi), k = realDeg > 0 && realDeg < 20 ? Math.min(200, 20 / realDeg) : 1;
    const vis = rad(Math.min(170, realDeg * k));
    const twist = (geo) => {
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = vis * (y + len / 2) / len, c = Math.cos(a), s = Math.sin(a); pos.setXYZ(i, x * c + z * s, y, -x * s + z * c); }
        pos.needsUpdate = true; geo.computeVertexNormals(); return geo;
    };
    const shellColor = rampColor(0.15 + 0.85 * info.ratio);
    const edge = new THREE.Color(css('--color-text'));
    const tube = (r, side) => {
        const geo = twist(new THREE.CylinderGeometry(r, r, len, 48, 48, true));
        g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: shellColor, side, transparent: true, opacity: 0.88 })));
        const wf = new THREE.LineSegments(new THREE.WireframeGeometry(twist(new THREE.CylinderGeometry(r * 1.003, r * 1.003, len, 16, 20, true))), new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.55 })); g.add(wf);
    };
    tube(R, THREE.FrontSide); if (ri > 0.01) tube(ri, THREE.BackSide);
    // free end face: colour shows the shear stress growing with radius (τ = T·r/J)
    const ringGeo = new THREE.RingGeometry(Math.max(ri, 0.001), R, 48, 10).rotateX(-Math.PI / 2);
    const cols = []; const rp = ringGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) { const rr = Math.hypot(rp.getX(i), rp.getZ(i)); const c = rampColor(info.ratio * rr / R); cols.push(c.r, c.g, c.b); }
    ringGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    ringGeo.translate(0, len / 2, 0); const face = twist(ringGeo);
    g.add(new THREE.Mesh(face, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // fixed wall
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.5, R * 1.5, 0.12, 48), new THREE.MeshLambertMaterial({ color: new THREE.Color(css('--color-text-label')) }));
    wall.position.y = -len / 2 - 0.06; g.add(wall);
    // one straight axial line shows the twist angle at the free end
    const pts = Array.from({ length: 49 }, (_, i) => { const y = -len / 2 + (len * i) / 48, a = vis * (i / 48); return new THREE.Vector3(R * 1.01 * Math.sin(a), y, R * 1.01 * Math.cos(a)); });
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(css('--s2')) })));
    view.camera.lookAt(0, 0, 0); if (view.controls) view.controls.target.set(0, 0, 0);
    $('sim-view3d-note').textContent = `Fixed wall at the bottom, free end twisted by ${fmt(realDeg)}°${k > 1 ? ` (drawn ×${fmt(k, 0)} so it is visible)` : ''}. Drag to rotate.`;
    draw3d();
}

const store = { sim: null, values: {}, result: null, baseline: null, raf: 0 };

function defaults(sim) { return Object.fromEntries(sim.inputs.map((i) => [i.k, i.value])); }
function parseVal(inp, raw) { return inp.type === 'select' ? raw : parseFloat(raw); }

function buildControls(sim) {
    const host = $('sim-controls'); host.innerHTML = '';
    sim.inputs.forEach((inp) => {
        const g = document.createElement('div'); g.className = 'control-group';
        const id = `sim-in-${inp.k}`;
        if (inp.type === 'select') {
            g.innerHTML = `<label for="${id}">${inp.label}</label><select id="${id}">${inp.options.map(([val, lab]) => `<option value="${val}">${lab}</option>`).join('')}</select>`;
            host.appendChild(g);
            const el = g.querySelector('select'); el.value = store.values[inp.k];
            el.addEventListener('change', () => { store.values[inp.k] = el.value; schedule(); });
        } else {
            g.innerHTML = `<label for="${id}-n"><span>${inp.label}</span><span class="val"><input type="number" id="${id}-n" min="${inp.min}" max="${inp.max}" step="${inp.step}" aria-label="${inp.label}"> ${inp.unit || ''}</span></label><input type="range" id="${id}" min="${inp.min}" max="${inp.max}" step="${inp.step}">`;
            host.appendChild(g);
            const r = g.querySelector('input[type=range]'), n = g.querySelector('input[type=number]');
            r.value = n.value = store.values[inp.k];
            r.addEventListener('input', () => { n.value = r.value; store.values[inp.k] = parseFloat(r.value); schedule(); });
            n.addEventListener('input', () => { if (n.value === '' || isNaN(+n.value)) return; r.value = n.value; store.values[inp.k] = parseFloat(n.value); schedule(); });
        }
    });
}

function schedule() { cancelAnimationFrame(store.raf); store.raf = requestAnimationFrame(render); }

function render() {
    const sim = store.sim; if (!sim) return;
    const r = sim.compute(store.values); store.result = r;
    const st = $('sim-status'); st.className = 'sim-status ' + (r.status.ok ? 'ok' : 'bad');
    st.innerHTML = `<span class="badge">${r.status.label}</span><span class="summary">${r.status.summary}</span>`;
    $('sim-diagram').innerHTML = svgVars(r.diagram || ''); $('sim-diagram').hidden = !r.diagram;
    $('sim-view3d').hidden = !r.view3d;
    $('sim-left').hidden = !r.diagram && !r.view3d;
    if (r.view3d) update3d(r.view3d);
    const base = store.baseline && store.baseline.id === sim.id ? store.baseline.result : null;
    $('sim-readouts').innerHTML = r.readouts.map((o, i) => {
        const b = base && base.readouts[i] && typeof o.value === 'number' ? base.readouts[i].value : null;
        const val = typeof o.value === 'number' ? fmt(o.value, Math.abs(o.value) >= 100 ? 1 : 2) : o.value;
        const delta = b !== null && Number.isFinite(b) && Math.abs(o.value - b) > 1e-9 ? `<span class="delta">A: ${fmt(b)}</span>` : '';
        return `<div class="readout-card"><span class="label">${o.label}</span><span class="value">${val} <span class="unit">${o.unit}</span></span>${delta}</div>`;
    }).join('');
    const charts = $('sim-charts');
    const keep = r.charts.map((c) => 'sim-chart-' + c.id);
    [...charts.children].forEach((el) => { if (!keep.includes(el.id)) { Plotly.purge(el); el.remove(); } });
    r.charts.forEach((c) => {
        let el = $('sim-chart-' + c.id);
        if (!el) { el = document.createElement('div'); el.id = 'sim-chart-' + c.id; el.className = 'chart-card'; charts.appendChild(el); }
        el.classList.toggle('primary', !!c.primary);
        const traces = c.traces.map((t) => themed(t, false));
        const bc = base && base.charts.find((q) => q.id === c.id);
        if (bc) bc.traces.forEach((t) => traces.push(themed(t, true)));
        Plotly.react(el, traces, plotLayout(c, el.clientHeight || 340), { responsive: true, displaylogo: false, toImageButtonOptions: { filename: `${sim.id}-${c.id}` } });
    });
    $('sim-eq').innerHTML = r.equations.map((e) => `<li><code>${e}</code></li>`).join('');
    $('btn-clear-baseline').hidden = !base;
    $('baseline-tag').textContent = base ? 'Dotted lines and “A:” values show the saved baseline.' : '';
}

function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function inputsTable(sim, vals) {
    return sim.inputs.map((i) => { const opt = i.type === 'select' ? i.options.find((o) => o[0] === vals[i.k])?.[1] : vals[i.k]; return [i.label, opt, i.unit || '']; });
}
function exportCSV() {
    const sim = store.sim, r = store.result; const rows = [['quantity', 'value', 'unit'], ...inputsTable(sim, store.values).map((x) => ['input: ' + x[0], x[1], x[2]]), ...r.readouts.map((o) => [o.label, typeof o.value === 'number' ? o.value : o.value, o.unit]), [], ['chart', 'trace', 'x', 'y']];
    r.charts.forEach((c) => c.traces.forEach((t) => t.x.forEach((xx, i) => rows.push([c.title, t.name, xx, t.y[i]]))));
    download(`${sim.id}-data.csv`, rows.map((q) => q.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}
function exportSpec() {
    const sim = store.sim, r = store.result;
    const t = [`DESIGN SPECIFICATION: ${sim.title} `, `Generated ${new Date().toISOString().slice(0, 10)}`, '', `Status: ${r.status.label}`, r.status.summary, '', 'INPUTS', ...inputsTable(sim, store.values).map((x) => `  ${x[0]}: ${x[1]} ${x[2]}`), '', 'RESULTS', ...r.readouts.map((o) => `  ${o.label}: ${typeof o.value === 'number' ? fmt(o.value, 3) : o.value} ${o.unit}`), '', 'GOVERNING EQUATIONS', ...r.equations.map((e) => '  ' + e)];
    download(`${sim.id}-design-spec.txt`, t.join('\n'), 'text/plain');
}
async function exportReport() {
    const sim = store.sim, r = store.result;
    const imgs = await Promise.all(r.charts.map((c) => Plotly.toImage($('sim-chart-' + c.id), { format: 'png', width: 900, height: 480 }).catch(() => '')));
    const table = (rows) => `<table>${rows.map((q) => `<tr>${q.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
    const html = `<!doctype html><meta charset="utf-8"><title>Lab report: ${sim.title}</title><style>body{font:15px/1.5 Georgia,serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#1b2733}h1,h2{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}td{border:1px solid #999;padding:3px 8px}img{max-width:100%}code{font-family:monospace}</style>
<h1>Lab report: ${sim.title}</h1><p>${new Date().toDateString()}</p>
<h2>1. Aim</h2><p>${sim.blurb}</p><h2>2. Physical significance</h2><p>${sim.significance}</p>
<h2>3. Governing equations</h2><ul>${r.equations.map((e) => `<li><code>${e}</code></li>`).join('')}</ul>
<h2>4. Inputs</h2>${table(inputsTable(sim, store.values))}
<h2>5. Results</h2><p><b>${r.status.label}</b>. ${r.status.summary}</p>${table(r.readouts.map((o) => [o.label, typeof o.value === 'number' ? fmt(o.value, 3) : o.value, o.unit]))}
<h2>6. Charts</h2>${imgs.map((s) => (s ? `<img src="${s}" alt="chart">` : '')).join('')}
<h2>7. Conclusion</h2><p>The state is ${r.status.ok ? 'within' : 'outside'} the allowable limit with the reported safety factor or margin above.</p>`;
    download(`${sim.id}-lab-report.html`, html, 'text/html');
}
function exportDiagram() {
    const svg = $('sim-diagram').querySelector('svg'); if (!svg) return;
    let s = new XMLSerializer().serializeToString(svg);
    s = s.replace(/var\(--([\w-]+)\)/g, (_, n) => css('--' + n));
    download(`${store.sim.id}-diagram.svg`, s, 'image/svg+xml');
}

function select(id) {
    const sim = SIMS.find((s) => s.id === id) || SIMS[0];
    store.sim = sim; store.values = defaults(sim);
    $('sim-title').textContent = sim.title; $('sim-blurb').textContent = sim.blurb; $('sim-significance').textContent = sim.significance;
    document.querySelectorAll('.module-nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.module === id)));
    $('sim-charts').innerHTML = ''; buildControls(sim); $('sim-exports-hint').textContent = '';
    render();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
}

// Extra tabs (e.g. fem.js) register here: { id, title, chapters, el, show() }. They own their own section element.
const extras = new Map();
const INITIAL_HASH = location.hash.slice(1);   // init() rewrites the hash before late-registering tabs load
export function registerModule(def) {
    extras.set(def.id, def);
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.module = def.id; b.textContent = def.title;
    $('module-nav').appendChild(b);
    if (INITIAL_HASH === def.id) showModule(def.id);
}

export function showModule(id) {
    const extra = extras.get(id);
    const sim = id !== 'field' && !extra;
    $('sim-layout').hidden = !sim; document.querySelector('.app-layout').hidden = id !== 'field';
    extras.forEach((x) => { x.el.hidden = x !== extra; });
    document.querySelectorAll('.field-only').forEach((el) => { el.hidden = id !== 'field'; });
    document.querySelectorAll('.module-nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.module === id)));
    if (sim) select(id);
    else if (extra) { if (history.replaceState) history.replaceState(null, '', '#' + id); extra.show(); }
    else if (history.replaceState) history.replaceState(null, '', '#field');
}

function init() {
    const nav = $('module-nav');
    nav.innerHTML = [['field', '3D stress field'], ...SIMS.map((s) => [s.id, s.title])].map(([id, t]) => `<button type="button" data-module="${id}">${t}</button>`).join('');
    nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showModule(b.dataset.module); });
    $('btn-save-baseline').addEventListener('click', () => { store.baseline = { id: store.sim.id, result: JSON.parse(JSON.stringify(store.result)) }; render(); });
    $('btn-clear-baseline').addEventListener('click', () => { store.baseline = null; render(); });
    $('btn-export-csv').addEventListener('click', exportCSV);
    $('btn-export-spec').addEventListener('click', exportSpec);
    $('btn-export-report').addEventListener('click', exportReport);
    $('btn-export-diagram').addEventListener('click', exportDiagram);
    $('btn-reset-sim').addEventListener('click', () => select(store.sim.id));
    new MutationObserver(() => { if (!$('sim-layout').hidden) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const start = location.hash.slice(1);
    showModule(SIMS.some((s) => s.id === start) ? start : 'field');
}
init();
export { SIMS, themed, plotLayout, css, fmt };
