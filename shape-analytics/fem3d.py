"""3D finite block under a patch load (FEM stage 3). Part of the FEM tab.

Quarter model of a cuboid (symmetry planes x = 0 and y = 0) built from uniform 8-node bricks, solved matrix-free
with Jacobi-preconditioned conjugate gradients (numpy only). Compared with the half-space solution used by the 3D tab.
Units: SI inside, MPa/kN/m at the API.
"""
import time
from fractions import Fraction

import numpy as np

ROOT3 = np.sqrt(3.0)
MAX_NODES = 9000
# natural coordinates of the 8 corners; Gauss points use the same ordering at +-1/sqrt(3)
_C = np.array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], float)


def _dn(xi, eta, zeta):
    """dN/d(xi, eta, zeta) at one point, shape (3, 8)."""
    a, b, c = _C[:, 0], _C[:, 1], _C[:, 2]
    return np.array([a * (1 + b * eta) * (1 + c * zeta), b * (1 + a * xi) * (1 + c * zeta), c * (1 + a * xi) * (1 + b * eta)]) / 8


def _n(xi, eta, zeta):
    return (1 + _C[:, 0] * xi) * (1 + _C[:, 1] * eta) * (1 + _C[:, 2] * zeta) / 8


def d_matrix3(E, nu):
    k = E / ((1 + nu) * (1 - 2 * nu))
    D = np.zeros((6, 6))
    D[:3, :3] = k * nu; D[range(3), range(3)] = k * (1 - nu)
    for i in (3, 4, 5):
        D[i, i] = k * (1 - 2 * nu) / 2          # order: xx yy zz yz xz xy (engineering shear strains)
    return D


def brick(hx, hz, D):
    """Stiffness matrix of a uniform brick, B matrices at the Gauss points, and the Gauss-to-corner extrapolation."""
    jac = np.array([hx / 2, hx / 2, hz / 2])
    ke = np.zeros((24, 24)); Bg = []
    for g in _C:
        p = g / ROOT3
        dNdx = _dn(*p) / jac[:, None]
        B = np.zeros((6, 24))
        B[0, 0::3] = dNdx[0]; B[1, 1::3] = dNdx[1]; B[2, 2::3] = dNdx[2]
        B[3, 1::3] = dNdx[2]; B[3, 2::3] = dNdx[1]
        B[4, 0::3] = dNdx[2]; B[4, 2::3] = dNdx[0]
        B[5, 0::3] = dNdx[1]; B[5, 1::3] = dNdx[0]
        Bg.append(B); ke += B.T @ D @ B * np.prod(jac)
    M = np.array([_n(*(c * ROOT3)) for c in _C])      # corner c from Gauss point g: N_g evaluated at sqrt(3) * corner
    return ke, np.array(Bg), M


def cg(matvec, b, dinv, free, tol=1e-9, maxit=6000):
    x = np.zeros_like(b); r = np.where(free, b, 0.0); z = dinv * r; p = z.copy(); rz = r @ z; b0 = np.linalg.norm(r) or 1.0
    for it in range(1, maxit + 1):
        Ap = np.where(free, matvec(p), 0.0)
        alpha = rz / (p @ Ap)
        x += alpha * p; r -= alpha * Ap
        if np.linalg.norm(r) < tol * b0:
            return x, it, float(np.linalg.norm(r) / b0)
        z = dinv * r; rn = r @ z; p = z + rn / rz * p; rz = rn
    return x, maxit, float(np.linalg.norm(r) / b0)


# ------------------------------------------------------------------ half-space reference (tension positive)
def newmark_centre(a, z, q):
    """sigma_z (compression) under the centre of a uniform square load of half-width a, depth z (Newmark corner factor x 4)."""
    m = n = a / z
    s = m * m + n * n + 1
    I = (2 * m * n * np.sqrt(s) / (s + m * m * n * n) * (s + 1) / s + np.arctan2(2 * m * n * np.sqrt(s), s - m * m * n * n)) / (4 * np.pi)
    return 4 * q * I


def halfspace(x, y, d, a, q, nu, M=24):
    """Boussinesq stresses by superposing point loads over a square patch [-a, a]^2; returns (sigma_x, sigma_z), tension positive."""
    cell = 2 * a / M
    cs = -a + cell * (np.arange(M) + 0.5)
    sx = np.zeros_like(d, dtype=float); sz = np.zeros_like(sx)
    C = q * cell * cell / (2 * np.pi)
    for xs in cs:
        for ys in cs:
            dx, dy = x - xs, y - ys
            r2 = dx * dx + dy * dy
            R = np.sqrt(r2 + d * d)
            sr = C * ((1 - 2 * nu) / (R * (R + d)) - 3 * r2 * d / R**5)
            st = C * (1 - 2 * nu) * (d / R**3 - 1 / (R * (R + d)))
            c2 = np.where(r2 < 1e-18, 0.5, dx * dx / np.where(r2 < 1e-18, 1, r2))
            sx += sr * c2 + st * (1 - c2)
            sz += -3 * C * d**3 / R**5
    return sx, sz


# ------------------------------------------------------------------ solver
def run_block(r, n, na=None):
    E, nu = r.E_GPa * 1e9, r.nu
    c = r.L / 2                       # plan half-size of the full block
    H = r.H
    q = r.sigma * 1e6
    hx = c / n
    nz = int(np.clip(round(H / hx), 2, 3 * n + 4)); hz = H / nz
    na = na or int(np.clip(round(r.patch * n), 1, n)); a = na * hx
    t0 = time.perf_counter()
    nn1 = n + 1
    idx = lambda i, j, k: (k * nn1 + j) * nn1 + i
    I, J, Kz = np.meshgrid(np.arange(n), np.arange(n), np.arange(nz), indexing='ij')
    I, J, Kz = I.ravel(), J.ravel(), Kz.ravel()
    conn = np.stack([idx(I, J, Kz), idx(I + 1, J, Kz), idx(I + 1, J + 1, Kz), idx(I, J + 1, Kz),
                     idx(I, J, Kz + 1), idx(I + 1, J, Kz + 1), idx(I + 1, J + 1, Kz + 1), idx(I, J + 1, Kz + 1)], 1)
    nnode = nn1 * nn1 * (nz + 1); ndof = 3 * nnode
    dofs = (3 * conn[:, :, None] + np.arange(3)).reshape(len(conn), 24)
    D = d_matrix3(E, nu)
    ke, Bg, Mx = brick(hx, hz, D)

    ii, jj, kk = np.meshgrid(np.arange(nn1), np.arange(nn1), np.arange(nz + 1), indexing='ij')
    ii, jj, kk = ii.ravel(), jj.ravel(), kk.ravel()
    node_id = idx(ii, jj, kk)
    fixed = np.zeros(ndof, bool)
    fixed[3 * node_id[ii == 0]] = True            # symmetry plane x = 0
    fixed[3 * node_id[jj == 0] + 1] = True        # symmetry plane y = 0
    fixed[3 * node_id[kk == 0] + 2] = True        # base
    if r.bottom == 'fixed':
        fixed[3 * node_id[kk == 0]] = True; fixed[3 * node_id[kk == 0] + 1] = True
    free = ~fixed

    f = np.zeros(ndof)
    top = (Kz == nz - 1) & (I < na) & (J < na)
    for corner in (4, 5, 6, 7):
        np.add.at(f, 3 * conn[top, corner] + 2, -q * hx * hx / 4)

    matvec = lambda x: np.bincount(dofs.ravel(), ((x[dofs]) @ ke).ravel(), minlength=ndof)
    diag = np.bincount(dofs.ravel(), np.tile(np.diag(ke), len(conn)), minlength=ndof)
    dinv = np.where(free, 1 / diag, 0.0)
    u, iters, res = cg(matvec, f, dinv, free)
    R = matvec(u) - f

    sg = np.einsum('gsd,ed->egs', Bg, u[dofs]) @ D.T                    # (nel, 8 gauss, 6)
    corners = np.einsum('cg,egs->ecs', Mx, sg)
    acc = np.zeros((nnode, 6)); wt = np.zeros(nnode)
    for s in range(6):
        acc[:, s] = np.bincount(conn.ravel(), corners[:, :, s].ravel(), minlength=nnode)
    wt = np.bincount(conn.ravel(), minlength=nnode).astype(float)
    sig = acc / wt[:, None]                                              # nodal stresses: xx yy zz yz xz xy
    return dict(n=n, nz=nz, hx=hx, hz=hz, a=a, na=na, c=c, H=H, q=q, nu=nu, E=E, u=u.reshape(-1, 3), sig=sig, idx=idx,
                ndof=ndof, nel=len(conn), nfixed=int(fixed.sum()), iters=iters, res=res, R=R, f=f, fixed=fixed, t0=t0,
                ke_sym=float(np.abs(ke - ke.T).max() / np.abs(ke).max()), bottom=r.bottom)


def fields3(sig):
    xx, yy, zz, yz, xz, xy = sig.T
    T = np.zeros((len(sig), 3, 3))
    T[:, 0, 0], T[:, 1, 1], T[:, 2, 2] = xx, yy, zz
    T[:, 1, 2] = T[:, 2, 1] = yz; T[:, 0, 2] = T[:, 2, 0] = xz; T[:, 0, 1] = T[:, 1, 0] = xy
    p = np.linalg.eigvalsh(T)
    return {'szz': zz, 'sxx': xx, 'syy': yy,
            'vm': np.sqrt(0.5 * ((xx - yy)**2 + (yy - zz)**2 + (zz - xx)**2) + 3 * (xy**2 + yz**2 + xz**2)),
            'tau': (p[:, 2] - p[:, 0]) / 2}


LABELS = {'szz': 'Compressive stress −σz (MPa)', 'sxx': 'σx (MPa)', 'syy': 'σy (MPa)', 'vm': 'Von Mises (MPa)', 'tau': 'Max shear τmax (MPa)'}


def block_case(r):
    n = int(np.clip(r.n, 3, 14))
    while (n + 1) ** 2 * (int(np.clip(round(r.H / (r.L / 2 / n)), 2, 3 * n + 4)) + 1) > MAX_NODES and n > 3:
        n -= 1
    s = run_block(r, n)
    nu, a, c, q, hx, hz, nz = s['nu'], s['a'], s['c'], s['q'], s['hx'], s['hz'], s['nz']
    idx, sig = s['idx'], s['sig']
    fl = fields3(sig)

    # ---- view: the y = 0 symmetry section, mirrored about x = 0
    nn1 = n + 1
    sec = np.array([[i * hx, k * hz] for k in range(nz + 1) for i in range(nn1)])
    sid = np.array([idx(i, 0, k) for k in range(nz + 1) for i in range(nn1)])
    pos = np.array([[x, z] for x, z in sec])
    disp = np.array([[s['u'][m, 0], s['u'][m, 2]] for m in sid])
    quads = [[k * nn1 + i, k * nn1 + i + 1, (k + 1) * nn1 + i + 1, (k + 1) * nn1 + i] for k in range(nz) for i in range(n)]
    N = len(pos)
    nodes = np.vstack([pos, pos * [-1, 1]])
    umax = float(np.abs(disp).max()) or 1.0
    scale = 0.06 * max(r.L, r.H) / umax
    nodes_def = np.vstack([pos + scale * disp, (pos + scale * disp * [-1, 1]) * [-1, 1]])
    polys = quads + [[q_ + N for q_ in qd] for qd in quads]
    vals = {}
    for key, v in fl.items():
        nv = (-v[sid] if key == 'szz' else v[sid]) / 1e6      # show compression as positive
        pv = [float(nv[qd].mean()) for qd in quads]
        vals[key] = pv + pv
    view = {'nodes': nodes.tolist(), 'nodes_def': nodes_def.tolist(), 'polys': polys, 'scale': scale, 'unit': 'MPa',
            'values': vals, 'default': 'szz', 'labels': LABELS}

    # ---- centreline sigma_z against the half-space (Newmark) value
    depth = np.array([(nz - k) * hz for k in range(nz + 1)])               # depth below the loaded face
    cl = np.array([-sig[idx(0, 0, k), 2] / q for k in range(nz + 1)])
    dd = np.linspace(0.02 * a, depth[0], 120)
    cl_ex = newmark_centre(a, dd, q) / q
    m_ref = min(2 * s['na'], nz)
    d_ref = m_ref * hz
    fem_ref = -sig[idx(0, 0, nz - m_ref), 2]
    ex_ref = float(newmark_centre(a, d_ref, q))

    # ---- horizontal profile at depth 2a, and the side face
    prof_x = np.arange(nn1) * hx
    prof = np.array([-sig[idx(i, 0, nz - m_ref), 2] / q for i in range(nn1)])
    hx_xs = np.linspace(0, c, 80)
    _, sz_hs = halfspace(hx_xs, np.zeros_like(hx_xs), np.full_like(hx_xs, d_ref), a, q, nu)

    ks = np.arange(0, nz)                                                   # exclude the loaded surface row
    side_d = (nz - ks) * hz
    side_fem = np.array([sig[idx(n, 0, k), 0] for k in ks]) / q
    side_hs, _ = halfspace(np.full(len(ks), c), np.zeros(len(ks)), side_d, a, q, nu)

    # ---- mesh refinement of the centreline stress at depth 2a
    conv = []                                    # keep the patch the same physical size: levels are multiples of the reduced na/n
    base = Fraction(s['na'], n).denominator
    for lv in range(base, n + 1, base):
        sl = s if lv == n else run_block(r, lv, na=lv // base * Fraction(s['na'], n).numerator)
        conv.append((sl['ndof'], float(-sl['u'][sl['idx'](0, 0, sl['nz']), 2]) * 1e3))

    R, f, fixed = s['R'], s['f'], s['fixed']
    zr = np.arange(2, s['ndof'], 3)
    charts = [
        {'id': 'cl', 'title': 'σz under the centre of the load against depth', 'x': 'depth below the loaded face (m)', 'y': '−σz / q', 'primary': True, 'traces': [
            {'name': 'Half-space (exact, Newmark)', 'x': dd.tolist(), 'y': cl_ex.tolist(), 'kind': 'ref'},
            {'name': 'FEM finite block', 'x': depth.tolist(), 'y': cl.tolist(), 'kind': 'fem', 'markers': True}]},
        {'id': 'prof', 'title': f'σz across the block at depth {d_ref:.2f} m (section y = 0)', 'x': 'x (m)', 'y': '−σz / q', 'traces': [
            {'name': 'Half-space (point-load sum)', 'x': hx_xs.tolist(), 'y': (-sz_hs / q).tolist(), 'kind': 'ref'},
            {'name': 'FEM finite block', 'x': prof_x.tolist(), 'y': prof.tolist(), 'kind': 'fem', 'markers': True}]},
        {'id': 'side', 'title': 'σx on the free side face x = L/2 (must be zero)', 'x': 'depth below the loaded face (m)', 'y': 'σx / q', 'traces': [
            {'name': 'Half-space solution', 'x': side_d.tolist(), 'y': (side_hs / q).tolist(), 'kind': 'ref'},
            {'name': 'FEM finite block', 'x': side_d.tolist(), 'y': side_fem.tolist(), 'kind': 'fem', 'markers': True}]},
        {'id': 'conv', 'title': 'Mesh refinement: settlement of the load centre', 'x': 'degrees of freedom', 'y': 'settlement (mm)', 'logx': True, 'traces': [
            {'name': 'FEM', 'x': [c_[0] for c_ in conv], 'y': [c_[1] for c_ in conv], 'kind': 'fem', 'markers': True}]},
    ]
    side_peak_fem, side_peak_hs = float(np.abs(side_fem).max() * q / 1e6), float(np.abs(side_hs).max() / 1e6)
    return {
        'view': view, 'charts': charts,
        'compare': [
            {'label': f'σz under the load centre, depth {d_ref:.2f} m', 'fem': fem_ref / 1e6, 'ref': ex_ref / 1e6, 'unit': 'MPa', 'info': True},
            {'label': 'Settlement of the load centre', 'fem': float(-s['u'][idx(0, 0, nz), 2]) * 1e3, 'ref': None, 'unit': 'mm', 'info': True},
            {'label': 'Peak |σx| on the free side face', 'fem': side_peak_fem, 'ref': side_peak_hs, 'unit': 'MPa', 'info': True},
            {'label': 'Support reaction (vertical, quarter model)', 'fem': float(R[zr][fixed[zr]].sum()) / 1e3, 'ref': float(-f[zr].sum()) / 1e3, 'unit': 'kN'},
        ],
        'diag': {'n_dof': s['ndof'], 'n_elem': s['nel'], 'n_fixed': s['nfixed'], 'sym_err': s['ke_sym'],
                 'zero_fraction': 1 - 81 / s['ndof'], 'reaction_sum': float(R[zr][fixed[zr]].sum()), 'load_sum': float(f[zr].sum()),
                 'solve_ms': float((time.perf_counter() - s['t0']) * 1000), 'cg_iters': s['iters'], 'cg_residual': s['res']},
        'kmatrix': None,
        'note': f'Quarter of the block is modelled using the symmetry planes; the patch is {2 * a:.2f} m wide (a whole number of elements). Stress at the loaded surface is the least accurate value, because it is extrapolated from points inside the bricks. The "Peak |σx|" row compares two different models on purpose: the half-space solution leaves a traction on the side face, the finite block does not.',
    }
