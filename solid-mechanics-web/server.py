import sys
import os
import numpy as np
import math
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'solid_mechanics_app', 'src')))
from math_engine.tensor_math import (
    get_principal_stresses, get_mohr_circle_parameters, 
    get_failure_criteria, get_strain_tensor, get_traction_vector
)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Mount the current directory to serve static files (index.html, app.js, style.css)
app.mount('/static', StaticFiles(directory=os.path.dirname(__file__)), name='static')
@app.get('/')
async def serve_index():
    return FileResponse(os.path.join(os.path.dirname(__file__), 'index.html'))
@app.get('/{filename}')
async def serve_root_files(filename: str):
    file_path = os.path.join(os.path.dirname(__file__), filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(os.path.dirname(__file__), 'index.html'))

class TensorInput(BaseModel):
    matrix: list[list[float]]
    Sy: float = 250.0
    E: float = 200.0
    nu: float = 0.3
    n_vec: list[float] = [1.0, 0.0, 0.0]

class BeamInput(BaseModel): E: float; L: float; b: float; h: float; load_mag: float; support_type: str; load_type: str; Sy: float

class TorsionInput(BaseModel): T: float; L: float; G: float; R: float; ri: float

class AxialInput(BaseModel): P: float; L: float; A: float; E: float

class PressureInput(BaseModel): p: float; r: float; t: float; type: str; is_thick: bool = False

class ThermalInput(BaseModel): dt: float; L: float; alpha: float; E: float; constraint: str

@app.post("/api/analyze_tensor")
async def analyze_tensor(data: TensorInput):
    tensor_pa = np.array(data.matrix) * 1e6
    E_pa = data.E * 1e9
    
    ps_pa, p_dirs = get_principal_stresses(tensor_pa)
    mohr_pa = get_mohr_circle_parameters(tensor_pa)
    failure = get_failure_criteria(tensor_pa)
    strain = get_strain_tensor(tensor_pa, E_pa, data.nu)
    traction = get_traction_vector(tensor_pa, data.n_vec)
    
    Sy_pa = data.Sy * 1e6
    fs_vm = (Sy_pa / failure["von_mises"]) if failure["von_mises"] > 0 else float('inf')
    fs_tresca = (Sy_pa / failure["tresca"]) if failure["tresca"] > 0 else float('inf')

    return {
        "principal_stresses": (ps_pa / 1e6).tolist(), 
        "eigenvectors": p_dirs.tolist(),
        "mohr": { 
            "c12": mohr_pa["C12"]/1e6, "r12": mohr_pa["R12"]/1e6, 
            "c23": mohr_pa["C23"]/1e6, "r23": mohr_pa["R23"]/1e6, 
            "c13": mohr_pa["C13"]/1e6, "r13": mohr_pa["R13"]/1e6, 
            "tMax": mohr_pa["R13"]/1e6 
        },
        "failure": {
            "von_mises": failure["von_mises"] / 1e6,
            "tresca": failure["tresca"] / 1e6,
            "fs_vm": fs_vm,
            "fs_tresca": fs_tresca
        },
        "strain": strain,
        "traction": {
            "T": (np.array(traction["T"]) / 1e6).tolist(),
            "sigma_n": traction["sigma_n"] / 1e6,
            "tau_n": traction["tau_n"] / 1e6
        }
    }

@app.post("/api/analyze_beam")
async def analyze_beam(data: BeamInput):
    L, b, h, E, P = data.L, data.b, data.h, data.E, data.load_mag
    Sy = data.Sy
    I = (b * h**3) / 12
    x_vals = np.linspace(0, L, 100)
    V_vals, M_vals, def_vals = np.zeros_like(x_vals), np.zeros_like(x_vals), np.zeros_like(x_vals)

    for i, x in enumerate(x_vals):
        if data.support_type == "cantilever":
            if data.load_type == "point":
                V_vals[i], M_vals[i], def_vals[i] = P, -P * (L - x), (-P * x**2 * (3*L - x)) / (6 * E * I)
            else: # UDL
                q = P
                V_vals[i], M_vals[i], def_vals[i] = q * (L - x), -q * (L - x)**2 / 2, (-q * x**2) / (24 * E * I) * (x**2 - 4*L*x + 6*L**2)
        else: # simply supported
            if data.load_type == "point":
                if x <= L/2: V_vals[i], M_vals[i], def_vals[i] = P/2, (P/2)*x, (-P*x)/(48*E*I)*(3*L**2 - 4*x**2)
                else: V_vals[i], M_vals[i], def_vals[i] = -P/2, (P/2)*(L-x), (-P*(L-x))/(48*E*I)*(3*L**2 - 4*(L-x)**2)
            else: # UDL
                q = P
                V_vals[i], M_vals[i], def_vals[i] = q*(L/2 - x), (q*x/2)*(L - x), (-q*x)/(24*E*I)*(L**3 - 2*L*x**2 + x**3)

    y_vals = np.linspace(-h/2, h/2, 30)
    heatmap = np.zeros((len(y_vals), len(x_vals)))
    max_vm = 0.0

    for i, y in enumerate(y_vals):
        for j, x in enumerate(x_vals):
            sig_x = -(M_vals[j] * y) / I
            Q = (b / 2) * ((h/2)**2 - y**2)
            tau_xy = (V_vals[j] * Q) / (I * b) if b > 0 else 0
            tensor = np.array([[sig_x, tau_xy, 0], [tau_xy, 0, 0], [0, 0, 0]])
            fail = get_failure_criteria(tensor)
            vm = fail["von_mises"]
            heatmap[i, j] = vm / 1e6
            if vm > max_vm: max_vm = vm
            
    # Calculate Tresca as well at the max VM point (approximate worst case)
    tensor_max = np.array([[ -(np.min(M_vals) * (h/2)) / I, 0, 0], [0, 0, 0], [0, 0, 0]])
    max_tresca = get_failure_criteria(tensor_max)["tresca"]

    fs_vm = Sy / max_vm if max_vm > 0 else float('inf')
    fs_tresca = Sy / max_tresca if max_tresca > 0 else float('inf')

    return { 
        "x": x_vals.tolist(), "y_cross": y_vals.tolist(), 
        "V": (V_vals/1000).tolist(), "M": (M_vals/1000).tolist(), 
        "deflection": (def_vals*1000).tolist(), "heatmap": heatmap.tolist(), 
        "max_vm": max_vm/1e6,
        "max_tresca": max_tresca/1e6,
        "fs_vm": fs_vm,
        "fs_tresca": fs_tresca
    }

@app.post("/api/analyze_torsion")
async def analyze_torsion(data: TorsionInput):
    J = (math.pi / 2) * (data.R**4 - data.ri**4)
    tau_max = (data.T * data.R) / J
    phi_max = (data.T * data.L) / (J * data.G)
    
    x_vals = np.linspace(0, data.L, 50)
    phi_vals = (data.T * x_vals) / (J * data.G)
    
    r_vals = np.linspace(data.ri, data.R, 50)
    tau_vals = (data.T * r_vals) / J

    return {
        "x": x_vals.tolist(), "phi": np.degrees(phi_vals).tolist(),
        "r": r_vals.tolist(), "tau": (tau_vals / 1e6).tolist(),
        "phi_max_deg": math.degrees(phi_max), "tau_max": tau_max / 1e6
    }

@app.post("/api/analyze_axial")
async def analyze_axial(data: AxialInput):
    sigma = data.P / data.A
    delta = (data.P * data.L) / (data.A * data.E)
    
    x_vals = np.linspace(0, data.L, 50)
    sig_vals = np.full_like(x_vals, sigma)
    del_vals = (data.P * x_vals) / (data.A * data.E)

    return {
        "x": x_vals.tolist(), "sigma": (sig_vals / 1e6).tolist(), "delta": (del_vals * 1000).tolist(),
        "sigma_max": sigma / 1e6, "delta_max": delta * 1000
    }

@app.post("/api/analyze_pressure_vessel")
async def analyze_pressure_vessel(data: PressureInput):
    if not data.is_thick:
        # Thin-walled approximation
        if data.type == "cylinder":
            sigma_hoop = (data.p * data.r) / data.t
            sigma_long = (data.p * data.r) / (2 * data.t)
            sigma_3 = 0.0
        else: # sphere
            sigma_hoop = (data.p * data.r) / (2 * data.t)
            sigma_long = sigma_hoop
            sigma_3 = 0.0
            
        tensor = np.array([[sigma_hoop, 0, 0], [0, sigma_long, 0], [0, 0, sigma_3]])
        ps, _ = get_principal_stresses(tensor)
        mohr = get_mohr_circle_parameters(tensor)
        
        return {
            "s1": ps[0] / 1e6, "s2": ps[1] / 1e6, "tmax": mohr["R13"] / 1e6,
            "mohr": {
                "c12": mohr["C12"]/1e6, "r12": mohr["R12"]/1e6,
                "c23": mohr["C23"]/1e6, "r23": mohr["R23"]/1e6,
                "c13": mohr["C13"]/1e6, "r13": mohr["R13"]/1e6
            },
            "is_thick": False
        }
    else:
        # Thick-walled Lamé equations
        ri = data.r
        ro = data.r + data.t
        r_vals = np.linspace(ri, ro, 50)
        
        if data.type == "cylinder":
            # p_o = 0
            sig_r = (data.p * ri**2) / (ro**2 - ri**2) * (1 - (ro**2)/(r_vals**2))
            sig_theta = (data.p * ri**2) / (ro**2 - ri**2) * (1 + (ro**2)/(r_vals**2))
            sig_z = np.full_like(r_vals, (data.p * ri**2) / (ro**2 - ri**2)) # Closed end assumption
        else:
            # Sphere
            sig_r = (data.p * ri**3) / (ro**3 - ri**3) * (1 - (ro**3)/(r_vals**3))
            sig_theta = (data.p * ri**3) / (ro**3 - ri**3) * (1 + (ro**3)/(2 * r_vals**3))
            sig_z = sig_theta
            
        # Get Mohr parameters for the inner surface (max stress)
        tensor = np.array([[sig_theta[0], 0, 0], [0, sig_z[0], 0], [0, 0, sig_r[0]]])
        ps, _ = get_principal_stresses(tensor)
        mohr = get_mohr_circle_parameters(tensor)
        
        return {
            "s1": ps[0] / 1e6, "s2": ps[1] / 1e6, "tmax": mohr["R13"] / 1e6,
            "mohr": {
                "c12": mohr["C12"]/1e6, "r12": mohr["R12"]/1e6,
                "c23": mohr["C23"]/1e6, "r23": mohr["R23"]/1e6,
                "c13": mohr["C13"]/1e6, "r13": mohr["R13"]/1e6
            },
            "is_thick": True,
            "r_vals": r_vals.tolist(),
            "sig_r": (sig_r / 1e6).tolist(),
            "sig_theta": (sig_theta / 1e6).tolist(),
            "sig_z": (sig_z / 1e6).tolist()
        }

@app.post("/api/analyze_thermal")
async def analyze_thermal(data: ThermalInput):
    free_delta = data.alpha * data.dt * data.L
    
    if data.constraint == "free":
        sigma = 0.0
        actual_delta = free_delta
    else:
        sigma = -data.E * data.alpha * data.dt
        actual_delta = 0.0

    x_vals = np.linspace(0, data.L, 2)
    def_vals = np.linspace(0, actual_delta, 2)

    return {
        "x": x_vals.tolist(), "deflection": (def_vals * 1000).tolist(),
        "sigma": sigma / 1e6, "delta": actual_delta * 1000
    }

class SectionInput(BaseModel):
    shape: str
    b: float # flange width
    h: float # web height
    t: float # thickness

class BucklingInput(BaseModel):
    E: float
    Sy: float
    L: float
    I: float
    A: float
    bc: str # boundary condition

@app.post("/api/analyze_section")
async def analyze_section(data: SectionInput):
    b, h, t = data.b, data.h, data.t
    
    # 1. Exact Geometric Properties (treating as 3 distinct rectangles)
    # Web: width t, height h-2t, centered at x=t/2, y=0
    # Top/Bottom Flanges: width b, thickness t, centered at y = +/- (h-t)/2, x=b/2
    
    A_web = t * (h - 2*t)
    A_flange = b * t
    A_total = A_web + 2 * A_flange
    
    # Centroid from the left edge (x=0)
    Qy = A_web * (t / 2) + 2 * (A_flange * (b / 2))
    xc = Qy / A_total
    
    # Exact Moment of Inertia (Ix) about the centroidal x-axis (y=0)
    Ix_web = (t * (h - 2*t)**3) / 12.0
    # Parallel axis theorem for flanges: I_local + A * d^2
    d_flange = (h - t) / 2.0
    Ix_flange = (b * t**3) / 12.0 + A_flange * (d_flange**2)
    
    Ix_total = Ix_web + 2 * Ix_flange
    
    # 2. Shear Center (Thin-walled approximation is standard for 'e')
    # Distance from the centerline of the web.
    # Using centerline dimensions for classical formula: h_c = h-t, b_c = b-t/2
    hc = h - t
    bc = b - t/2
    # The classical shear flow formula evaluates to: e = (tf * bc^2 * hc^2) / (4 * Ix)
    e = (t * bc**2 * hc**2) / (4 * Ix_total) if Ix_total > 0 else 0
    
    return {
        "Area": A_total,
        "centroid_x": xc,
        "Ix": Ix_total,
        "shear_center_e": e
    }

@app.post("/api/analyze_buckling")
async def analyze_buckling(data: BucklingInput):
    K_map = {"pinned-pinned": 1.0, "fixed-free": 2.0, "fixed-pinned": 0.7, "fixed-fixed": 0.5}
    K = K_map.get(data.bc, 1.0)
    
    Le = K * data.L
    r = math.sqrt(data.I / data.A) if data.A > 0 else 1e-9
    slenderness = Le / r
    
    # Euler critical load
    Pcr_euler = (math.pi**2 * data.E * data.I) / (Le**2)
    
    # Check yield/Johnson transition
    sig_cr = Pcr_euler / data.A
    if sig_cr > data.Sy / 2:
        # Johnson parabola
        sig_cr = data.Sy - (data.Sy**2 * slenderness**2) / (4 * math.pi**2 * data.E)
        Pcr = sig_cr * data.A
        regime = "Johnson (Inelastic)"
    else:
        Pcr = Pcr_euler
        regime = "Euler (Elastic)"

    # Mode shape
    x_vals = np.linspace(0, data.L, 50)
    if data.bc == "pinned-pinned":
        y_vals = np.sin(math.pi * x_vals / data.L)
    elif data.bc == "fixed-free":
        y_vals = 1 - np.cos(math.pi * x_vals / (2 * data.L))
    elif data.bc == "fixed-fixed":
        y_vals = 1 - np.cos(2 * math.pi * x_vals / data.L)
    else: # fixed-pinned
        y_vals = np.sin(math.pi * x_vals / data.L) - (x_vals/data.L) * np.sin(math.pi) # Approx

    return {
        "Pcr": Pcr,
        "slenderness": slenderness,
        "regime": regime,
        "x": x_vals.tolist(),
        "mode_shape": y_vals.tolist()
    }
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

