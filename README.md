# Solid Mechanics Analyzer

A comprehensive suite of interactive simulators for evaluating structural states, originally scoped for a Mechanics of Materials course. This repository contains both a PyQt desktop application, a highly polished browser-based web application powered by a Python FastAPI math engine, and a standalone leaf flutter simulation using 3D beam theory.

## Project Structure
- `solid_mechanics_app/`: Contains the PyQt6 Desktop application and the core `math_engine` (Python backend logic).
- `solid-mechanics-web/`: Contains the fully responsive, native HTML/CSS/JS web application and its FastAPI server.
- `leaf-modelling/`: Standalone leaf flutter simulator — models a leaf on a stem using Euler-Bernoulli bending + Saint-Venant torsion, with real-time 3D animation and dynamic analysis.
- `shape-analytics/`: Interactive 3D stress field analyzer. Applies traction vectors to arbitrary geometries (Cuboids, Cylinders, Spheres) and maps normal stress, shear stress, and strain distributions.

## Running the Web Application (Recommended)
The web application features an "Industrial Precision" aesthetic, live safety factors (von Mises & Tresca), A/B state comparisons, thick-walled pressure vessel Lamé equations, and lab report exports.

### Prerequisites
1. Python 3.8+
2. Required Python packages: `fastapi`, `uvicorn`, `numpy`, `pydantic`.

### Setup & Run Instructions
1. Open a terminal in the root directory.
2. Navigate into the web directory:
   ```bash
   cd solid-mechanics-web
   ```
3. Activate the virtual environment (if you have one setup, e.g. `.venv`):
   ```bash
   source .venv/bin/activate
   ```
   *(If you don't have one, create it with `python -m venv .venv` and install requirements: `pip install fastapi uvicorn numpy pydantic`)*
4. Start the FastAPI backend server:
   ```bash
   python server.py
   ```
5. Open your web browser and navigate directly to the `index.html` file (e.g., `file:///path/to/solid-mechanics-web/index.html`) or serve it via a simple HTTP server (e.g., `python -m http.server 8080`).

## Running the Leaf Flutter Simulator
The leaf-modelling module simulates a leaf fluttering in the wind by treating the stem as a 3D cantilever beam (Euler-Bernoulli bending + Saint-Venant torsion) with the leaf blade as a rigid elliptical body at the tip. See [`leaf-modelling/REPORT.md`](leaf-modelling/REPORT.md) for the full physics derivation.

**Features:**
- 🍃 **Live 3D Animation** — Real-time Three.js rendering of the deforming stem and rotating leaf at 60fps
- 📊 **Dynamic Analysis** — Plotly.js plots of tip displacement history, deflection curves, bending moments, and stress distributions
- ⚙️ **Fully Configurable** — Sliders for Young's modulus, Poisson's ratio, stem length/diameter, leaf semi-axes (a, b), wind strength/frequency/gust
- ⚠️ **Resonance Detection** — Computes natural frequencies and warns when wind frequency approaches resonance

### Run Instructions
1. Navigate to the leaf-modelling directory and activate the virtual environment:
   ```bash
   cd leaf-modelling
   source ../solid-mechanics-web/.venv/bin/activate
   ```
2. Start the server:
   ```bash
   python server.py
   ```
3. Open `http://127.0.0.1:8001/` in your browser.

## Running the Shape Analytics Simulator
The shape-analytics module is a 3D stress field visualizer demonstrating Cauchy's Stress Theorem and Boussinesq solutions. See [`shape-analytics/REPORT.md`](shape-analytics/REPORT.md) for the theoretical background on traction vectors and stress tensors.

**Features:**
- 🧊 **3D Geometries** — Dynamically sizable Cuboids, Cylinders, and Spheres.
- 🎯 **Load Application** — Adjustable force magnitude and localized patch size.
- 📐 **Traction Vectors** — Apply loads along surface normals or via arbitrary 3D vectors.
- 🎨 **Real-Time Heatmaps** — Maps Normal Stress ($\sigma_n$), Shear Stress ($\tau_{\max}$), Von Mises stress, and Strain magnitude directly onto the 3D geometry using a custom shader logic in Three.js.
- 📊 **Analytics Dashboard** — Sectional stress/strain distributions graphed with Plotly.

### Run Instructions
1. Navigate to the shape-analytics directory and activate the virtual environment:
   ```bash
   cd shape-analytics
   source ../solid-mechanics-web/.venv/bin/activate
   ```
2. Start the FastAPI server (it runs on port 8002 to prevent conflicts):
   ```bash
   uvicorn server:app --host 127.0.0.1 --port 8002
   ```
3. Open `http://127.0.0.1:8002/` (or double-click `index.html`) in your browser.

## Running the Desktop Application (PyQt6)
1. Navigate to the desktop app directory:
   ```bash
   cd solid_mechanics_app
   ```
2. Install requirements (PyQt6, numpy, pyqtgraph, matplotlib):
   ```bash
   pip install -r requirements.txt
   ```
3. Run the main script:
   ```bash
   python src/main.py
   ```

> **Note on Desktop App:** The Desktop App (`solid_mechanics_app`) has been completely overhauled to feature an 8-tab PyQt6 interface matching the Web App. It now uses the same Python Math Engine by directly calling the FastAPI server endpoints. **Therefore, you must have the FastAPI web server running (`python server.py`) before calculating in the Desktop App.**
