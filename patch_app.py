
with open('solid-mechanics-web/app.js', 'r') as f:
    content = f.read()

# 1. Update TABS
content = content.replace("const TABS = ['point', 'beam', 'torsion', 'axial', 'pressure', 'thermal'];",
                          "const TABS = ['point', 'beam', 'torsion', 'axial', 'pressure', 'thermal', 'section', 'buckling'];")

# 2. Update updaters mapping
content = content.replace("var updaters = { beam: updateBeamApplication, torsion: updateTorsionApplication, axial: updateAxialApplication, pressure: updatePressureApplication, thermal: updateThermalApplication };",
                          "var updaters = { beam: updateBeamApplication, torsion: updateTorsionApplication, axial: updateAxialApplication, pressure: updatePressureApplication, thermal: updateThermalApplication, section: updateSectionApplication, buckling: updateBucklingApplication };")

# 3. Add new application functions
new_funcs = '''
    // ==========================================
    // 7. SECTION PROPERTIES LABORATORY
    // ==========================================
    async function updateSectionApplication() {
        var params = { b: val('sec-b'), h: val('sec-h'), t: val('sec-t'), shape: 'c-channel' };
        var btn = $('calculate-sec-btn'); setButtonLoading(btn, true, 'Analyze Section');
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
    }

    // ==========================================
    // 8. COLUMN BUCKLING LABORATORY
    // ==========================================
    async function updateBucklingApplication() {
        var params = { E: val('buck-e') * 1e9, Sy: val('buck-sy') * 1e6, L: val('buck-l'), I: val('buck-i') * 1e-8, A: val('buck-a') * 1e-4, bc: $('buck-bc').value };
        var btn = $('calculate-buck-btn'); setButtonLoading(btn, true, 'Analyze Buckling');
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
    }
'''
if "7. SECTION PROPERTIES LABORATORY" not in content:
    content = content.replace('function initResizeHandler() {', new_funcs + '\n    function initResizeHandler() {')

# 4. Add resize elements
content = content.replace("var plotDivs = ['plotly-container', 'plot-sfd', 'plot-bmd', 'plot-def', 'heatmap-container', 'plot-torsion-twist', 'plot-torsion-stress', 'plot-axial-stress', 'plot-axial-def', 'plot-pv-mohr', 'plot-pv-dist', 'plot-th-def'];",
                          "var plotDivs = ['plotly-container', 'plot-sfd', 'plot-bmd', 'plot-def', 'heatmap-container', 'plot-torsion-twist', 'plot-torsion-stress', 'plot-axial-stress', 'plot-axial-def', 'plot-pv-mohr', 'plot-pv-dist', 'plot-th-def', 'plot-sec-layout', 'plot-buck-mode'];")

# 5. Add initButtons bindings
# If it got broken in the previous run, we should fix it.
content = content.replace("$('calculate-thermal-btn').addEventListener('click', updateThermalApplication);\n    }",
                          "$('calculate-thermal-btn').addEventListener('click', updateThermalApplication);\n        $('calculate-sec-btn').addEventListener('click', updateSectionApplication);\n        $('calculate-buck-btn').addEventListener('click', updateBucklingApplication);\n    }")

with open('solid-mechanics-web/app.js', 'w') as f:
    f.write(content)
