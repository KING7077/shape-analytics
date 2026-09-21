with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/server.py', 'r') as f:
    content = f.read()

import re

new_section_logic = '''@app.post("/api/analyze_section")
async def analyze_section(data: SectionInput):
    b, h, t = data.b, data.h, data.t
    
    # 1. Exact Geometric Properties (treating as 3 distinct rectangles)
    # Web: width t, height h-2t, centered at x=t/2, y=0
    # Top/Bottom Flanges: width b, thickness t, centered at y = +/- (h-t)/2, x=b/2
    
    A_web = t * (h - 2*t)
    A_flange = b * t
    A_total = A_web + 2 * A_flange
    
    # Centroid from the left edge (x=0)
    Qy = A_web * (t / 2) + 2 * (A_flange * (b / 2))
    xc = Qy / A_total
    
    # Exact Moment of Inertia (Ix) about the centroidal x-axis (y=0)
    Ix_web = (t * (h - 2*t)**3) / 12.0
    # Parallel axis theorem for flanges: I_local + A * d^2
    d_flange = (h - t) / 2.0
    Ix_flange = (b * t**3) / 12.0 + A_flange * (d_flange**2)
    
    Ix_total = Ix_web + 2 * Ix_flange
    
    # 2. Shear Center (Thin-walled approximation is standard for 'e')
    # Distance from the centerline of the web.
    # Using centerline dimensions for classical formula: h_c = h-t, b_c = b-t/2
    hc = h - t
    bc = b - t/2
    # The classical shear flow formula evaluates to: e = (tf * bc^2 * hc^2) / (4 * Ix)
    e = (t * bc**2 * hc**2) / (4 * Ix_total) if Ix_total > 0 else 0
    
    return {
        "Area": A_total,
        "centroid_x": xc,
        "Ix": Ix_total,
        "shear_center_e": e
    }'''

content = re.sub(r'@app.post\("/api/analyze_section"\)\nasync def analyze_section.*?return \{.*?\}', new_section_logic, content, flags=re.DOTALL)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/server.py', 'w') as f:
    f.write(content)
