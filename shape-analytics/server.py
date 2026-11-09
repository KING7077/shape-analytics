import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

app = FastAPI(title="Shape Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TractionRequest(BaseModel):
    sigma_xx: float
    sigma_yy: float
    sigma_zz: float
    tau_xy: float
    tau_yz: float
    tau_zx: float
    n_x: float
    n_y: float
    n_z: float

class PrincipalRequest(BaseModel):
    sigma_xx: float
    sigma_yy: float
    sigma_zz: float
    tau_xy: float
    tau_yz: float
    tau_zx: float

@app.post("/api/traction")
def compute_traction(req: TractionRequest):
    # Stress tensor (sigma)
    sigma = np.array([
        [req.sigma_xx, req.tau_xy, req.tau_zx],
        [req.tau_xy, req.sigma_yy, req.tau_yz],
        [req.tau_zx, req.tau_yz, req.sigma_zz]
    ])
    
    # Normal vector (n)
    n = np.array([req.n_x, req.n_y, req.n_z])
    norm_n = np.linalg.norm(n)
    if norm_n > 0:
        n = n / norm_n # Normalize
    else:
        n = np.array([1.0, 0.0, 0.0])
        
    # Cauchy's stress theorem: t = sigma * n
    # Note: Using symmetry, sigma == sigma^T
    t = np.dot(sigma, n)
    
    # Normal component of traction (sigma_n) = t . n
    sigma_n = np.dot(t, n)
    
    # Shear component of traction (tau) vector = t - sigma_n * n
    tau_vec = t - sigma_n * n
    tau_mag = np.linalg.norm(tau_vec)
    
    return {
        "traction_vector": t.tolist(),
        "normal_stress": float(sigma_n),
        "shear_stress_vector": tau_vec.tolist(),
        "shear_stress_mag": float(tau_mag)
    }

@app.post("/api/principal")
def compute_principal(req: PrincipalRequest):
    sigma = np.array([
        [req.sigma_xx, req.tau_xy, req.tau_zx],
        [req.tau_xy, req.sigma_yy, req.tau_yz],
        [req.tau_zx, req.tau_yz, req.sigma_zz]
    ])
    
    # Compute eigenvalues and eigenvectors
    eigenvalues, eigenvectors = np.linalg.eigh(sigma)
    
    # Sort descending
    idx = eigenvalues.argsort()[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]
    
    # Maximum shear stress = (sigma_1 - sigma_3) / 2
    tau_max = (eigenvalues[0] - eigenvalues[2]) / 2.0
    
    # Von Mises stress
    vm = np.sqrt(0.5 * ((eigenvalues[0]-eigenvalues[1])**2 + 
                        (eigenvalues[1]-eigenvalues[2])**2 + 
                        (eigenvalues[2]-eigenvalues[0])**2))
                        
    return {
        "principal_stresses": eigenvalues.tolist(),
        "principal_directions": eigenvectors.tolist(),
        "max_shear": float(tau_max),
        "von_mises": float(vm)
    }

class LoadCase(BaseModel):
    P: float
    painted_points: list
    load_point: list
    load_normal: list
    force_dir: list
    painted_area: float
    coverage: float
    traction_type: str

class SectionRequest(BaseModel):
    loads: list[LoadCase]
    slice_plane: str
    slice_pos: float
    dim_x: float
    dim_y: float
    dim_z: float
    resolution: int
    nu: float = 0.3
    material_E: float = 200e9
    shape: str = 'cuboid'   # 'cuboid' | 'cylinder' (axis Y) | 'sphere'; dim_* are the bounding-box extents


def half_space_displacement(x, y, z, Px, Py, a, nu, E):
    """Cerruti displacements for tangential point forces Px, Py (z into the body, z_eff = z + a)."""
    ze = z + a
    R = np.sqrt(x**2 + y**2 + ze**2)
    Rz = R + ze
    k = 1 - 2 * nu
    Cx = Px * (1 + nu) / (2 * np.pi * E * R)
    Cy = Py * (1 + nu) / (2 * np.pi * E * R)
    ux = Cx * (1 + x**2 / R**2 + k * (R / Rz - x**2 / Rz**2)) + Cy * (x * y / R**2 - k * x * y / Rz**2)
    uy = Cx * (x * y / R**2 - k * x * y / Rz**2) + Cy * (1 + y**2 / R**2 + k * (R / Rz - y**2 / Rz**2))
    uz = Cx * (x * ze / R**2 + k * x / Rz) + Cy * (y * ze / R**2 + k * y / Rz)
    return ux, uy, uz


def tangential_stress(x, y, z, Px, Py, a, nu, E):
    """Stress from tangential forces: strain = sym grad(u) (Ch. 5), then Hooke's law (Ch. 6)."""
    ze = z + a
    h = 1e-4 * np.sqrt(x**2 + y**2 + ze**2)
    u = lambda xx, yy, zz: half_space_displacement(xx, yy, zz, Px, Py, a, nu, E)
    xp, xm = u(x + h, y, z), u(x - h, y, z)
    yp, ym = u(x, y + h, z), u(x, y - h, z)
    zp, zm = u(x, y, z + h), u(x, y, z - h)
    d = lambda p, m, i: (p[i] - m[i]) / (2 * h)  # du_i / d(axis)
    exx, eyy, ezz = d(xp, xm, 0), d(yp, ym, 1), d(zp, zm, 2)
    exy = 0.5 * (d(yp, ym, 0) + d(xp, xm, 1))
    exz = 0.5 * (d(zp, zm, 0) + d(xp, xm, 2))
    eyz = 0.5 * (d(zp, zm, 1) + d(yp, ym, 2))
    nu_l = min(nu, 0.499)                      # lambda -> infinity as nu -> 0.5; the cap keeps the stress finite
    lam = E * nu_l / ((1 + nu_l) * (1 - 2 * nu_l))
    G = E / (2 * (1 + nu))
    tr = exx + eyy + ezz
    return (lam * tr + 2 * G * exx, lam * tr + 2 * G * eyy, lam * tr + 2 * G * ezz,
            2 * G * exy, 2 * G * exz, 2 * G * eyz)


@app.post("/api/section")
def compute_section(req: SectionRequest):
    res = int(np.clip(req.resolution, 2, 400))   # a grid needs two points; cap the cost of one request

    # define bounds based on shape dims
    if req.slice_plane == 'z':
        X, Y = np.meshgrid(np.linspace(-req.dim_x/2, req.dim_x/2, res),
                           np.linspace(-req.dim_y/2, req.dim_y/2, res))
        Z = np.full_like(X, req.slice_pos)
    elif req.slice_plane == 'y':
        X, Z = np.meshgrid(np.linspace(-req.dim_x/2, req.dim_x/2, res),
                           np.linspace(-req.dim_z/2, req.dim_z/2, res))
        Y = np.full_like(X, req.slice_pos)
    else:
        Y, Z = np.meshgrid(np.linspace(-req.dim_y/2, req.dim_y/2, res),
                           np.linspace(-req.dim_z/2, req.dim_z/2, res))
        X = np.full_like(Y, req.slice_pos)

    x = X.flatten()
    y = Y.flatten()
    z = Z.flatten()

    nu = req.nu
    E = req.material_E

    # Total Cauchy stress (tension positive); tensors of separate loads add (linear elasticity).
    s_xx_tot = np.zeros_like(x)
    s_yy_tot = np.zeros_like(x)
    s_zz_tot = np.zeros_like(x)
    t_xy_tot = np.zeros_like(x)
    t_xz_tot = np.zeros_like(x)
    t_yz_tot = np.zeros_like(x)

    for load in req.loads:
        lp = np.array(load.load_point)
        ln = np.array(load.load_normal)
        nz = -ln # Z points INTO the material

        nx = np.array([1.0, 0.0, 0.0])
        if abs(nz[0]) > 0.9:
            nx = np.array([0.0, 1.0, 0.0])
        nx = np.cross(nz, nx)
        norm_nx = np.linalg.norm(nx)
        if norm_nx > 0: nx = nx / norm_nx
        ny = np.cross(nz, nx)
        norm_ny = np.linalg.norm(ny)
        if norm_ny > 0: ny = ny / norm_ny

        dx = x - lp[0]
        dy = y - lp[1]
        dz = z - lp[2]

        lx = dx * nx[0] + dy * nx[1] + dz * nx[2]
        ly = dx * ny[0] + dy * ny[1] + dz * ny[2]
        lz = dx * nz[0] + dy * nz[1] + dz * nz[2]

        fdir = np.array(load.force_dir, dtype=float)
        fn = np.linalg.norm(fdir)
        fdir = fdir / fn if fn > 0 else nz        # direction only; a zero vector falls back to the surface normal
        Pz = load.P * np.dot(fdir, nz)
        Px = load.P * np.dot(fdir, nx)
        Py = load.P * np.dot(fdir, ny)

        painted_points = load.painted_points
        N_pts = len(painted_points)
        empty = N_pts == 0
        if empty:
            painted_points = [load.load_point]
            N_pts = 1

        # Same equivalent-depth smoothing as the 3D view (avoids the point-load singularity)
        P_arr = np.array(painted_points, dtype=float)
        eff_patch = 0.5 if empty else float(np.mean(np.linalg.norm(P_arr - lp, axis=1)))
        patch_local = eff_patch / max(1.0, np.sqrt(N_pts)) * 2.5

        dPz, dPx, dPy = Pz / N_pts, Px / N_pts, Py / N_pts
        C = dPz / (2 * np.pi)

        # local-frame accumulators
        l_xx = np.zeros_like(lz); l_yy = np.zeros_like(lz); l_zz = np.zeros_like(lz)
        l_xy = np.zeros_like(lz); l_xz = np.zeros_like(lz); l_yz = np.zeros_like(lz)

        for pt in painted_points:
            dx_p = pt[0] - lp[0]
            dy_p = pt[1] - lp[1]
            dz_p = pt[2] - lp[2]

            px_local = dx_p * nx[0] + dy_p * nx[1] + dz_p * nx[2]
            py_local = dx_p * ny[0] + dy_p * ny[1] + dz_p * ny[2]
            pz_local = dx_p * nz[0] + dy_p * nz[1] + dz_p * nz[2]

            lx_i = lx - px_local
            ly_i = ly - py_local
            lz_i = np.maximum(lz - pz_local, 0.01)

            # Boussinesq (tension positive; compressive load into the body):
            #   sigma_r = C[(1-2v)/(R(R+z)) - 3 r^2 z/R^5],  sigma_t = C(1-2v)[z/R^3 - 1/(R(R+z))]
            ze = lz_i + patch_local
            r2 = lx_i**2 + ly_i**2
            R = np.sqrt(r2 + ze**2)
            sr = C * ((1 - 2*nu) / (R * (R + ze)) - 3 * r2 * ze / R**5)
            st = C * (1 - 2*nu) * (ze / R**3 - 1 / (R * (R + ze)))
            r2s = np.where(r2 < 1e-16, 1.0, r2)
            c2 = np.where(r2 < 1e-16, 0.5, lx_i**2 / r2s)
            s2 = 1 - c2
            cs = np.where(r2 < 1e-16, 0.0, lx_i * ly_i / r2s)
            trz_over_r = -3 * dPz / (2 * np.pi) * ze**2 / R**5   # tau_rz = trz_over_r * r
            l_xx += sr * c2 + st * s2
            l_yy += sr * s2 + st * c2
            l_zz += -3 * dPz / (2 * np.pi) * ze**3 / R**5
            l_xy += (sr - st) * cs
            l_xz += trz_over_r * lx_i
            l_yz += trz_over_r * ly_i

            if dPx != 0 or dPy != 0:
                t = tangential_stress(lx_i, ly_i, lz_i, dPx, dPy, patch_local, nu, E)
                l_xx += t[0]; l_yy += t[1]; l_zz += t[2]
                l_xy += t[3]; l_xz += t[4]; l_yz += t[5]

        # rotate local tensor to global: sigma_g = R sigma_l R^T, R = [nx ny nz]
        Rm = np.stack([nx, ny, nz], axis=1)
        loc = [[l_xx, l_xy, l_xz], [l_xy, l_yy, l_yz], [l_xz, l_yz, l_zz]]
        def g(p, q):
            return sum(Rm[p, a] * Rm[q, b] * loc[a][b] for a in range(3) for b in range(3))

        # Full-boundary pressure (Ch. 2): t = -p n everywhere gives sigma = -p I. Only valid at full coverage.
        full = load.traction_type == 'normal' and load.coverage >= 0.99
        if full:
            pressure = load.P / load.painted_area if load.painted_area > 1e-6 else 0
            s_xx_tot -= pressure; s_yy_tot -= pressure; s_zz_tot -= pressure
        else:
            s_xx_tot += g(0, 0); s_yy_tot += g(1, 1); s_zz_tot += g(2, 2)
            t_xy_tot += g(0, 1); t_xz_tot += g(0, 2); t_yz_tot += g(1, 2)

    S = np.zeros((x.size, 3, 3))
    S[:, 0, 0], S[:, 1, 1], S[:, 2, 2] = s_xx_tot, s_yy_tot, s_zz_tot
    S[:, 0, 1] = S[:, 1, 0] = t_xy_tot
    S[:, 0, 2] = S[:, 2, 0] = t_xz_tot
    S[:, 1, 2] = S[:, 2, 1] = t_yz_tot

    # Same measures as the 3D view (Ch. 4, 5, 11): extreme normal stress, tau_max = (s1-s3)/2, von Mises, |strain|.
    p = np.linalg.eigvalsh(S)               # ascending: s3, s2, s1
    s1, s3 = p[:, 2], p[:, 0]
    vm = np.sqrt(0.5 * ((s_xx_tot - s_yy_tot)**2 + (s_yy_tot - s_zz_tot)**2 + (s_zz_tot - s_xx_tot)**2
                        + 6 * (t_xy_tot**2 + t_yz_tot**2 + t_xz_tot**2)))
    k = (1 + nu) / E
    m = nu * (s_xx_tot + s_yy_tot + s_zz_tot) / E
    eps = np.sqrt((k*s_xx_tot - m)**2 + (k*s_yy_tot - m)**2 + (k*s_zz_tot - m)**2
                  + 2 * k**2 * (t_xy_tot**2 + t_yz_tot**2 + t_xz_tot**2))
    fields = {
        "sigma_n": np.maximum(np.abs(s1), np.abs(s3)) / 1e6,
        "tau_max": (s1 - s3) / 2 / 1e6,
        "von_mises": vm / 1e6,
        "strain_mag": eps * 1e6,            # microstrain
    }

    # Keep only points inside the body; the grid is its bounding rectangle. Outside -> null (blank in the plot).
    hx, hy, hz = req.dim_x / 2, req.dim_y / 2, req.dim_z / 2
    tol = 1e-9
    if req.shape == 'cylinder':
        inside = (x**2 + z**2 <= hx**2 + tol) & (np.abs(y) <= hy + tol)
    elif req.shape == 'sphere':
        inside = x**2 + y**2 + z**2 <= hx**2 + tol
    else:
        inside = (np.abs(x) <= hx + tol) & (np.abs(y) <= hy + tol) & (np.abs(z) <= hz + tol)

    def grid(v):
        g = np.where(inside, v, np.nan).reshape(X.shape)
        return [[None if np.isnan(c) else float(c) for c in row] for row in g]

    out = {name: grid(v) for name, v in fields.items()}

    if req.slice_plane == 'z':
        axis1, axis2 = X[0, :].tolist(), Y[:, 0].tolist()
        title1, title2 = "X", "Y"
    elif req.slice_plane == 'y':
        axis1, axis2 = X[0, :].tolist(), Z[:, 0].tolist()
        title1, title2 = "X", "Z"
    else:
        axis1, axis2 = Y[0, :].tolist(), Z[:, 0].tolist()
        title1, title2 = "Y", "Z"
        
    return {
        "axis1": axis1,
        "axis2": axis2,
        "title1": title1,
        "title2": title2,
        "von_mises": out["von_mises"],
        "fields": out,
        "inside_fraction": float(inside.mean()),
    }

from fem import router as fem_router
app.include_router(fem_router)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# GET and HEAD: uptime monitors such as UptimeRobot send HEAD requests by default.
@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    # Cheap endpoint for uptime monitors (keeps the free Render instance awake).
    return {"status": "ok"}

@app.api_route("/", methods=["GET", "HEAD"])
def serve_index():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8002)
