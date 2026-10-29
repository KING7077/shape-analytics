# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout
- The git root is the parent directory (`solid-mech-project/`), not `shape-analytics/`. Sibling apps (`solid-mechanics-web/`, `leaf-modelling/`, `solid_mechanics_app/`) are separate projects; don't edit them for shape-analytics work.
- `__pycache__/*.pyc` files are tracked in git, so they show as modified after running Python. Don't commit them with unrelated changes.
- `patch_disp.js` is a scratch script, not loaded by the app.

## Run / test
- Run: `./run_shape_analytics.sh` (uses the venv at `../solid-mechanics-web/.venv`, serves http://127.0.0.1:8002). Run it from anywhere, but it starts uvicorn in the background.
- Test: with the server running, `python test_browser.py` (Playwright, headless Chromium, needs the venv). It has no assertions: it only prints `CONSOLE:`/`ERROR:` lines, so any `ERROR:` line is a failure. `/verify-app` automates this.
- No formatter or linter is configured.

## Architecture
- `server.py` (FastAPI) exposes `/api/traction`, `/api/principal`, `/api/section` and serves the static frontend from this directory.
- The 3D stress field is computed client-side in `app.js` (`computeStressField`, `calculateBoussinesq`, `calculateHalfSpaceDisplacement` for Boussinesq/Cerruti half-space solutions). Section analytics plots call `/api/section`.
- `sims.js` (second ES module) holds the other simulators (Mohr, beam, torsion, axial, pressure vessel, thermal, failure, energy, buckling) as configs `{inputs, compute(v) -> {status, readouts, charts, diagram}}`; the framework adds A/B overlay and CSV/SVG/spec/lab-report export. All math is client-side; `#module-nav` switches between them and the 3D field (`.app-layout`). Don't give new containers the class `plot-container` (Plotly nests its own). `docs/physics_report.tex` is the LaTeX report (`pdflatex` twice).
- No build step: `app.js` is an ES module (`<script type="module">`); Three.js r128 and Plotly 2.27 load from CDNs, so the app needs network access.
