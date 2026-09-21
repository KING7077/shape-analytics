import re

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/app.js', 'r') as f:
    content = f.read()

# Replace the mangled updateSectionApplication completely
new_section = '''    async function updateSectionApplication() {
        var params = { b: val('sec-b'), h: val('sec-h'), t: val('sec-t'), shape: 'c-channel' };
        var btn = $('calculate-sec-btn'); 
        setButtonLoading(btn, true, 'Analyze Section');
        try {
            var d = await apiPost('/api/analyze_section', params, 'section');
            setText('sec-area', d.Area.toFixed(2));
            setText('sec-xc', d.centroid_x.toFixed(2));
            setText('sec-ix', d.Ix.toFixed(2));
            setText('sec-e', d.shear_center_e.toFixed(2));
            
            // Draw cross section (C-Channel)
            let b = params.b, h = params.h, t = params.t;
            let traces = [{
                x: [0, b, b, t, t, b, b, 0, 0],
                y: [h/2, h/2, h/2 - t, h/2 - t, -h/2 + t, -h/2 + t, -h/2, -h/2, h/2],
                fill: 'toself', line: { color: '#6366f1' }, name: 'Section'
            }];
            // Centroid
            traces.push({ x: [d.centroid_x], y: [0], mode: 'markers', marker: { size: 10, color: '#00e5a0' }, name: 'Centroid' });
            // Shear Center
            traces.push({ x: [-d.shear_center_e], y: [0], mode: 'markers', marker: { size: 10, color: '#ff4d6a', symbol: 'x' }, name: 'Shear Center' });
            
            Plotly.react('plot-sec-layout', traces, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Width (mm)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Height (mm)', scaleanchor: 'x', scaleratio: 1 }) }), PLOTLY_CONFIG);
        } catch (e) { console.error(e); showError('section'); } finally { setButtonLoading(btn, false, 'Analyze Section'); }
    }'''

content = re.sub(r'async function updateSectionApplication\(\).*?\}\s*\}', new_section, content, flags=re.DOTALL)

# Replace the mangled updateBucklingApplication completely
new_buckling = '''    async function updateBucklingApplication() {
        var params = { E: val('buck-e') * 1e9, Sy: val('buck-sy') * 1e6, L: val('buck-l'), I: val('buck-i') * 1e-8, A: val('buck-a') * 1e-4, bc: $('buck-bc').value };
        var btn = $('calculate-buck-btn'); 
        setButtonLoading(btn, true, 'Analyze Buckling');
        try {
            var d = await apiPost('/api/analyze_buckling', params, 'buckling');
            setText('buck-pcr', (d.Pcr / 1000).toFixed(2));
            setText('buck-slend', d.slenderness.toFixed(2));
            setText('buck-regime', d.regime);
            
            let traces_mode = [{ x: d.x, y: d.mode_shape, type: 'scatter', line: { color: '#ff4d6a', width: 3 }, name: 'Mode Shape' }];
            if (baselines['buckling']) {
                let bd = baselines['buckling'];
                traces_mode.push({ x: bd.x, y: bd.mode_shape, type: 'scatter', line: { color: '#ff4d6a', width: 2, dash:'dot' }, name: 'Base Mode' });
            }

            Plotly.react('plot-buck-mode', traces_mode, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Length X (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Relative Deflection', showticklabels: false }) }), PLOTLY_CONFIG);
        } catch (e) { console.error(e); showError('buckling'); } finally { setButtonLoading(btn, false, 'Analyze Buckling'); }
    }'''

content = re.sub(r'async function updateBucklingApplication\(\).*?\}\s*\}', new_buckling, content, flags=re.DOTALL)

with open('/home/srirammohan/Desktop/college/solid-mech-project/solid-mechanics-web/app.js', 'w') as f:
    f.write(content)
