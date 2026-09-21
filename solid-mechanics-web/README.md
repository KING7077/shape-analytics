# Interactive Solid Mechanics Laboratory (Web Edition)

A stunning, browser-based solid mechanics simulator featuring interactive 3D WebGL (Three.js) stress cubes, dynamic 2D Mohr's Circle plots, and a fully featured multi-lab analysis suite — all powered by a Python computational backend.

## Prerequisites

You will need:

- **Python 3.10+**
- The following pip packages:

```bash
pip install fastapi uvicorn numpy pydantic
```

## How to Run It

### 1. Start the Python Backend

Open a terminal in this directory and run:

```bash
python server.py
```

This starts a local FastAPI server at `http://127.0.0.1:8000` which handles all the heavy numerical computations (eigenvalue decomposition, stress tensor analysis, beam mechanics, etc.).

### 2. Open the Frontend

Simply open `index.html` in any modern web browser (Chrome, Firefox, Edge, Safari). The frontend communicates with the Python backend via `fetch` API calls.

> **Note:** The Python backend must be running before you interact with any of the laboratories, otherwise the calculations will not work.

## The Laboratories

### 1. Point Stress Analysis Lab
Analyze a single point within a material.
*   **The Stress Tensor (MPa)**: Modify the values of the 3×3 Cauchy Stress Tensor on the left panel.
*   **3D Stress Element (Three.js)**: Click and drag your mouse across the cube to rotate it in 3D space.
*   **Real-time Analysis (Plotly.js)**: Click "Calculate" to extract the Principal Stresses and dynamically draw the three interconnected Mohr's Circles.

### 2. Beam Failure Analysis Lab
Design a cantilever or simply-supported beam and analyze it for structural failure.
*   **Material & Geometry**: Input the Young's Modulus, Yield Stress, Length, Width, and Height.
*   **Loading**: Apply a point load or uniform distributed load.
*   **Macroscopic Plots**: SFD, BMD, and Deflection Curve.
*   **Microscopic Heatmap (von Mises)**: Computes the stress tensor at 3000 points and plots a 2D von Mises heatmap.
*   **Failure Detection**: Automatically flags **YIELD FAILURE** when peak stress exceeds yield.

### 3. Shaft Torsion Lab
Analyze torsional loading on solid and hollow circular shafts.

### 4. Axial Loading Lab
Analyze uniform axial tension or compression on prismatic bars.

### 5. Pressure Vessel Lab
Analyze thin-walled cylindrical and spherical pressure vessels.

### 6. Thermal Stress Lab
Analyze thermal expansion under free and fixed-end boundary conditions.

## Tech Stack

| Layer       | Technology                            |
|-------------|---------------------------------------|
| Structure   | Semantic HTML5                        |
| Styling     | Vanilla CSS3 (Flexbox, Grid, Custom Properties) |
| Interaction | Vanilla ES6+ JavaScript              |
| Computation | Python 3 (FastAPI + NumPy)            |
| 3D Graphics | Three.js (CDN)                        |
| 2D Charts   | Plotly.js (CDN)                       |
