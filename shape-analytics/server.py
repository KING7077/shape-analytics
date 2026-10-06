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

@app.post("/api/section")
def compute_section(req: SectionRequest):
    res = req.resolution
    
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
    
    # Initialize total stress tensors
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
        
        fdir = np.array(load.force_dir)
        fz_comp = np.dot(fdir, nz)
        Pz = load.P * fz_comp
        
        painted_points = load.painted_points
        N_pts = len(painted_points)
        if N_pts == 0:
            painted_points = [load.load_point]
            N_pts = 1
            
        dPz = Pz / N_pts
        C = dPz / (2 * np.pi)
        
        load_s_xx = np.zeros_like(lz)
        load_s_yy = np.zeros_like(lz)
        load_s_zz = np.zeros_like(lz)
        load_t_xy = np.zeros_like(lz)
        load_t_xz = np.zeros_like(lz)
        load_t_yz = np.zeros_like(lz)
        
        for pt in painted_points:
            dx_p = pt[0] - lp[0]
            dy_p = pt[1] - lp[1]
            dz_p = pt[2] - lp[2]
            
            px_local = dx_p * nx[0] + dy_p * nx[1] + dz_p * nx[2]
            py_local = dx_p * ny[0] + dy_p * ny[1] + dz_p * ny[2]
            pz_local = dx_p * nz[0] + dy_p * nz[1] + dz_p * nz[2]
            
            lx_i = lx - px_local
            ly_i = ly - py_local
            lz_i = np.maximum(lz - pz_local, 1e-5)
            
            R_i = np.sqrt(lx_i**2 + ly_i**2 + lz_i**2)
            R2 = R_i**2
            R5 = R_i**5
            R_Rz = R_i * (R_i + lz_i)
            
            load_s_xx += C * ( (1 - 2*nu)/R_Rz * (1 - (lx_i**2 * (2*R_i + lz_i)) / (R2 * (R_i + lz_i))) - (3 * lx_i**2 * lz_i) / R5 )
            load_s_yy += C * ( (1 - 2*nu)/R_Rz * (1 - (ly_i**2 * (2*R_i + lz_i)) / (R2 * (R_i + lz_i))) - (3 * ly_i**2 * lz_i) / R5 )
            load_s_zz += C * ( - (3 * lz_i**3) / R5 )
            load_t_xy += C * ( (1 - 2*nu)/R_Rz * (-lx_i * ly_i * (2*R_i + lz_i)) / (R2 * (R_i + lz_i)) - (3 * lx_i * ly_i * lz_i) / R5 )
            load_t_xz += C * ( - (3 * lx_i * lz_i**2) / R5 )
            load_t_yz += C * ( - (3 * ly_i * lz_i**2) / R5 )
            
        # Hydrostatic Blending for Full-Body Loading
        blend = min(1.0, load.coverage ** 2)
        pressure = load.P / load.painted_area if load.painted_area > 1e-6 else 0
        if load.traction_type != 'normal':
            pressure = 0
            
        s_xx_tot += load_s_xx * (1 - blend) - (pressure * blend)
        s_yy_tot += load_s_yy * (1 - blend) - (pressure * blend)
        s_zz_tot += load_s_zz * (1 - blend) - (pressure * blend)
        t_xy_tot += load_t_xy * (1 - blend)
        t_xz_tot += load_t_xz * (1 - blend)
        t_yz_tot += load_t_yz * (1 - blend)

    # Von Mises Stress Field
    vm = np.sqrt( 0.5 * ( (s_xx_tot - s_yy_tot)**2 + (s_yy_tot - s_zz_tot)**2 + (s_zz_tot - s_xx_tot)**2 + 6 * (t_xy_tot**2 + t_yz_tot**2 + t_xz_tot**2) ) )
    
    # Mask out areas outside the physical object
    mask = lz >= -0.1
    vm[~mask] = 0
    
    vm_mpa = vm / 1e6
    vm_grid = vm_mpa.reshape(X.shape)
    
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
        "von_mises": vm_grid.tolist()
    }

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

@app.get("/")
def serve_index():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8002)
