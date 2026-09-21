# Interactive Solid Mechanics Laboratory (Web Edition)

A stunning, browser-based solid mechanics simulator featuring interactive 3D WebGL (Three.js) stress cubes, dynamic 2D Mohr's Circle plots, and a fully featured Beam Failure Analysis laboratory.

## How to Run It
Because this Web App is built using pure HTML, Vanilla CSS, and JavaScript with CDN dependencies, **you do not need to install Node.js, npm, or any server frameworks!**

1. Navigate to the folder containing these files.
2. Simply double-click `index.html` to open it in your favorite modern web browser (Chrome, Firefox, Edge, Safari).

## The Laboratories

### 1. Point Stress Analysis Lab
Analyze a single point within a material.
*   **The Stress Tensor (MPa)**: Modify the values of the $3 \times 3$ Cauchy Stress Tensor on the left panel.
*   **3D Stress Element (Three.js)**: Click and drag your mouse across the cube in the center panel to rotate it in 3D space.
*   **Real-time Analysis (Plotly.js)**: Click "Calculate" to extract the Principal Stresses and dynamically draw the three interconnected Mohr's Circles.

### 2. Beam Failure Analysis Lab
Click the "Beam Failure Analysis" tab at the top of the screen to switch to the macroscopic structural lab. Here, you can design a cantilever beam and analyze it for structural failure.
*   **Material & Geometry**: Input the Young's Modulus ($E$), Yield Stress ($\sigma_y$), Length ($L$), Width ($b$), and Height ($h$).
*   **Loading**: Apply a downward point load ($P$) at the free end of the cantilever beam.
*   **Macroscopic Plots**: The app automatically generates 1D plots along the length of the beam for:
    *   Shear Force Diagram (SFD)
    *   Bending Moment Diagram (BMD)
    *   Deflection Curve ($y(x)$)
*   **Microscopic Heatmap (von Mises)**: The app computes the exact $3 \times 3$ stress tensor at 1500 different $(x, y)$ coordinate points inside the beam profile, calculates the Principal Stresses at every point, applies the von Mises yield criterion, and plots a beautiful 2D heatmap. 
*   **Failure Detection**: If the peak von Mises stress inside the heatmap exceeds your inputted Yield Stress, the system automatically flags a **YIELD FAILURE**.
