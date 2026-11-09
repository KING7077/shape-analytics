#!/bin/bash
# Start Shape Analytics locally at http://127.0.0.1:8002 (Ctrl+C to stop).
# The first run creates a virtual environment and installs the dependencies.
set -e
cd "$(dirname "$0")/shape-analytics"
if [ ! -d .venv ]; then
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi
echo "Shape Analytics: http://127.0.0.1:8002"
exec .venv/bin/uvicorn server:app --host 127.0.0.1 --port 8002
