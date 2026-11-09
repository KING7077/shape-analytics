"""Finite-element solver for the FEM tab (numpy only).

Self-contained: server.py mounts `router`; nothing else imports this module.
Cases: bar and beam (1D elements), cantilever and plate-with-hole (2D plane stress, CST or Q4), and a 3D block (fem3d.py).
Internal units are SI (m, N, Pa); requests and responses use engineering units (mm, kN, MPa).
"""
import time

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/fem")

MAX_DOF = 3600          # dense solve limit
ROOT3 = np.sqrt(3.0)


class FemRequest(BaseModel):
    case: str                   # bar | beam | cantilever | hole
    element: str = 'q4'         # q4 | cst  (2D cases only)
    n: int = 8                  # mesh density, meaning depends on the case
    E_GPa: float = 200.0
    nu: float = 0.3
    L: float = 1.0              # m
    b: float = 50.0             # mm  (beam/cantilever width; bar uses A0 = b*h)
    h: float = 100.0            # mm  (section depth)
    P: float = 10.0             # kN  (end load)
    w: float = 10.0             # kN/m (beam UDL)
    load_type: str = 'tip'      # beam: tip | udl
    taper: float = 0.4          # bar: A(L)/A(0)
    ratio: float = 8.0          # hole: plate half-width / hole radius
    sigma: float = 100.0        # hole: remote stress; block: surface pressure, MPa
    H: float = 2.0              # block: depth, m (L is the plan side)
    patch: float = 0.4          # block: patch half-width / block half-width
    bottom: str = 'roller'      # block: roller | fixed


# ------------------------------------------------------------------ shared linear algebra
def solve_system(K, f, fixed):
    """Partition out the constrained DOFs (supports) and solve K_ff u_f = f_f; also return reactions."""
    n = K.shape[0]
    free = np.setdiff1d(np.arange(n), fixed)
    u = np.zeros(n)
    u[free] = np.linalg.solve(K[np.ix_(free, free)], f[free])
    return u, K @ u - f


def diagnostics(K, f, fixed, R, t0, n_elem, stride=1):
    n = K.shape[0]
    tr = np.arange(0, n, stride)               # translational DOFs (beam: every other DOF is a rotation)
    trf = np.intersect1d(tr, fixed)
    free = np.setdiff1d(np.arange(n), fixed)
    return {
        'n_dof': int(n), 'n_elem': int(n_elem), 'n_fixed': int(len(fixed)),
        'sym_err': float(np.abs(K - K.T).max() / max(np.abs(K).max(), 1e-300)),
        'zero_fraction': float((K == 0).mean()),
        'reaction_sum': float(R[trf].sum()), 'load_sum': float(f[tr].sum()),
        'solve_ms': float((time.perf_counter() - t0) * 1000),
    }


def small_matrix(K, dof_labels):
    return {'values': K.tolist(), 'labels': dof_labels} if K.shape[0] <= 14 else None


# ------------------------------------------------------------------ 1D: tapered bar
def run_bar(r, n):
    E, L = r.E_GPa * 1e9, r.L
    A0 = r.b * r.h * 1e-6
    A1 = A0 * r.taper
    P = r.P * 1e3
    hx = L / n
    xs = np.linspace(0, L, n + 1)
    A = lambda x: A0 + (A1 - A0) * x / L
    t0 = time.perf_counter()
    K = np.zeros((n + 1, n + 1))
    for e in range(n):
        ke = E * A(0.5 * (xs[e] + xs[e + 1])) / hx * np.array([[1, -1], [-1, 1]])
        K[e:e + 2, e:e + 2] += ke
    f = np.zeros(n + 1); f[-1] = P
    fixed = np.array([0])
    u, R = solve_system(K, f, fixed)
    sig = E * np.diff(u) / hx                                   # constant per element
    m = (A1 - A0) / L
    exact_u = (lambda x: P * x / (E * A0)) if abs(m) < 1e-12 * A0 else (lambda x: P / (E * m) * np.log(A(x) / A0))
    xf = np.linspace(0, L, 200)
    step_x = np.repeat(xs, 2)[1:-1]; step_y = np.repeat(sig, 2) / 1e6
    return {
        'ratio_tip': float(u[-1] / exact_u(L)), 'u_tip': float(u[-1]), 'exact_tip': float(exact_u(L)),
        'xs': xs, 'u': u, 'sig': sig, 'xf': xf, 'exact_u': exact_u, 'A': A, 'step_x': step_x, 'step_y': step_y,
        'K': K, 'f': f, 'fixed': fixed, 'R': R, 't0': t0, 'n_elem': n, 'A0': A0, 'P': P, 'L': L,
    }


def bar_case(r):
    n = int(np.clip(r.n, 1, 200))
    s = run_bar(r, n)
    L, P, A, xs = s['L'], s['P'], s['A'], s['xs']
    levels = sorted(set([1, 2, 4, 8, 16, 32, n]))
    conv = [(l + 1, run_bar(r, l)['ratio_tip']) for l in levels]

    # view: tapered strip, each element coloured by its (constant) stress
    vh = 0.14 * L
    amax = max(A(0), A(L))
    top = lambda x: vh * A(x) / amax / 2
    nodes = [[x, s_ * top(x)] for x in xs for s_ in (-1, 1)]    # 2i = bottom, 2i+1 = top
    polys = [[2 * e, 2 * e + 2, 2 * e + 3, 2 * e + 1] for e in range(n)]
    umax = float(np.abs(s['u']).max()) or 1.0
    scale = 0.08 * L / umax
    nodes_def = [[x + scale * s['u'][i // 2], y] for i, (x, y) in enumerate(nodes)]
    sig_mpa = s['sig'] / 1e6
    exact_sig = lambda x: P / A(x) / 1e6

    charts = [
        {'id': 'u', 'title': 'Axial displacement u(x)', 'x': 'x (m)', 'y': 'u (mm)', 'primary': True, 'traces': [
            {'name': 'Exact', 'x': s['xf'].tolist(), 'y': (s['exact_u'](s['xf']) * 1e3).tolist(), 'kind': 'ref'},
            {'name': 'FEM (nodes)', 'x': xs.tolist(), 'y': (s['u'] * 1e3).tolist(), 'kind': 'fem'}]},
        {'id': 'sig', 'title': 'Axial stress σ(x)', 'x': 'x (m)', 'y': 'σ (MPa)', 'traces': [
            {'name': 'Exact P/A(x)', 'x': s['xf'].tolist(), 'y': exact_sig(s['xf']).tolist(), 'kind': 'ref'},
            {'name': 'FEM (constant per element)', 'x': s['step_x'].tolist(), 'y': s['step_y'].tolist(), 'kind': 'fem'}]},
        {'id': 'conv', 'title': 'Mesh refinement: tip displacement', 'x': 'degrees of freedom', 'y': 'FEM / exact', 'logx': True, 'traces': [
            {'name': 'FEM', 'x': [c[0] for c in conv], 'y': [c[1] for c in conv], 'kind': 'fem', 'markers': True},
            {'name': 'Exact = 1', 'x': [conv[0][0], conv[-1][0]], 'y': [1, 1], 'kind': 'ref'}]},
    ]
    return {
        'view': {'nodes': nodes, 'nodes_def': nodes_def, 'polys': polys, 'scale': scale, 'unit': 'MPa',
                 'values': {'sxx': sig_mpa.tolist()}, 'default': 'sxx', 'labels': {'sxx': 'Axial stress σ (MPa)'}},
        'charts': charts,
        'compare': [
            {'label': 'Tip displacement', 'fem': s['u_tip'] * 1e3, 'ref': s['exact_tip'] * 1e3, 'unit': 'mm'},
            {'label': 'Root stress', 'fem': float(sig_mpa[0]), 'ref': float(exact_sig(0.5 * L / n)), 'unit': 'MPa'},
            {'label': 'Support reaction', 'fem': -float(s['R'][0]) / 1e3, 'ref': P / 1e3, 'unit': 'kN'},
        ],
        'diag': diagnostics(s['K'], s['f'], s['fixed'], s['R'], s['t0'], n),
        'kmatrix': small_matrix(s['K'], [f'u{i}' for i in range(n + 1)]),
    }


# ------------------------------------------------------------------ 1D: Euler-Bernoulli beam (Hermite)
def hermite(xi, h, v1, t1, v2, t2):
    N1 = 1 - 3 * xi**2 + 2 * xi**3; N2 = xi - 2 * xi**2 + xi**3
    N3 = 3 * xi**2 - 2 * xi**3;     N4 = -xi**2 + xi**3
    v = N1 * v1 + N2 * h * t1 + N3 * v2 + N4 * h * t2
    c = ((-6 + 12 * xi) * v1 + h * (-4 + 6 * xi) * t1 + (6 - 12 * xi) * v2 + h * (-2 + 6 * xi) * t2) / h**2
    return v, c


def run_beam(r, n):
    E, L = r.E_GPa * 1e9, r.L
    I = r.b * 1e-3 * (r.h * 1e-3) ** 3 / 12
    EI = E * I
    P, w = r.P * 1e3, r.w * 1e3
    hx = L / n
    t0 = time.perf_counter()
    K = np.zeros((2 * n + 2, 2 * n + 2)); f = np.zeros(2 * n + 2)
    ke = EI / hx**3 * np.array([[12, 6 * hx, -12, 6 * hx], [6 * hx, 4 * hx**2, -6 * hx, 2 * hx**2],
                                [-12, -6 * hx, 12, -6 * hx], [6 * hx, 2 * hx**2, -6 * hx, 4 * hx**2]])
    for e in range(n):
        K[2 * e:2 * e + 4, 2 * e:2 * e + 4] += ke
        if r.load_type == 'udl':      # consistent nodal loads for a uniform load w over the element
            f[2 * e:2 * e + 4] += [w * hx / 2, w * hx**2 / 12, w * hx / 2, -w * hx**2 / 12]
    if r.load_type != 'udl':
        f[2 * n] += P
    fixed = np.array([0, 1])
    u, R = solve_system(K, f, fixed)
    if r.load_type == 'udl':
        ex_v = lambda x: w * x**2 * (6 * L**2 - 4 * L * x + x**2) / (24 * EI)
        ex_M = lambda x: w * (L - x) ** 2 / 2
    else:
        ex_v = lambda x: P * x**2 * (3 * L - x) / (6 * EI)
        ex_M = lambda x: P * (L - x)
    return {'u': u, 'K': K, 'f': f, 'fixed': fixed, 'R': R, 't0': t0, 'EI': EI, 'I': I, 'hx': hx, 'n': n,
            'ex_v': ex_v, 'ex_M': ex_M, 'L': L}


def sample_beam(s, per=8):
    xs, vs, Ms = [], [], []
    for e in range(s['n']):
        v1, t1, v2, t2 = s['u'][2 * e:2 * e + 4]
        xi = np.linspace(0, 1, per + 1)
        v, c = hermite(xi, s['hx'], v1, t1, v2, t2)
        xs.append(e * s['hx'] + xi * s['hx']); vs.append(v); Ms.append(s['EI'] * c)
    return xs, vs, Ms


def beam_case(r):
    n = int(np.clip(r.n, 1, 120))
    s = run_beam(r, n)
    L, EI = s['L'], s['EI']
    xs, vs, Ms = sample_beam(s)
    X, V, M = np.concatenate(xs), np.concatenate(vs), np.concatenate(Ms)
    xf = np.linspace(0, L, 200)

    levels = sorted(set([1, 2, 4, 8, 16, n]))
    conv_v, conv_M = [], []
    for l in levels:
        sl = run_beam(r, l)
        conv_v.append((2 * l + 2, sl['u'][-2] / sl['ex_v'](L)))
        _, _, Ml = sample_beam(sl)
        conv_M.append((2 * l + 2, Ml[0][0] / sl['ex_M'](0)))

    # view: sub-segments along the deflected centreline, coloured by FEM bending stress at the extreme fibre
    vh = min(r.h * 1e-3, 0.12 * L)
    umax = float(np.abs(V).max()) or 1.0
    scale = 0.10 * L / umax
    ys = -scale * V
    sig = (0.5 * (M[:-1] + M[1:]) * (r.h * 1e-3 / 2) / s['I']) / 1e6
    keep = np.array([i for i in range(len(X) - 1) if X[i + 1] > X[i] + 1e-12])
    nodes, nodes_def, polys, vals = [], [], [], []
    for k, i in enumerate(keep):
        for j in (i, i + 1):
            nodes.append([float(X[j]), -vh / 2]); nodes.append([float(X[j]), vh / 2])
            nodes_def.append([float(X[j]), float(ys[j] - vh / 2)]); nodes_def.append([float(X[j]), float(ys[j] + vh / 2)])
        b = 4 * k
        polys.append([b, b + 2, b + 3, b + 1]); vals.append(float(sig[i]))

    tip_fem, tip_ex = float(s['u'][-2]), float(s['ex_v'](L))
    charts = [
        {'id': 'v', 'title': 'Deflection v(x), downward', 'x': 'x (m)', 'y': 'v (mm)', 'primary': True, 'traces': [
            {'name': 'Exact', 'x': xf.tolist(), 'y': (s['ex_v'](xf) * 1e3).tolist(), 'kind': 'ref'},
            {'name': 'FEM (Hermite interpolation)', 'x': X.tolist(), 'y': (V * 1e3).tolist(), 'kind': 'fem'},
            {'name': 'FEM nodes', 'x': (np.arange(n + 1) * s['hx']).tolist(), 'y': (s['u'][0::2] * 1e3).tolist(), 'kind': 'fem', 'markers': True, 'noline': True}]},
        {'id': 'M', 'title': 'Bending moment M(x)', 'x': 'x (m)', 'y': 'M (kN·m)', 'traces': [
            {'name': 'Exact', 'x': xf.tolist(), 'y': (s['ex_M'](xf) / 1e3).tolist(), 'kind': 'ref'},
            {'name': 'FEM (EI·v″, linear per element)', 'x': X.tolist(), 'y': (M / 1e3).tolist(), 'kind': 'fem'}]},
        {'id': 'conv', 'title': 'Mesh refinement', 'x': 'degrees of freedom', 'y': 'FEM / exact', 'logx': True, 'traces': [
            {'name': 'Tip deflection', 'x': [c[0] for c in conv_v], 'y': [c[1] for c in conv_v], 'kind': 'fem', 'markers': True},
            {'name': 'Root moment', 'x': [c[0] for c in conv_M], 'y': [c[1] for c in conv_M], 'kind': 'alt', 'markers': True},
            {'name': 'Exact = 1', 'x': [conv_v[0][0], conv_v[-1][0]], 'y': [1, 1], 'kind': 'ref'}]},
    ]
    root_fem = float(M[0])
    return {
        'view': {'nodes': nodes, 'nodes_def': nodes_def, 'polys': polys, 'scale': scale, 'unit': 'MPa',
                 'values': {'sxx': vals}, 'default': 'sxx', 'labels': {'sxx': 'Extreme-fibre bending stress (MPa)'}},
        'charts': charts,
        'compare': [
            {'label': 'Tip deflection', 'fem': tip_fem * 1e3, 'ref': tip_ex * 1e3, 'unit': 'mm'},
            {'label': 'Root moment', 'fem': root_fem / 1e3, 'ref': float(s['ex_M'](0)) / 1e3, 'unit': 'kN·m'},
            {'label': 'Root shear reaction', 'fem': float(-s['R'][0]) / 1e3,
             'ref': r.w * L if r.load_type == 'udl' else r.P, 'unit': 'kN'},
        ],
        'diag': diagnostics(s['K'], s['f'], s['fixed'], s['R'], s['t0'], n, stride=2),
        'kmatrix': small_matrix(s['K'], [x for i in range(n + 1) for x in (f'v{i}', f'θ{i}')]),
    }


# ------------------------------------------------------------------ 2D plane-stress elements
def d_matrix(E, nu):
    return E / (1 - nu**2) * np.array([[1, nu, 0], [nu, 1, 0], [0, 0, (1 - nu) / 2]])


def q4_B(xy, xi, eta):
    dN = 0.25 * np.array([[-(1 - eta), (1 - eta), (1 + eta), -(1 + eta)],
                          [-(1 - xi), -(1 + xi), (1 + xi), (1 - xi)]])
    J = dN @ xy
    dNdx = np.linalg.solve(J, dN)
    B = np.zeros((3, 8))
    B[0, 0::2] = dNdx[0]; B[1, 1::2] = dNdx[1]
    B[2, 0::2] = dNdx[1]; B[2, 1::2] = dNdx[0]
    return B, np.linalg.det(J)


def cst_B(xy):
    (x1, y1), (x2, y2), (x3, y3) = xy
    A = 0.5 * ((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
    b = np.array([y2 - y3, y3 - y1, y1 - y2]); c = np.array([x3 - x2, x1 - x3, x2 - x1])
    B = np.zeros((3, 6))
    B[0, 0::2] = b; B[1, 1::2] = c; B[2, 0::2] = c; B[2, 1::2] = b
    return B / (2 * A), A


# extrapolation matrix: Gauss-point stresses -> element corner stresses (bilinear, Gauss points at +-1/sqrt3)
_SGN = np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]], float)
_EXTRAP = np.array([[0.25 * (1 + gs[0] * c[0] * ROOT3) * (1 + gs[1] * c[1] * ROOT3) for gs in _SGN] for c in _SGN])


def fe2d(nodes, quads, elem, E, nu, t, fixed, f, t0):
    """Plane-stress FE solve. Returns displacements, nodal-averaged stresses and the element connectivity used."""
    nn = len(nodes)
    D = d_matrix(E, nu)
    if elem == 'cst':
        conn = np.array([c for q in quads for c in ([q[0], q[1], q[2]], [q[0], q[2], q[3]])])
    else:
        conn = np.array(quads)
    K = np.zeros((2 * nn, 2 * nn))
    cache = []
    for el in conn:
        xy = nodes[el]
        dofs = np.stack([2 * el, 2 * el + 1], 1).ravel()
        if elem == 'cst':
            B, A = cst_B(xy)
            ke = t * A * B.T @ D @ B
            cache.append((dofs, B, A))
        else:
            ke = np.zeros((8, 8))
            for gx in (-1, 1):
                for gy in (-1, 1):
                    B, dj = q4_B(xy, gx / ROOT3, gy / ROOT3)
                    ke += t * dj * B.T @ D @ B
            cache.append((dofs, xy, None))
        K[np.ix_(dofs, dofs)] += ke
    u, R = solve_system(K, f, fixed)

    acc = np.zeros((nn, 3)); wt = np.zeros(nn); el_stress = np.zeros((len(conn), 3))
    for k, el in enumerate(conn):
        ue = u[cache[k][0]]
        if elem == 'cst':
            B, A = cache[k][1], cache[k][2]
            s = D @ B @ ue
            corners = np.tile(s, (3, 1)); w = A
        else:
            xy = cache[k][1]
            sg = np.array([D @ q4_B(xy, gx / ROOT3, gy / ROOT3)[0] @ ue for gx, gy in _SGN])
            corners = _EXTRAP @ sg; w = 1.0
        acc[el] += w * corners; wt[el] += w; el_stress[k] = corners.mean(0)
    return {'u': u.reshape(-1, 2), 'sig': acc / wt[:, None], 'el_sig': el_stress, 'conn': conn, 'K': K, 'f': f,
            'fixed': fixed, 'R': R, 't0': t0}


def stress_fields(sig):
    sx, sy, tx = sig[:, 0], sig[:, 1], sig[:, 2]
    c, rad = 0.5 * (sx + sy), np.hypot(0.5 * (sx - sy), tx)
    s1, s2 = c + rad, c - rad
    return {'sxx': sx, 'syy': sy, 'txy': tx,
            'vm': np.sqrt(sx**2 - sx * sy + sy**2 + 3 * tx**2),
            'tau': np.maximum.reduce([np.abs(s1 - s2) / 2, np.abs(s1) / 2, np.abs(s2) / 2])}


FIELD_LABELS = {'sxx': 'σx (MPa)', 'syy': 'σy (MPa)', 'txy': 'τxy (MPa)', 'vm': 'Von Mises (MPa)', 'tau': 'Max shear τmax (MPa)'}


def view2d(nodes, sol, default):
    fl = {k: v / 1e6 for k, v in stress_fields(sol['sig']).items()}
    conn = sol['conn']
    vals = {k: v[conn].mean(1).tolist() for k, v in fl.items()}
    ext = float(np.ptp(nodes, axis=0).max())
    umax = float(np.abs(sol['u']).max()) or 1.0
    scale = 0.06 * ext / umax
    return {'nodes': nodes.tolist(), 'nodes_def': (nodes + scale * sol['u']).tolist(), 'polys': conn.tolist(), 'scale': scale,
            'unit': 'MPa', 'values': vals, 'default': default, 'labels': FIELD_LABELS}, fl


# ------------------------------------------------------------------ 2D: cantilever (Ch. 8-9 check)
def cantilever_mesh(L, h, ny):
    nx = int(round(ny * L / h)); nx += nx % 2                    # even, so a node column sits at x = L/2
    nx = max(nx, 2)
    xs, ys = np.linspace(0, L, nx + 1), np.linspace(-h / 2, h / 2, ny + 1)
    nodes = np.array([[x, y] for y in ys for x in xs])
    idx = lambda i, j: j * (nx + 1) + i
    quads = [[idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)] for j in range(ny) for i in range(nx)]
    return nodes, quads, nx, ny, idx


def run_cantilever(r, ny, elem):
    ny += ny % 2
    E, nu, L, h, t, P = r.E_GPa * 1e9, r.nu, r.L, r.h * 1e-3, r.b * 1e-3, r.P * 1e3
    t0 = time.perf_counter()
    nodes, quads, nx, ny, idx = cantilever_mesh(L, h, ny)
    f = np.zeros(2 * len(nodes))
    for j in range(ny + 1):                                       # uniform end shear, downward
        f[2 * idx(nx, j) + 1] -= P / ny * (0.5 if j in (0, ny) else 1.0)
    fixed = np.array([2 * idx(0, j) + d for j in range(ny + 1) for d in (0, 1)])
    sol = fe2d(nodes, quads, elem, E, nu, t, fixed, f, t0)
    sol.update(nodes=nodes, quads=quads, nx=nx, ny=ny, idx=idx)
    sol['tip'] = -sol['u'][idx(nx, ny // 2), 1]
    return sol


def cantilever_case(r):
    ny = int(np.clip(r.n, 2, 40)); ny += ny % 2
    while (int(round(ny * r.L / (r.h * 1e-3))) + 2) * (ny + 1) * 2 > MAX_DOF and ny > 2:
        ny -= 2
    E, nu, L, h, t, P = r.E_GPa * 1e9, r.nu, r.L, r.h * 1e-3, r.b * 1e-3, r.P * 1e3
    I, A = t * h**3 / 12, t * h
    G = E / (2 * (1 + nu))
    kappa = 10 * (1 + nu) / (12 + 11 * nu)                        # Cowper shear coefficient, rectangle
    eb = P * L**3 / (3 * E * I)
    tim = eb + P * L / (kappa * G * A)

    sol = run_cantilever(r, ny, r.element)
    levels = [lv for lv in (2, 4, 6, 8, 12) if (int(round(lv * L / h)) + 2) * (lv + 1) * 2 <= MAX_DOF]
    conv = {el: [] for el in ('cst', 'q4')}
    for el in conv:
        for lv in levels:
            sl = run_cantilever(r, lv, el)
            conv[el].append((2 * len(sl['nodes']), sl['tip'] / eb))

    nodes, nx, idx = sol['nodes'], sol['nx'], sol['idx']
    view, fl = view2d(nodes, sol, 'sxx')
    jj = list(range(sol['ny'] + 1))
    ycol = [nodes[idx(nx // 2, j), 1] for j in jj]
    sx_mid = [fl['sxx'][idx(nx // 2, j)] for j in jj]
    xm = L / 2
    M = P * (L - xm)
    yf = np.linspace(-h / 2, h / 2, 50)
    charts = [
        {'id': 'sec', 'title': f'σx through the depth at x = L/2', 'x': 'y (mm)', 'y': 'σx (MPa)', 'primary': True, 'traces': [
            {'name': 'Beam theory My/I', 'x': (yf * 1e3).tolist(), 'y': (M * yf / I / 1e6).tolist(), 'kind': 'ref'},
            {'name': f'FEM ({r.element.upper()}, nodal average)', 'x': [y * 1e3 for y in ycol], 'y': sx_mid, 'kind': 'fem', 'markers': True}]},
        {'id': 'conv', 'title': 'Mesh refinement: tip deflection', 'x': 'degrees of freedom', 'y': 'FEM / Euler–Bernoulli', 'logx': True, 'traces': [
            {'name': 'Q4', 'x': [c[0] for c in conv['q4']], 'y': [c[1] for c in conv['q4']], 'kind': 'fem', 'markers': True},
            {'name': 'CST', 'x': [c[0] for c in conv['cst']], 'y': [c[1] for c in conv['cst']], 'kind': 'alt', 'markers': True},
            {'name': 'Timoshenko / EB', 'x': [conv['q4'][0][0], conv['q4'][-1][0]], 'y': [tim / eb] * 2, 'kind': 'ref'}]},
    ]
    return {
        'view': view, 'charts': charts,
        'compare': [
            {'label': 'Tip deflection vs Euler–Bernoulli', 'fem': sol['tip'] * 1e3, 'ref': eb * 1e3, 'unit': 'mm'},
            {'label': 'Tip deflection vs Timoshenko', 'fem': sol['tip'] * 1e3, 'ref': tim * 1e3, 'unit': 'mm'},
            {'label': 'σx at x = L/2, top fibre', 'fem': float(sx_mid[-1]), 'ref': float(M * (h / 2) / I / 1e6), 'unit': 'MPa'},
            {'label': 'Support reaction (vertical)', 'fem': float(sum(sol['R'][2 * idx(0, j) + 1] for j in jj)) / 1e3, 'ref': P / 1e3, 'unit': 'kN'},
        ],
        'diag': diagnostics(sol['K'], sol['f'], sol['fixed'], sol['R'], sol['t0'], len(sol['conn'])),
        'kmatrix': None,
    }


# ------------------------------------------------------------------ 2D: plate with a circular hole (Kirsch)
def hole_mesh(a, W, n_theta, n_r, grade=1.12):
    th = np.linspace(0, np.pi / 2, n_theta + 1)
    s = (grade ** np.arange(n_r + 1) - 1) / (grade**n_r - 1)
    rout = W / np.maximum(np.cos(th), np.sin(th))
    nodes = np.array([[(a + (rout[j] - a) * s[i]) * np.cos(th[j]), (a + (rout[j] - a) * s[i]) * np.sin(th[j])]
                      for i in range(n_r + 1) for j in range(n_theta + 1)])
    idx = lambda i, j: i * (n_theta + 1) + j
    quads = [[idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)] for i in range(n_r) for j in range(n_theta)]
    return nodes, quads, idx, th


def run_hole(r, n, elem):
    nth, nr = 2 * n, int(round(1.5 * n))
    E, nu = r.E_GPa * 1e9, r.nu
    a = 0.01; W = r.ratio * a; sig_inf = r.sigma * 1e6; t = 1e-3
    t0 = time.perf_counter()
    nodes, quads, idx, th = hole_mesh(a, W, nth, nr)
    f = np.zeros(2 * len(nodes))
    right = [j for j in range(nth + 1) if th[j] <= np.pi / 4 + 1e-12]    # x = W edge carries the remote stress
    for j0, j1 in zip(right[:-1], right[1:]):
        seg = abs(nodes[idx(nr, j1), 1] - nodes[idx(nr, j0), 1])
        for j in (j0, j1):
            f[2 * idx(nr, j)] += sig_inf * t * seg / 2
    fixed = np.array([2 * idx(i, nth) for i in range(nr + 1)] + [2 * idx(i, 0) + 1 for i in range(nr + 1)])   # symmetry planes
    sol = fe2d(nodes, quads, elem, E, nu, t, fixed, f, t0)
    sol.update(nodes=nodes, idx=idx, nth=nth, nr=nr, a=a, sig_inf=sig_inf, W=W)
    sol['kt'] = float(sol['sig'][idx(0, nth), 0] / sig_inf)
    return sol


def hole_case(r):
    n = int(np.clip(r.n, 2, 20))
    while 2 * (2 * n + 1) * (int(round(1.5 * n)) + 1) > MAX_DOF and n > 2:
        n -= 1
    sol = run_hole(r, n, r.element)
    levels = [lv for lv in (2, 4, 6, 8, 12, 16) if 2 * (2 * lv + 1) * (int(round(1.5 * lv)) + 1) <= MAX_DOF]
    conv = {el: [] for el in ('cst', 'q4')}
    for el in conv:
        for lv in levels:
            sl = run_hole(r, lv, el)
            conv[el].append((2 * len(sl['nodes']), sl['kt']))

    nodes, idx, nth, nr, a, sig_inf = sol['nodes'], sol['idx'], sol['nth'], sol['nr'], sol['a'], sol['sig_inf']
    view, fl = view2d(nodes, sol, 'sxx')
    ys = np.array([nodes[idx(i, nth), 1] for i in range(nr + 1)])
    sxx_line = np.array([fl['sxx'][idx(i, nth)] for i in range(nr + 1)])
    yf = np.linspace(a, sol['W'], 200)
    kirsch = sig_inf * (1 + a**2 / (2 * yf**2) + 3 * a**4 / (2 * yf**4)) / 1e6
    charts = [
        {'id': 'line', 'title': 'σx along the section x = 0 (through the hole)', 'x': 'y / a', 'y': 'σx / σ∞', 'primary': True, 'traces': [
            {'name': 'Kirsch (infinite plate)', 'x': (yf / a).tolist(), 'y': (kirsch * 1e6 / sig_inf).tolist(), 'kind': 'ref'},
            {'name': f'FEM ({r.element.upper()}, nodal average)', 'x': (ys / a).tolist(), 'y': (sxx_line * 1e6 / sig_inf).tolist(), 'kind': 'fem', 'markers': True}]},
        {'id': 'conv', 'title': 'Mesh refinement: stress concentration factor', 'x': 'degrees of freedom', 'y': 'Kt = σmax / σ∞', 'logx': True, 'traces': [
            {'name': 'Q4', 'x': [c[0] for c in conv['q4']], 'y': [c[1] for c in conv['q4']], 'kind': 'fem', 'markers': True},
            {'name': 'CST', 'x': [c[0] for c in conv['cst']], 'y': [c[1] for c in conv['cst']], 'kind': 'alt', 'markers': True},
            {'name': 'Kirsch Kt = 3', 'x': [conv['q4'][0][0], conv['q4'][-1][0]], 'y': [3, 3], 'kind': 'ref'}]},
    ]
    R = sol['R']
    return {
        'view': view, 'charts': charts,
        'compare': [
            {'label': 'Stress concentration Kt at the hole', 'fem': sol['kt'], 'ref': 3.0, 'unit': ''},
            {'label': 'Peak σx at the hole edge', 'fem': sol['kt'] * sig_inf / 1e6, 'ref': 3 * sig_inf / 1e6, 'unit': 'MPa'},
            {'label': 'Reaction on the x = 0 plane', 'fem': float(-sum(R[2 * idx(i, nth)] for i in range(nr + 1))) / 1e3,
             'ref': float(sig_inf * 1e-3 * sol['W'] / 1e3), 'unit': 'kN'},
        ],
        'diag': diagnostics(sol['K'], sol['f'], sol['fixed'], sol['R'], sol['t0'], len(sol['conn'])),
        'kmatrix': None,
        'note': 'The exact Kt of a finite plate is a little above the infinite-plate value of 3, so a small excess over 3 is expected.',
    }


def block_case(r):
    from fem3d import block_case as run   # imported on demand so the 2D cases work without it
    return run(r)


CASES = {'bar': bar_case, 'beam': beam_case, 'cantilever': cantilever_case, 'hole': hole_case, 'block': block_case}


@router.post('/solve')
def solve(req: FemRequest):
    if req.case not in CASES:
        return {'error': f'unknown case {req.case!r}'}
    if req.element not in ('q4', 'cst'):
        req.element = 'q4'
    out = CASES[req.case](req)
    out['case'] = req.case
    return out
