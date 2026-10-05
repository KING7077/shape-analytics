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

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

@app.get("/")
def serve_index():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8002)
