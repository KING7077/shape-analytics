// Half-space (Boussinesq / Cerruti) physics for the 3D stress field. Pure functions, no DOM.
// Conventions: tension positive; local frame has z pointing INTO the body; a load Pz > 0 pushes
// into the body. Stress tensors are returned as [σxx, σyy, σzz, τxy, τxz, τyz].
// `a` is the equivalent-depth offset used to blur the point-load singularity (z_eff = z + a).

const MATERIAL_NU = { 200e9: 0.30, 70e9: 0.33, 30e9: 0.20, 3e9: 0.38, 0.01e9: 0.49 };
export const poissonOf = (E) => MATERIAL_NU[E] ?? 0.3;

// Displacements of a half-space under a point force (Ch. 5 kinematics, Ch. 6 Hooke's law).
export function halfSpaceDisplacement(x, y, z, Px, Py, Pz, a, nu, E) {
    const ze = z + a;
    const r2 = x * x + y * y;
    const R = Math.sqrt(r2 + ze * ze);
    const Rz = R + ze;
    let ux = 0, uy = 0, uz = 0;

    if (Pz !== 0) { // Boussinesq
        const C = (Pz * (1 + nu)) / (2 * Math.PI * E * R);
        uz += C * (2 * (1 - nu) + (ze * ze) / (R * R));
        if (r2 > 0) {
            const r = Math.sqrt(r2);
            // u_r = P(1+ν)/(2πE r) [ r²z/R³ + (1−2ν)(z/R − 1) ]
            const ur = (Pz * (1 + nu)) / (2 * Math.PI * E * r) * ((r2 * ze) / (R * R * R) + (1 - 2 * nu) * (ze / R - 1));
            ux += ur * (x / r);
            uy += ur * (y / r);
        }
    }
    if (Px !== 0) { // Cerruti, force along x
        const C = (Px * (1 + nu)) / (2 * Math.PI * E * R);
        ux += C * (1 + (x * x) / (R * R) + (1 - 2 * nu) * (R / Rz - (x * x) / (Rz * Rz)));
        uy += C * ((x * y) / (R * R) - (1 - 2 * nu) * ((x * y) / (Rz * Rz)));
        uz += C * ((x * ze) / (R * R) + (1 - 2 * nu) * (x / Rz));
    }
    if (Py !== 0) { // Cerruti, force along y
        const C = (Py * (1 + nu)) / (2 * Math.PI * E * R);
        ux += C * ((x * y) / (R * R) - (1 - 2 * nu) * ((x * y) / (Rz * Rz)));
        uy += C * (1 + (y * y) / (R * R) + (1 - 2 * nu) * (R / Rz - (y * y) / (Rz * Rz)));
        uz += C * ((y * ze) / (R * R) + (1 - 2 * nu) * (y / Rz));
    }
    return { ux, uy, uz };
}

// Full Boussinesq stress tensor for a normal point load Pz (all of σr, σθ, σz, τrz — σθ is not zero).
export function boussinesqTensor(x, y, z, Pz, a, nu) {
    const ze = z + a;
    const r2 = x * x + y * y;
    const R = Math.sqrt(r2 + ze * ze);
    const R3 = R * R * R, R5 = R3 * R * R;
    const C = Pz / (2 * Math.PI);
    const sr = C * ((1 - 2 * nu) / (R * (R + ze)) - (3 * r2 * ze) / R5);
    const st = C * (1 - 2 * nu) * (ze / R3 - 1 / (R * (R + ze)));
    const sz = (-3 * Pz * ze * ze * ze) / (2 * Math.PI * R5);
    const trz = (-3 * Pz * ze * ze) / (2 * Math.PI * R5); // times r, split below
    if (r2 < 1e-16) return [(sr + st) / 2, (sr + st) / 2, sz, 0, 0, 0];
    const r = Math.sqrt(r2), c = x / r, s = y / r;
    return [sr * c * c + st * s * s, sr * s * s + st * c * c, sz, (sr - st) * c * s, trz * r * c, trz * r * s];
}

// Cerruti stress for tangential point forces: strain from the displacement gradient (Ch. 5),
// then isotropic Hooke's law (Ch. 6). Exact derivatives of an equilibrium solution.
export function tangentialTensor(x, y, z, Px, Py, a, nu, E) {
    const ze = z + a;
    const h = 1e-4 * Math.sqrt(x * x + y * y + ze * ze);
    const u = (xx, yy, zz) => { const d = halfSpaceDisplacement(xx, yy, zz, Px, Py, 0, a, nu, E); return [d.ux, d.uy, d.uz]; };
    const dx = [u(x + h, y, z), u(x - h, y, z)], dy = [u(x, y + h, z), u(x, y - h, z)], dz = [u(x, y, z + h), u(x, y, z - h)];
    const g = (pair, i) => (pair[0][i] - pair[1][i]) / (2 * h); // ∂u_i/∂(that axis)
    const exx = g(dx, 0), eyy = g(dy, 1), ezz = g(dz, 2);
    const exy = 0.5 * (g(dy, 0) + g(dx, 1)), exz = 0.5 * (g(dz, 0) + g(dx, 2)), eyz = 0.5 * (g(dz, 1) + g(dy, 2));
    const nuL = Math.min(nu, 0.499); // lambda -> infinity as nu -> 0.5 (incompressible); cap keeps the stress finite
    const lam = (E * nuL) / ((1 + nuL) * (1 - 2 * nuL)), G = E / (2 * (1 + nu)), tr = exx + eyy + ezz;
    return [lam * tr + 2 * G * exx, lam * tr + 2 * G * eyy, lam * tr + 2 * G * ezz, 2 * G * exy, 2 * G * exz, 2 * G * eyz];
}

// Principal stresses σ1 ≥ σ2 ≥ σ3 of [σxx, σyy, σzz, τxy, τxz, τyz] (Ch. 4: eigenvalues of the stress matrix).
export function principalStresses(t) {
    const [a, b, c, d, f, e] = t; // d = τxy, f = τxz, e = τyz
    const p = (a + b + c) / 3;
    const sa = a - p, sb = b - p, sc = c - p;
    const j2 = 0.5 * (sa * sa + sb * sb + sc * sc) + d * d + e * e + f * f;
    // Hydrostatic state: the deviator is zero to rounding. The test is relative to the stress scale, so a
    // genuinely tiny stress state (e.g. far from a load) is still resolved.
    const scale2 = a * a + b * b + c * c + 2 * (d * d + e * e + f * f);
    if (j2 <= 1e-24 * scale2) return [p, p, p];
    const j3 = sa * (sb * sc - e * e) - d * (d * sc - e * f) + f * (d * e - sb * f);
    const r = 2 * Math.sqrt(j2 / 3);
    const phi = Math.acos(Math.max(-1, Math.min(1, (3 * Math.sqrt(3) * j3) / (2 * j2 ** 1.5)))) / 3;
    return [0, 1, 2].map((k) => p + r * Math.cos(phi - (2 * Math.PI * k) / 3)).sort((m, n) => n - m);
}

export const vonMises = (t) => Math.sqrt(0.5 * ((t[0] - t[1]) ** 2 + (t[1] - t[2]) ** 2 + (t[2] - t[0]) ** 2 + 6 * (t[3] ** 2 + t[4] ** 2 + t[5] ** 2)));

// Frobenius norm of the infinitesimal strain tensor from Hooke's law: ε = [(1+ν)σ − ν tr(σ) I] / E.
export function strainNorm(t, nu, E) {
    const tr = t[0] + t[1] + t[2];
    const k = (1 + nu) / E, m = (nu * tr) / E;
    const ex = k * t[0] - m, ey = k * t[1] - m, ez = k * t[2] - m;
    return Math.sqrt(ex * ex + ey * ey + ez * ez + 2 * k * k * (t[3] ** 2 + t[4] ** 2 + t[5] ** 2));
}
