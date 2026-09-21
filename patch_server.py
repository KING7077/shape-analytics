import sys

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/server.py', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "from fastapi.middleware.cors import CORSMiddleware" in line:
        new_lines.append(line)
        new_lines.append("from fastapi.staticfiles import StaticFiles\n")
        new_lines.append("from fastapi.responses import FileResponse\n")
    elif 'app.add_middleware(CORSMiddleware' in line:
        new_lines.append(line)
        new_lines.append("\n# Mount the current directory to serve static files (index.html, app.js, style.css)\n")
        new_lines.append("app.mount('/static', StaticFiles(directory=os.path.dirname(__file__)), name='static')\n")
        new_lines.append("@app.get('/')\n")
        new_lines.append("async def serve_index():\n")
        new_lines.append("    return FileResponse(os.path.join(os.path.dirname(__file__), 'index.html'))\n")
        new_lines.append("@app.get('/{filename}')\n")
        new_lines.append("async def serve_root_files(filename: str):\n")
        new_lines.append("    file_path = os.path.join(os.path.dirname(__file__), filename)\n")
        new_lines.append("    if os.path.isfile(file_path):\n")
        new_lines.append("        return FileResponse(file_path)\n")
        new_lines.append("    return FileResponse(os.path.join(os.path.dirname(__file__), 'index.html'))\n")
    else:
        new_lines.append(line)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/server.py', 'w') as f:
    f.writelines(new_lines)
