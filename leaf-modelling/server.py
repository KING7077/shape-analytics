import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import math, os

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class AnalysisInput(BaseModel):
    L: float = 0.08
    d: float = 0.003
    E: float = 2e9
    nu: float = 0.35
    rho: float = 1100.0
    zeta: float = 0.02
    leaf_a: float = 0.03
    leaf_b: float = 0.05
    leaf_mass: float = 0.001
    F0: float = 0.03
    freq: float = 2.0
    gust: float = 0.15
    duration: float = 5.0
    dt: float = 0.002

@app.post("/api/analyze_dynamic")
async def analyze_dynamic(data: AnalysisInput):
    I = math.pi * data.d**4 / 64
    J = math.pi * data.d**4 / 32
    A = math.pi * data.d**2 / 4
    G = data.E / (2 * (1 + data.nu))
    EI = data.E * I
    GJ = G * J
    
    omega_b = 3.5160 * math.sqrt(EI / (data.rho * A * data.L**4)) if data.rho > 0 else 0
    omega_t = (math.pi / (2 * data.L)) * math.sqrt(G / data.rho) if data.rho > 0 else 0
    freq_b = omega_b / (2 * math.pi)
    freq_t = omega_t / (2 * math.pi)
    freq_ratio = data.freq / freq_b if freq_b > 0 else 0
    
    N_steps = min(int(data.duration / data.dt), 5000)
    t_vals = np.linspace(0, data.duration, N_steps)
    w = data.freq * 2 * math.pi
    Fy_t = data.F0 * (np.sin(w * t_vals) + 0.3 * np.sin(1.73*w*t_vals + math.pi/4))
    Fz_t = data.F0 * (0.7 * np.sin(0.81*w*t_vals + math.pi/3) + 0.2 * np.sin(2.17*w*t_vals))
    
    tip_y = Fy_t * data.L**3 / (3 * EI)
    tip_z = Fz_t * data.L**3 / (3 * EI)
    tip_total = np.sqrt(tip_y**2 + tip_z**2)
    
    T0 = data.F0 * (data.leaf_b / 3)
    T_t = T0 * np.sin(1.31*w*t_vals + math.pi/6)
    tip_twist = T_t * data.L / GJ
    
    x_vals = np.linspace(0, data.L, 50)
    F_peak = data.F0 * 1.3
    v_peak = F_peak / (6 * EI) * x_vals**2 * (3*data.L - x_vals)
    M_peak = F_peak * (data.L - x_vals)
    sigma_bend = M_peak * (data.d/2) / I
    tau_tor = (T0 * 1.25) * (data.d/2) / J
    
    step = max(1, N_steps // 1000)
    
    return {
        "natural_freq_bending": freq_b,
        "natural_freq_torsion": freq_t,
        "freq_ratio": freq_ratio,
        "resonance_warning": 0.8 < freq_ratio < 1.2,
        "t": t_vals[::step].tolist(),
        "tip_y": (tip_y[::step] * 1000).tolist(),
        "tip_z": (tip_z[::step] * 1000).tolist(),
        "tip_total": (tip_total[::step] * 1000).tolist(),
        "tip_twist_deg": (tip_twist[::step]*180/math.pi).tolist(),
        "x": x_vals.tolist(),
        "deflection": (v_peak * 1000).tolist(),
        "moment": M_peak.tolist(),
        "sigma_bend": (sigma_bend / 1e6).tolist(),
        "tau_tor_max": tau_tor / 1e6,
        "max_tip_defl": float(np.max(tip_total) * 1000) if len(tip_total)>0 else 0,
    }

@app.get("/")
async def serve_index(): return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))

@app.get("/{filename}")
async def serve_file(filename: str):
    fp = os.path.join(os.path.dirname(__file__), filename)
    if os.path.isfile(fp): return FileResponse(fp)
    return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
