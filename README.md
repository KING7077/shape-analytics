# Shape Analytics

**An interactive environment for stress analysis: half-space elasticity, analytical simulators and a finite element solver.**

Course project, Mechanics of Solids, Indian Institute of Technology Hyderabad.

| Member | Roll no. |
|---|---|
| Abhinav Kumar Sudhir Choudhary | CO25BTECH11001 |
| Rudra Thummar | CO25BTECH11024 |
| Tilak Asodariya | CO25BTECH11028 |
| Sriramnarayanan Mohan | CO25BTECH11027 |

**Under the guidance of Prof. Prakhar Gupta.**

The full report is in [`shape-analytics/docs/project_report.pdf`](shape-analytics/docs/project_report.pdf).

## What it does

Shape Analytics is a browser application for exploring stress, strain and deformation in elastic solids. It has three groups of tools:

- **3D stress field.** Paint a load on the surface of a cuboid, cylinder or sphere. The app superposes the Boussinesq (normal) and Cerruti (tangential) half-space solutions over the painted patch and colours the body by normal stress, maximum shear, von Mises stress or strain. **Section analytics** shows the same field on a plane cut through the body.
- **Nine analytical simulators.** Mohr's circle, beams (Euler–Bernoulli and Timoshenko), shaft torsion, axial loading (including statically indeterminate bars), pressure vessels (thin wall and Lamé), thermal stress, failure theories, energy methods (Castigliano, Maxwell–Betti) and column buckling (Euler and Johnson). Each shows its governing equations beside the result, with A/B comparison and CSV, SVG and lab-report export.
- **Finite element tab.** Bar, beam, plane-stress cantilever and plate-with-a-hole problems (CST and Q4 elements), plus a 3D brick model of a block under a patch load, each compared against a closed-form reference.

Every simulator reproduces its closed-form solution to the printed precision for its default inputs; the FEM solver converges at the expected rates. Chapter 5 of the report has the verification.

## Running locally

Requires Python 3.12 or newer.

```bash
./run_shape_analytics.sh
```

Then open <http://127.0.0.1:8002>. The first run creates a virtual environment in `shape-analytics/.venv` and installs the dependencies.

To do the same by hand:

```bash
cd shape-analytics
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8002
```

The page loads Three.js and Plotly from CDNs, so it needs an internet connection.

## Deployment

The app deploys as a free web service on [Render](https://render.com), with [UptimeRobot](https://uptimerobot.com) keeping it awake.

**Render**

1. Sign in to Render with GitHub and choose **New → Blueprint**.
2. Select this repository. Render reads `render.yaml` (free plan, `main` branch, Python 3.14.9, root directory `shape-analytics/`).
3. Click **Apply**. The first build takes a few minutes; the app is then live at `https://<service-name>.onrender.com`. Every push to `main` redeploys it.

**UptimeRobot**

A free Render service goes to sleep after 15 minutes without traffic, and the next visit then waits about a minute for it to wake. A monitor that requests the site every 5 minutes keeps it awake.

1. Sign up at UptimeRobot and choose **New monitor → HTTP(s)**.
2. Set the URL to `https://<service-name>.onrender.com/health` and the interval to **5 minutes**.
3. Save. UptimeRobot also emails you if the site goes down.

`/health` answers both GET and HEAD (UptimeRobot sends HEAD by default) without loading the page.

## Project structure

```
README.md
render.yaml               Render deployment config
run_shape_analytics.sh    local start script
shape-analytics/
  index.html, style.css   page layout and themes (light and dark)
  app.js                  3D stress field: geometry, painting, loads, section plots
  physics.js              half-space solutions, principal stresses, von Mises, strain
  sims.js                 the nine simulators and the framework that renders them
  fem.js, fem.css         finite element tab (user interface)
  server.py               FastAPI server: API routes and static files
  fem.py, fem3d.py        finite element solvers (1D, 2D, 3D brick)
  requirements.txt        Python dependencies
  docs/project_report.pdf project report
```

## API

| Route | Purpose |
|---|---|
| `POST /api/traction` | traction, normal and shear stress on a plane |
| `POST /api/principal` | principal stresses and directions, maximum shear, von Mises stress |
| `POST /api/section` | stress fields on a section plane through the loaded body |
| `POST /api/fem/solve` | solve a finite element problem (`bar`, `beam`, `cantilever`, `hole`, `block`) |
| `GET /health` | health check |

## Built with

JavaScript, Three.js, Plotly, Python, FastAPI, NumPy.
