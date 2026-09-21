# Solid Mechanics Analyzer

A comprehensive suite of interactive simulators for evaluating structural states, originally scoped for a Mechanics of Materials course. This repository contains both a PyQt desktop application and a highly polished browser-based web application powered by a Python FastAPI math engine.

## Project Structure
- `solid_mechanics_app/`: Contains the PyQt6 Desktop application and the core `math_engine` (Python backend logic).
- `solid-mechanics-web/`: Contains the fully responsive, native HTML/CSS/JS web application and its FastAPI server.

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
