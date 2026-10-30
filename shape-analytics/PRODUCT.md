# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Students taking a solid mechanics course, who use it day to day to explore stress, strain and related topics, and the course instructor or evaluators, who assess it. Students want to change inputs and see results; evaluators want correctness and traceability to the syllabus.

## Product Purpose
Shape-analytics is an interactive solid mechanics tool. It computes and shows the 3D stress field of a body under a surface load, with section analytics and principal-stress views, and offers further simulators (Mohr, beam, torsion, axial, pressure vessel, thermal, failure, energy, buckling) plus a separate FEM tab. It stays on level with the course syllabus and is modelled on the SiliconWit solid-mechanics-analyzer. Success means a student can explore a problem and trust the numbers, and an evaluator can follow each result back to its physics.

## Positioning
The 3D stress field is its centre: a full Boussinesq/Cerruti tensor field for a loaded body, with section cuts through it. The project also ties every result to the syllabus and to a report that links the physics to the code, which a generic calculator would not do.

## Operating Context
Run locally with `./run_shape_analytics.sh` (FastAPI on 127.0.0.1:8002, numpy only, no build step). Three.js r128 and Plotly 2.27 load from CDNs, so the app needs network access. Coursework deliverables sit beside it: `REPORT.md` and the PDFs in `docs/` (`physics_report`, `fem_primer`, `project_report`).

## Capabilities and Constraints
- Conventions: tension positive; small-strain theory; simulators in mm, N and MPa; 3D field in SI.
- The half-space solution is an infinite-body model; the FEM tab (plane stress, bar, beam, 3D block) covers finite bodies.
- The FEM tab is self-contained and removable (see CLAUDE.md).
- Sibling apps in the parent repo are separate projects and are not edited.
- Hosting is intended; target and deploy details are undecided.

## Evidence on Hand
Verification by limiting cases (closed-form checks, sweeps, JS-versus-server cross-checks) documented in `REPORT.md` and `docs/project_report.pdf`. No users, testimonials or hosting metrics exist; do not invent any.

## Product Principles
- Correctness first: a displayed number must match its closed form or a verified numerical check.
- Every result traces to a syllabus chapter and to the code that computes it.
- Show limits honestly (small strain, half-space assumption, FEM mesh error) rather than hiding them.
- Keep modules separable so any one can be removed.
