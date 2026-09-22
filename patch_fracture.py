import re

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/index.html', 'r') as f:
    html = f.read()

fracture_html = '''                        <h3>Failure Criteria</h3>
                        <p><span><span class="math">σ<sub>VM</sub></span> (von Mises):</span> <span><span id="pt-vm">-</span> MPa</span></p>
                        <p><span><span class="math">FS<sub>VM</sub></span>:</span> <span><span id="pt-fsvm">-</span></span></p>
                        <p><span><span class="math">σ<sub>Tresca</sub></span>:</span> <span><span id="pt-tresca">-</span> MPa</span></p>
                        <p><span><span class="math">FS<sub>Tresca</sub></span>:</span> <span><span id="pt-fstresca">-</span></span></p>
                        
                        <h3>Fracture Planes</h3>
                        <p><span>Brittle (Normal):</span> <span>θ = <span id="pt-brittle-angle">-</span>°</span></p>
                        <p><span>Ductile (Shear):</span> <span>θ = <span id="pt-ductile-angle">-</span>°</span></p>'''

html = html.replace('''                        <h3>Failure Criteria</h3>
                        <p><span><span class="math">σ<sub>VM</sub></span> (von Mises):</span> <span><span id="pt-vm">-</span> MPa</span></p>
                        <p><span><span class="math">FS<sub>VM</sub></span>:</span> <span><span id="pt-fsvm">-</span></span></p>
                        <p><span><span class="math">σ<sub>Tresca</sub></span>:</span> <span><span id="pt-tresca">-</span> MPa</span></p>
                        <p><span><span class="math">FS<sub>Tresca</sub></span>:</span> <span><span id="pt-fstresca">-</span></span></p>''', fracture_html)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/index.html', 'w') as f:
    f.write(html)
