# Plan: FEM solver for shape-analytics (feasibility, concepts, syllabus mapping)

## Context
The 3D field in `shape-analytics` uses the closed-form Boussinesq/Cerruti half-space solution (`physics.js`, `server.py`). It cannot satisfy zero traction on the faces of a finite body (open item #10 from the last physics pass). A finite-element solution solves the actual finite body, so it fixes #10 and gives a numerical cross-check on the analytic simulators in `sims.js`. FEM is not in the 11-chapter syllabus (checked `text_outputs/*.txt`: no chapter covers it). It is a numerical method for the equations the syllabus derives.

Verdict: feasible. About 2–3 days of work for a 2D version, 4–5 for 3D. Recommended scope is staged: 1D bar/beam, then 2D plane-stress/plane-strain, then optional 3D tetrahedra.

## FEM concepts you need (no prior knowledge assumed)

1. **The idea.** The exact equations (Ch 3 equilibrium, Ch 5 strain, Ch 6 Hooke) are differential equations that only have closed-form answers for simple shapes. FEM cuts the body into many small simple pieces (elements) joined at points (nodes). Inside each piece the answer is assumed to be a simple function. The pieces are then assembled into one large set of linear algebraic equations.
2. **Mesh.** Nodes plus elements. Bar: segments. 2D: triangles or quads. 3D: tetrahedra or bricks. A finer mesh gives a more accurate answer and more equations.
3. **Degrees of freedom (DOF).** The unknowns: displacement components at each node (u, v in 2D; u, v, w in 3D). The solver finds these; stress and strain are derived afterwards.
4. **Shape functions N.** Interpolation inside an element: displacement at any point = sum of N_i × nodal displacement_i. Each N_i is 1 at node i and 0 at the other nodes. The simplest case is the linear triangle (constant strain triangle, CST).
5. **Strain-displacement matrix B.** Differentiating the shape functions gives strain ε = B·u_e. This is Ch 5 (small strain, ε = ½(∇u + ∇uᵀ)) written in matrix form.
6. **Constitutive matrix D.** σ = D·ε. This is Ch 6 Hooke's law in Voigt notation (Ch 6.3), with plane-stress or plane-strain variants of D.
7. **Element stiffness matrix.** k_e = ∫ Bᵀ D B dV. It comes from the principle of virtual work or minimum potential energy, which is the Ch 10 material (strain energy U = ½ ∫ σ:ε dV, Castigliano). Physically, it says "force needed at the nodes for a unit nodal displacement".
8. **Assembly.** Add every k_e into the global matrix K by node numbering. Solve **K u = f**. K is symmetric (Maxwell–Betti reciprocity, Ch 10.3).
9. **Boundary conditions.** Fixed displacements (supports) remove rigid-body motion, otherwise K is singular. Applied tractions become nodal forces f (Ch 3.3 traction boundary condition). Zero traction on free faces comes automatically in the weak form ("natural" boundary condition), which is what the half-space solution lacks.
10. **Post-processing.** From u, compute strain ε = B·u_e and stress σ = D·ε per element, then principal stresses, Tresca and von Mises (Ch 4, 11) by reusing the existing `principalStresses` and `vonMises` in `physics.js`. CST stress is constant per element, so average to nodes for smooth contours.
11. **Verification.** Patch test (a constant stress field must be reproduced exactly), convergence under mesh refinement, and comparison with closed forms already in the repo: bar `σ = P/A`, cantilever `PL³/3EI`, Lamé thick cylinder, Kirsch hole stress concentration (σ = 3σ∞ at the hole edge).

## Mapping to the syllabus

| Chapter | Role in FEM |
|---|---|
| 1 Mathematical preliminaries | Matrix/tensor algebra, index notation, rotations for element transforms |
| 2 Traction, stress tensor | Stress matrix output, nodal traction loads |
| 3 Equilibrium | Governing equation that FEM approximates; traction BC |
| 4 Principal stresses, Mohr | Post-processing of element stress |
| 5 Strain tensor | B matrix, compatibility is automatic with continuous displacement |
| 6 Stress–strain | D matrix (Voigt, isotropic, plane stress/strain, thermal strain) |
| 7 Axisymmetric | Axisymmetric elements (optional later) validate against Lamé |
| 8–9 Beams | Beam elements (Hermite shape functions); check against Euler–Bernoulli/Timoshenko |
| 10 Energy methods | Theoretical basis: stiffness from strain energy, Castigliano, reciprocity |
| 11 Failure | Von Mises/Tresca contours on the FEM result |

Not in the syllabus, needed for FEM: weak form, shape functions, numerical integration (Gauss), meshing, assembly, linear solvers. The report will have a short primer for these.

## Feasibility
- **Stack:** Python venv has `numpy` 2.5.3 and `fastapi`; no scipy. A dense `numpy.linalg.solve` handles up to about 3000 DOF in under a second, enough for 2D meshes of about 1500 nodes. 3D meshes may need a hand-written conjugate gradient or sparse solver; add scipy only if the user agrees.
- **Where it runs:** server-side in a new `fem.py` with a `/api/fem` endpoint next to `/api/section`. Keeping it in Python means no heavy client-side linear algebra and it is testable with pytest-style scripts. A pure-JS version is possible but slower to write.
- **Meshing:** structured mesh for rectangles and cylinders (easy, no library). Spheres or arbitrary shapes need a mesher (gmsh/meshpy), which is the main risk for the 3D stage. Cuboid, cylinder and sphere are the app's current shapes.
- **Visualisation:** reuse the existing Three.js stress ramp (`stressRamp` in `app.js`) and Plotly heatmaps. FEM output maps onto the same field buffers.
- **Risks:** 3D meshing, accuracy of linear tetrahedra (stiff, needs fine mesh), runtime, and the user's FEM learning curve. Mitigate with the staged scope and a primer.

## Stages (recommended order)
1. **1D bar and beam** (`fem.py`): assemble K for bar elements, Hermite beam elements. Verify against the existing `sims.js` axial and beam results. Learns assembly and BCs on the smallest case.
2. **2D plane stress/strain with CST and Q4 elements.** Rectangular plate with a hole, cantilever, point load on a strip. Compare to Kirsch, to Flamant/Boussinesq 2D, and to beam theory. New "FEM" module tab in `#module-nav`, config style like `sims.js`.
3. **Finite 3D block** with tetrahedra or bricks and a surface patch load, directly addressing open item #10; compare with the half-space field far from the free faces.
4. Optional: axisymmetric elements and thermal loads.
5. Docs: add an FEM section to `docs/physics_report.tex` (concepts above, convergence plots) and `REPORT.md`.

## Critical files
- New: `shape-analytics/fem.py` (mesh, assembly, solve, recovery), `shape-analytics/docs/FEM_PLAN.md` (copy of this plan).
- Modified: `server.py` (`/api/fem`), `index.html` + `sims.js` or a new `fem.js` (module tab, controls, plots), `CLAUDE.md`, `docs/physics_report.tex`.
- Reused: `principalStresses`/`vonMises`/`strainNorm` in `physics.js`, `stressRamp`/`PLOTLY_RAMP` in `app.js`, material table (`MATERIALS`) and per-material ν from `poissonOf`, `plotLayout`/`themed` in `sims.js`.

## Verification
- `python fem_test.py`: patch test (uniform stress to 1e-10), bar and cantilever vs closed form, Kirsch hole concentration factor ≈ 3 with refinement, K symmetric and singular without supports, equilibrium (sum of reactions = applied load).
- Convergence study: halve the element size and check the error falls (CST ~ O(h), Q4 ~ O(h) in stress).
- Browser: `./run_shape_analytics.sh` then `python test_browser.py` (no `ERROR:` lines) and a manual look at the new FEM tab in light and dark themes.

## Decisions for the user
- Scope to build: 2D only, or continue to 3D.
- Allow adding scipy/gmsh dependencies, or stay numpy-only.
- On approval, `docs/FEM_PLAN.md` is created in the project dir with this content (plan mode blocks writing it now).

## Status
Built: stages 1 and 2 (bar, Hermite beam, plane-stress cantilever and plate with a hole; CST and Q4), numpy only, in a separate tab. Stage 3 built: `fem3d.py`, a quarter-symmetry cuboid of 8-node bricks under a square patch load (matrix-free CG, no scipy), compared with the half-space solution. Not built: axisymmetric and thermal elements, plane strain. Primer: `docs/fem_primer.tex`.

The verification scripts described above were run during development and then removed from the project at the owner's request.
