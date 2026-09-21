with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/app.js', 'r') as f:
    content = f.read()

import re

# We will just replace the whole initButtons function to be safe.
new_init_buttons = '''    function initButtons() {
        $('calculate-btn').addEventListener('click', updatePointApplication);
        $('calculate-beam-btn').addEventListener('click', updateBeamApplication);
        $('calculate-torsion-btn').addEventListener('click', updateTorsionApplication);
        $('calculate-axial-btn').addEventListener('click', updateAxialApplication);
        $('calculate-pv-btn').addEventListener('click', updatePressureApplication);
        $('calculate-thermal-btn').addEventListener('click', updateThermalApplication);
        $('calculate-sec-btn').addEventListener('click', updateSectionApplication);
        $('calculate-buck-btn').addEventListener('click', updateBucklingApplication);
    }'''

content = re.sub(r'function initButtons\(\)\s*\{.*?\n\s*\}', new_init_buttons, content, flags=re.DOTALL)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/app.js', 'w') as f:
    f.write(content)
