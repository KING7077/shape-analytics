import sys
import os
import numpy as np
import math
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'solid_mechanics_app', 'src')))
from math_engine.tensor_math import get_principal_stresses, get_mohr_circle_parameters

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class TensorInput(BaseModel): matrix: list[list[float]]
class BeamInput(BaseModel): E: float; L: float; b: float; h: float; load_mag: float; support_type: str; load_type: str
class TorsionInput(BaseModel): T: float; L: float; G: float; R: float; ri: float
class AxialInput(BaseModel): P: float; L: float; A: float; E: float
class PressureInput(BaseModel): p: float; r: float; t: float; type: str
class ThermalInput(BaseModel): dt: float; L: float; alpha: float; E: float; constraint: str

@app.post("/api/analyze_tensor")
async def analyze_tensor(data: TensorInput):
    tensor = np.array(data.matrix)
    ps, p_dirs = get_principal_stresses(tensor)
    mohr = get_mohr_circle_parameters(tensor)
    return {
        "principal_stresses": ps.tolist(), "eigenvectors": p_dirs.tolist(),
        "mohr": { "c12": mohr["C12"], "r12": mohr["R12"], "c23": mohr["C23"], "r23": mohr["R23"], "c13": mohr["C13"], "r13": mohr["R13"], "tMax": mohr["R13"] }
    }

@app.post("/api/analyze_beam")
async def analyze_beam(data: BeamInput):
    L, b, h, E, P = data.L, data.b, data.h, data.E, data.load_mag
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
            ps, _ = get_principal_stresses(tensor)
            vm = np.sqrt(0.5 * ((ps[0]-ps[1])**2 + (ps[1]-ps[2])**2 + (ps[2]-ps[0])**2))
            heatmap[i, j] = vm / 1e6
            if vm > max_vm: max_vm = vm

    return { "x": x_vals.tolist(), "y_cross": y_vals.tolist(), "V": (V_vals/1000).tolist(), "M": (M_vals/1000).tolist(), "deflection": (def_vals*1000).tolist(), "heatmap": heatmap.tolist(), "max_vm": max_vm/1e6 }

@app.post("/api/analyze_torsion")
async def analyze_torsion(data: TorsionInput):
    # J = pi/2 * (R^4 - ri^4)
    J = (math.pi / 2) * (data.R**4 - data.ri**4)
    # tau_max = T * R / J
    tau_max = (data.T * data.R) / J
    # phi = T * L / (J * G)  (in radians)
    phi_max = (data.T * data.L) / (J * data.G)
    
    # Generate 1D arrays for plotting
    x_vals = np.linspace(0, data.L, 50)
    phi_vals = (data.T * x_vals) / (J * data.G) # twist along length
    
    r_vals = np.linspace(data.ri, data.R, 50)
    tau_vals = (data.T * r_vals) / J # shear stress along radius

    return {
        "x": x_vals.tolist(), "phi": np.degrees(phi_vals).tolist(),
        "r": r_vals.tolist(), "tau": (tau_vals / 1e6).tolist(), # MPa
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
    if data.type == "cylinder":
        sigma_hoop = (data.p * data.r) / data.t
        sigma_long = (data.p * data.r) / (2 * data.t)
        sigma_3 = 0.0 # outer surface plane stress
    else: # sphere
        sigma_hoop = (data.p * data.r) / (2 * data.t)
        sigma_long = sigma_hoop
        sigma_3 = 0.0

    # Build local 2D tensor for the wall
    tensor = np.array([
        [sigma_hoop, 0, 0],
        [0, sigma_long, 0],
        [0, 0, sigma_3]
    ])
    
    ps, _ = get_principal_stresses(tensor)
    mohr = get_mohr_circle_parameters(tensor)

    return {
        "s1": ps[0] / 1e6, "s2": ps[1] / 1e6, "tmax": mohr["R13"] / 1e6,
        "mohr": {
            "c12": mohr["C12"]/1e6, "r12": mohr["R12"]/1e6,
            "c23": mohr["C23"]/1e6, "r23": mohr["R23"]/1e6,
            "c13": mohr["C13"]/1e6, "r13": mohr["R13"]/1e6
        }
    }

@app.post("/api/analyze_thermal")
async def analyze_thermal(data: ThermalInput):
    # Free expansion: delta = alpha * dT * L
    free_delta = data.alpha * data.dt * data.L
    
    if data.constraint == "free":
        sigma = 0.0
        actual_delta = free_delta
    else: # fixed
        sigma = -data.E * data.alpha * data.dt # compressive if dT > 0
        actual_delta = 0.0

    x_vals = np.linspace(0, data.L, 2)
    def_vals = np.linspace(0, actual_delta, 2)

    return {
        "x": x_vals.tolist(), "deflection": (def_vals * 1000).tolist(),
        "sigma": sigma / 1e6, "delta": actual_delta * 1000
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
