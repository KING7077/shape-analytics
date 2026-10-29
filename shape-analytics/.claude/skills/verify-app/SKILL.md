---
name: verify-app
description: Start the Shape Analytics server, run the Playwright smoke test (test_browser.py), report console/page errors, and stop the server. Use to confirm a change works in the real app.
disable-model-invocation: true
---

1. Start the server in the background from `shape-analytics/`:
   `source ../solid-mechanics-web/.venv/bin/activate && uvicorn server:app --host 127.0.0.1 --port 8002`
   (port 8002 must be free; the venv at `../solid-mechanics-web/.venv` is the one with fastapi and playwright).
2. Wait until `curl -s http://127.0.0.1:8002/` returns HTML.
3. Run `python test_browser.py` with the same venv. It opens the app in headless Chromium, clicks `#tab-analytics`, and prints `CONSOLE:` / `ERROR:` lines. It has no assertions, so report every `ERROR:` line and any `CONSOLE:` error/warning as a failure; no output errors means pass.
4. Stop the server and report the result.
