# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout
- The git root is the parent directory (`solid-mech-project/`), not `shape-analytics/`. It holds only this app, the root `README.md` and `run_shape_analytics.sh`.
- `__pycache__/*.pyc` files are tracked in git, so they show as modified after running Python. Don't commit them with unrelated changes.

## Run / test
- Run: `./run_shape_analytics.sh` (uses the venv at `shape-analytics/.venv`: fastapi, uvicorn, numpy, pydantic, playwright; serves http://127.0.0.1:8002). Run it from anywhere, but it starts uvicorn in the background.
- Tests: the project has no test files (removed at the owner's request). To check a change, run the server and drive the page with Playwright from the venv, watching for console or page errors.
- No formatter or linter is configured.

## Architecture
- `server.py` (FastAPI) exposes `/api/traction`, `/api/principal`, `/api/section` and serves the static frontend from this directory.
- The 3D stress field is computed client-side in `app.js` (`computeStressField`, `calculateBoussinesq`, `calculateHalfSpaceDisplacement` for Boussinesq/Cerruti half-space solutions). Section analytics plots call `/api/section`.
- `sims.js` (second ES module) holds the other simulators (Mohr, beam, torsion, axial, pressure vessel, thermal, failure, energy, buckling) as configs `{inputs, compute(v) -> {status, readouts, charts, diagram}}`; the framework adds A/B overlay and CSV/SVG/spec/lab-report export. All math is client-side; `#module-nav` switches between them and the 3D field (`.app-layout`). Don't give new containers the class `plot-container` (Plotly nests its own). `docs/physics_report.tex` is the LaTeX report (`pdflatex` twice). `docs/project_report.pdf` is the full physics-to-code report: edit the `body*.tex` files in `docs/report_build/`, run `python3 build.py` there (it embeds code excerpts from the source by anchor text, so rename an anchor and the build says so), then `pdflatex` twice.
- The FEM tab is self-contained: `fem.js` (UI, registers itself through `registerModule` in `sims.js`), `fem.css`, `fem.py` (numpy solver, FastAPI router mounted in `server.py`) and `fem3d.py` (3D block, matrix-free conjugate gradients, loaded on demand by `fem.py`), and `docs/fem_primer.tex`. To remove it, delete those files and the `fem.css`/`fem.js` lines in `index.html`, the two `fem_router` lines in `server.py` and the `registerModule` hook in `sims.js`.
- No build step: `app.js` is an ES module (`<script type="module">`); Three.js r128 and Plotly 2.27 load from CDNs, so the app needs network access.
