/**
 * app.js
 * Main application logic for the Solid Mechanics Web App.
 * All code is wrapped in an IIFE to prevent global scope pollution.
 */
(function () {
    'use strict';

    const API_BASE = 'http://127.0.0.1:8000';
    const TABS = ['point', 'beam', 'torsion', 'axial', 'pressure', 'thermal', 'section', 'buckling'];

    const PLOTLY_CONFIG = { responsive: true, displayModeBar: false };
    const PLOTLY_LAYOUT = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#8892a4', family: "'JetBrains Mono', monospace", size: 11 },
        margin: { t: 40, r: 20, l: 55, b: 45 },
        xaxis: { gridcolor: 'rgba(0,229,160,0.06)', zerolinecolor: 'rgba(0,229,160,0.12)' },
        yaxis: { gridcolor: 'rgba(0,229,160,0.06)', zerolinecolor: 'rgba(0,229,160,0.12)' },
        autosize: true
    };

    // A/B Comparison Baseline storage
    let baselines = {};
    // Last fetched datasets for export
    let latestData = {};

    function $(id) { return document.getElementById(id); }
    function val(id) { return parseFloat($(id).value) || 0; }
    function setText(id, text) { if ($(id)) $(id).innerText = text; }

    function showError(labName) {
        const banner = $('error-' + labName);
        if (banner) banner.classList.add('visible');
    }
    function hideError(labName) {
        const banner = $('error-' + labName);
        if (banner) banner.classList.remove('visible');
    }
    function setButtonLoading(btn, isLoading, defaultText) {
        if (!btn) return;
        if (isLoading) {
            btn.disabled = true;
            btn.innerText = 'Computing…';
        } else {
            btn.disabled = false;
            btn.innerText = defaultText;
        }
    }

    async function apiPost(endpoint, body, labName) {
        hideError(labName);
        const response = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('Server returned ' + response.status);
        const data = await response.json();
        latestData[labName] = data; // store for export
        return data;
    }

    function generateCircleData(cx, r, color, name, isDash = false) {
        let theta = [];
        for (let i = 0; i < 100; i++) theta.push((i / 99) * Math.PI);
        let x = theta.map(t => cx + r * Math.cos(t));
        let y = theta.map(t => r * Math.sin(t));
        return {
            x: x.concat(x.slice().reverse()),
            y: y.concat(y.map(() => 0)),
            fill: isDash ? 'none' : 'toself',
            fillcolor: isDash ? 'transparent' : color,
            line: { color: color, width: 2, dash: isDash ? 'dot' : 'solid' },
            name: name,
            type: 'scatter',
            hoverinfo: 'none'
        };
    }

    // ==========================================
    // TAB NAVIGATION
    // ==========================================
    function switchTab(activeTab) {
        TABS.forEach(tab => {
            var panel = $('view-' + tab);
            var btn = $('tab-' + tab);
            if (panel) panel.setAttribute('aria-hidden', String(tab !== activeTab));
            if (btn) btn.setAttribute('aria-selected', String(tab === activeTab));
        });
        window.dispatchEvent(new Event('resize'));
        var updaters = { beam: updateBeamApplication, torsion: updateTorsionApplication, axial: updateAxialApplication, pressure: updatePressureApplication, thermal: updateThermalApplication, section: updateSectionApplication, buckling: updateBucklingApplication };
        if (updaters[activeTab]) updaters[activeTab]();
    }

    function initTabs() {
        var tablist = document.querySelector('nav[role="tablist"]');
        if (!tablist) return;
        tablist.addEventListener('click', e => {
            var btn = e.target.closest('button[role="tab"]');
            if (btn) switchTab(btn.id.replace('tab-', ''));
        });
        tablist.addEventListener('keydown', e => {
            var currentBtn = e.target;
            if (currentBtn.getAttribute('role') !== 'tab') return;
            var btns = Array.from(tablist.querySelectorAll('button[role="tab"]'));
            var idx = btns.indexOf(currentBtn);
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btns[(idx + 1) % btns.length].focus(); btns[(idx + 1) % btns.length].click(); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); btns[(idx - 1 + btns.length) % btns.length].focus(); btns[(idx - 1 + btns.length) % btns.length].click(); }
        });
    }

    // ==========================================
    // EXPORT & BASELINE
    // ==========================================
    function initExports() {
        document.querySelectorAll('.btn-baseline').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-target');
                if (latestData[target]) {
                    baselines[target] = JSON.parse(JSON.stringify(latestData[target]));
                    btn.innerText = "Baseline Saved!";
                    setTimeout(() => btn.innerText = "Save Baseline A/B", 2000);
                    // Retrigger update to plot A/B
                    switchTab(target); 
                    if (target === 'point') updatePointApplication();
                }
            });
        });
        document.querySelectorAll('.btn-export').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-target');
                if (latestData[target]) {
                    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(JSON.stringify(latestData[target], null, 2));
                    const link = document.createElement("a");
                    link.setAttribute("href", csvContent);
                    link.setAttribute("download", `lab_report_${target}.json`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            });
        });
    }

    // ==========================================
    // 1. POINT STRESS LABORATORY
    // ==========================================
    var scene, camera, renderer, cube, arrowsGroup, axesGroup;
    var isDragging = false;
    var previousMousePosition = { x: 0, y: 0 };

    function initThreeJS() {
        var container = $('three-container');
        if(!container) return;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
        camera.position.set(2, 2, 5);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        scene.add(dirLight);
        scene.add(new THREE.AxesHelper(1.5));

        var geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        var mats = [
            new THREE.MeshLambertMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.35 }),
            new THREE.MeshLambertMaterial({ color: 0x00996b, transparent: true, opacity: 0.35 }),
            new THREE.MeshLambertMaterial({ color: 0x6366f1, transparent: true, opacity: 0.35 }),
            new THREE.MeshLambertMaterial({ color: 0x4338ca, transparent: true, opacity: 0.35 }),
            new THREE.MeshLambertMaterial({ color: 0x8892a4, transparent: true, opacity: 0.35 }),
            new THREE.MeshLambertMaterial({ color: 0x5e6b80, transparent: true, opacity: 0.35 })
        ];
        cube = new THREE.Mesh(geo, mats);
        cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff })));
        arrowsGroup = new THREE.Group();
        cube.add(arrowsGroup);
        axesGroup = new THREE.Group();
        cube.add(axesGroup);
        scene.add(cube);

        renderer.domElement.addEventListener('mousedown', () => isDragging = true);
        renderer.domElement.addEventListener('mouseup', () => isDragging = false);
        renderer.domElement.addEventListener('mouseleave', () => isDragging = false);
        renderer.domElement.addEventListener('mousemove', e => {
            if (isDragging) {
                var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/180*(e.offsetY-previousMousePosition.y)*0.5, Math.PI/180*(e.offsetX-previousMousePosition.x)*0.5, 0, 'XYZ'));
                cube.quaternion.multiplyQuaternions(q, cube.quaternion);
            }
            previousMousePosition = { x: e.offsetX, y: e.offsetY };
        });

        window.addEventListener('resize', () => {
            if (container.clientWidth === 0) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        });
        requestAnimationFrame(function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); });
    }

    function initPointSymmetrySync() {
        if(!$('s12')) return;
        $('s12').addEventListener('input', function () { $('s21').value = this.value; });
        $('s13').addEventListener('input', function () { $('s31').value = this.value; });
        $('s23').addEventListener('input', function () { $('s32').value = this.value; });
    }

    async function updatePointApplication() {
        $('s21').value = $('s12').value; $('s31').value = $('s13').value; $('s32').value = $('s23').value;

        var payload = {
            matrix: [[val('s11'), val('s12'), val('s13')], [val('s21'), val('s22'), val('s23')], [val('s31'), val('s32'), val('s33')]],
            Sy: val('pt-sy'), E: val('pt-e'), nu: val('pt-nu'), n_vec: [val('pt-nx'), val('pt-ny'), val('pt-nz')]
        };
        var btn = $('calculate-btn');
        setButtonLoading(btn, true, 'Calculate via Python Math Engine');

        try {
            var data = await apiPost('/api/analyze_tensor', payload, 'point');

            setText('p-s1', data.principal_stresses[0].toFixed(2));
            setText('p-s2', data.principal_stresses[1].toFixed(2));
            setText('p-s3', data.principal_stresses[2].toFixed(2));
            setText('t-max', data.mohr.tMax.toFixed(2));
            
            setText('pt-vm', data.failure.von_mises.toFixed(2));
            setText('pt-fsvm', data.failure.fs_vm === null ? '∞' : data.failure.fs_vm.toFixed(2));
            setText('pt-tresca', data.failure.tresca.toFixed(2));
            setText('pt-fstresca', data.failure.fs_tresca === null ? '∞' : data.failure.fs_tresca.toFixed(2));
            
            setText('pt-dil', data.strain.dilatation.toExponential(3));
            setText('pt-tx', data.traction.T[0].toFixed(2));
            setText('pt-ty', data.traction.T[1].toFixed(2));
            setText('pt-tz', data.traction.T[2].toFixed(2));
            setText('pt-sn', data.traction.sigma_n.toFixed(2));
            setText('pt-tn', data.traction.tau_n.toFixed(2));

            var mohrLayout = Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Normal Stress σ (MPa)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Shear Stress τ (MPa)', scaleanchor: 'x', scaleratio: 1 }) });
            let traces = [
                generateCircleData(data.mohr.c13, data.mohr.r13, 'rgba(0, 229, 160, 0.25)', 'σ₁ - σ₃'),
                generateCircleData(data.mohr.c12, data.mohr.r12, 'rgba(99, 102, 241, 0.5)', 'σ₁ - σ₂'),
                generateCircleData(data.mohr.c23, data.mohr.r23, 'rgba(0, 229, 160, 0.5)', 'σ₂ - σ₃')
            ];
            
            if (baselines['point']) {
                let mB = baselines['point'].mohr;
                traces.push(generateCircleData(mB.c13, mB.r13, 'rgba(0, 229, 160, 0.8)', 'Base σ₁ - σ₃', true));
            }
            Plotly.react('plotly-container', traces, mohrLayout, PLOTLY_CONFIG);

            while (arrowsGroup.children.length > 0) arrowsGroup.remove(arrowsGroup.children[0]);
            var addArrow = function (dx, dy, dz, ox, oy, oz, col) {
                if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0) arrowsGroup.add(new THREE.ArrowHelper(new THREE.Vector3(dx, dy, dz).normalize(), new THREE.Vector3(ox, oy, oz), 0.5, col, 0.2, 0.1));
            };
            if (payload.matrix[0][0] !== 0) addArrow(payload.matrix[0][0] > 0 ? 1 : -1, 0, 0, 0.75, 0, 0, 0xff4d6a);
            if (payload.matrix[1][1] !== 0) addArrow(0, payload.matrix[1][1] > 0 ? 1 : -1, 0, 0, 0.75, 0, 0x00e5a0);
            if (payload.matrix[2][2] !== 0) addArrow(0, 0, payload.matrix[2][2] > 0 ? 1 : -1, 0, 0, 0.75, 0x6366f1);

            while (axesGroup.children.length > 0) axesGroup.remove(axesGroup.children[0]);
            var axisColors = [0xff4d6a, 0x00e5a0, 0x6366f1];
            for (var i = 0; i < 3; i++) {
                var p = new THREE.Vector3(data.eigenvectors[0][i], data.eigenvectors[1][i], data.eigenvectors[2][i]).normalize();
                axesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p.clone().multiplyScalar(1.5), p.clone().multiplyScalar(-1.5)]), new THREE.LineBasicMaterial({ color: axisColors[i], linewidth: 3 })));
            }
        } catch (e) { console.error(e); showError('point'); } finally { setButtonLoading(btn, false, 'Calculate via Python Math Engine'); }
    }

    // ==========================================
    // 2. BEAM FAILURE LABORATORY
    // ==========================================
    async function updateBeamApplication() {
        var params = { E: val('beam-e') * 1e9, L: val('beam-l'), b: val('beam-w'), h: val('beam-h'), load_mag: val('beam-p') * 1000, support_type: $('beam-support').value, load_type: $('beam-load-type').value, Sy: val('beam-sy') * 1e6 };
        setText('hint-sy', val('beam-sy'));
        var btn = $('calculate-beam-btn'); setButtonLoading(btn, true, 'Analyze Failure Criteria');
        try {
            var d = await apiPost('/api/analyze_beam', params, 'beam');
            let traces_sfd = [{ x: d.x, y: d.V, type: 'scatter', name: 'Shear', line: { color: '#ff4d6a', width: 2 } }];
            let traces_bmd = [{ x: d.x, y: d.M, type: 'scatter', name: 'Moment', line: { color: '#6366f1', width: 2 } }];
            let traces_def = [{ x: d.x, y: d.deflection, type: 'scatter', name: 'Deflection', line: { color: '#00e5a0', width: 2 } }];
            
            if (baselines['beam']) {
                let bd = baselines['beam'];
                traces_sfd.push({ x: bd.x, y: bd.V, type: 'scatter', name: 'Base V', line: { color: '#ff4d6a', width: 2, dash: 'dot' } });
                traces_bmd.push({ x: bd.x, y: bd.M, type: 'scatter', name: 'Base M', line: { color: '#6366f1', width: 2, dash: 'dot' } });
                traces_def.push({ x: bd.x, y: bd.deflection, type: 'scatter', name: 'Base δ', line: { color: '#00e5a0', width: 2, dash: 'dot' } });
            }

            Plotly.react('plot-sfd', traces_sfd, Object.assign({}, PLOTLY_LAYOUT, { yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Shear (kN)' }) }), PLOTLY_CONFIG);
            Plotly.react('plot-bmd', traces_bmd, Object.assign({}, PLOTLY_LAYOUT, { yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Moment (kNm)' }) }), PLOTLY_CONFIG);
            Plotly.react('plot-def', traces_def, Object.assign({}, PLOTLY_LAYOUT, { yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Deflection (mm)' }), xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Length X (m)' }) }), PLOTLY_CONFIG);
            Plotly.react('heatmap-container', [{ z: d.heatmap, x: d.x, y: d.y_cross, type: 'heatmap', colorscale: 'Portland' }], Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Length X (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Height Y (m)' }) }), PLOTLY_CONFIG);

            setText('max-vm-stress', d.max_vm.toFixed(2));
            setText('fs-vm-beam', d.fs_vm.toFixed(2));
            setText('max-tresca-stress', d.max_tresca.toFixed(2));
            setText('fs-tresca-beam', d.fs_tresca.toFixed(2));
            
            var isFailed = d.fs_vm <= 1.0 || d.fs_tresca <= 1.0;
            $('failure-flag').innerText = isFailed ? 'YIELD FAILURE' : 'SAFE';
            $('failure-flag').className = isFailed ? 'status-failure' : 'status-safe';
        } catch (e) { console.error(e); showError('beam'); } finally { setButtonLoading(btn, false, 'Analyze Failure Criteria'); }
    }

    // ==========================================
    // 3. SHAFT TORSION LABORATORY
    // ==========================================
    async function updateTorsionApplication() {
        var params = { T: val('tor-t') * 1000, L: val('tor-l'), G: val('tor-g') * 1e9, R: val('tor-r'), ri: val('tor-ri') };
        var btn = $('calculate-torsion-btn'); setButtonLoading(btn, true, 'Analyze Torsion in Python');
        try {
            var d = await apiPost('/api/analyze_torsion', params, 'torsion');
            setText('tor-tau', d.tau_max.toFixed(2)); setText('tor-phi', d.phi_max_deg.toFixed(2));
            
            let traces_phi = [{ x: d.x, y: d.phi, type: 'scatter', line: { color: '#6366f1', width: 2 } }];
            let traces_tau = [{ x: d.r, y: d.tau, type: 'scatter', line: { color: '#ff4d6a', width: 2 } }];
            
            if (baselines['torsion']) {
                let bd = baselines['torsion'];
                traces_phi.push({ x: bd.x, y: bd.phi, type: 'scatter', line: { color: '#6366f1', width: 2, dash:'dot' } });
                traces_tau.push({ x: bd.r, y: bd.tau, type: 'scatter', line: { color: '#ff4d6a', width: 2, dash:'dot' } });
            }

            Plotly.react('plot-torsion-twist', traces_phi, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Length (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Angle (deg)' }) }), PLOTLY_CONFIG);
            Plotly.react('plot-torsion-stress', traces_tau, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Radius (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Shear Stress (MPa)' }) }), PLOTLY_CONFIG);
        } catch (e) { console.error(e); showError('torsion'); } finally { setButtonLoading(btn, false, 'Analyze Torsion in Python'); }
    }

    // ==========================================
    // 4. AXIAL LOADING LABORATORY
    // ==========================================
    async function updateAxialApplication() {
        var params = { P: val('ax-p') * 1000, L: val('ax-l'), A: val('ax-a') / 10000, E: val('ax-e') * 1e9 };
        var btn = $('calculate-axial-btn'); setButtonLoading(btn, true, 'Analyze Axial Stress in Python');
        try {
            var d = await apiPost('/api/analyze_axial', params, 'axial');
            setText('ax-sig', d.sigma_max.toFixed(2)); setText('ax-del', d.delta_max.toFixed(2));
            
            let traces_sig = [{ x: d.x, y: d.sigma, type: 'scatter', line: { color: '#6366f1', width: 2 } }];
            let traces_del = [{ x: d.x, y: d.delta, type: 'scatter', line: { color: '#00e5a0', width: 2 } }];
            
            if (baselines['axial']) {
                let bd = baselines['axial'];
                traces_sig.push({ x: bd.x, y: bd.sigma, type: 'scatter', line: { color: '#6366f1', width: 2, dash:'dot' } });
                traces_del.push({ x: bd.x, y: bd.delta, type: 'scatter', line: { color: '#00e5a0', width: 2, dash:'dot' } });
            }

            Plotly.react('plot-axial-stress', traces_sig, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Length (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Stress (MPa)' }) }), PLOTLY_CONFIG);
            Plotly.react('plot-axial-def', traces_del, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Length (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Elongation (mm)' }) }), PLOTLY_CONFIG);
        } catch (e) { console.error(e); showError('axial'); } finally { setButtonLoading(btn, false, 'Analyze Axial Stress in Python'); }
    }

    // ==========================================
    // 5. PRESSURE VESSEL LABORATORY
    // ==========================================
    async function updatePressureApplication() {
        var params = { p: val('pv-p') * 1e6, r: val('pv-r'), t: val('pv-t') / 1000, type: $('pv-type').value, is_thick: $('pv-thick').value === "true" };
        var btn = $('calculate-pv-btn'); setButtonLoading(btn, true, 'Analyze Vessel in Python');
        try {
            var d = await apiPost('/api/analyze_pressure_vessel', params, 'pressure');
            setText('pv-s1', d.s1.toFixed(2)); setText('pv-s2', d.s2.toFixed(2)); setText('pv-tmax', d.tmax.toFixed(2));

            let traces_dist = [];
            if (d.is_thick) {
                traces_dist = [
                    { x: d.r_vals, y: d.sig_theta, type: 'scatter', name: 'Hoop σ_θ', line: { color: '#00e5a0', width: 2 } },
                    { x: d.r_vals, y: d.sig_r, type: 'scatter', name: 'Radial σ_r', line: { color: '#ff4d6a', width: 2 } },
                    { x: d.r_vals, y: d.sig_z, type: 'scatter', name: 'Long. σ_z', line: { color: '#6366f1', width: 2 } }
                ];
                if (baselines['pressure'] && baselines['pressure'].is_thick) {
                    let bd = baselines['pressure'];
                    traces_dist.push({ x: bd.r_vals, y: bd.sig_theta, type: 'scatter', name: 'Base σ_θ', line: { color: '#00e5a0', width: 2, dash:'dot' } });
                }
            } else {
                traces_dist = [{ x: [params.r, params.r + params.t], y: [d.s1, d.s1], type: 'scatter', name: 'Hoop Approx', line: { color: '#00e5a0', width: 2 } }];
            }
            Plotly.react('plot-pv-dist', traces_dist, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Radius (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Stress (MPa)' }) }), PLOTLY_CONFIG);

            var m = d.mohr;
            var mohrLayout = Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Normal Stress σ (MPa)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Shear Stress τ (MPa)', scaleanchor: 'x', scaleratio: 1 }) });
            let traces_mohr = [
                generateCircleData(m.c13, m.r13, 'rgba(0, 229, 160, 0.25)', 'σ₁ - σ₃'),
                generateCircleData(m.c12, m.r12, 'rgba(99, 102, 241, 0.5)', 'σ₁ - σ₂'),
                generateCircleData(m.c23, m.r23, 'rgba(0, 229, 160, 0.5)', 'σ₂ - σ₃')
            ];
            Plotly.react('plot-pv-mohr', traces_mohr, mohrLayout, PLOTLY_CONFIG);
        } catch (e) { console.error(e); showError('pressure'); } finally { setButtonLoading(btn, false, 'Analyze Vessel in Python'); }
    }

    // ==========================================
    // 6. THERMAL STRESS LABORATORY
    // ==========================================
    async function updateThermalApplication() {
        var params = { dt: val('th-dt'), L: val('th-l'), alpha: val('th-alpha') * 1e-6, E: val('th-e') * 1e9, constraint: $('th-constraint').value };
        var btn = $('calculate-thermal-btn'); setButtonLoading(btn, true, 'Analyze Thermal State in Python');
        try {
            var d = await apiPost('/api/analyze_thermal', params, 'thermal');
            setText('th-sig', d.sigma.toFixed(2)); setText('th-del', d.delta.toFixed(2));
            
            let traces_def = [{ x: d.x, y: d.deflection, type: 'scatter', fill: 'tozeroy', line: { color: '#ff4d6a', width: 2 }, fillcolor: 'rgba(255, 77, 106, 0.15)' }];
            if (baselines['thermal']) {
                let bd = baselines['thermal'];
                traces_def.push({ x: bd.x, y: bd.deflection, type: 'scatter', line: { color: '#ff4d6a', width: 2, dash:'dot' } });
            }

            Plotly.react('plot-th-def', traces_def, Object.assign({}, PLOTLY_LAYOUT, { xaxis: Object.assign({}, PLOTLY_LAYOUT.xaxis, { title: 'Length (m)' }), yaxis: Object.assign({}, PLOTLY_LAYOUT.yaxis, { title: 'Deformation (mm)' }) }), PLOTLY_CONFIG);
        } catch (e) { console.error(e); showError('thermal'); } finally { setButtonLoading(btn, false, 'Analyze Thermal State in Python'); }
    }

    
    // ==========================================
    // 7. SECTION PROPERTIES LABORATORY
    // ==========================================
    async function updateSectionApplication() {
        var params = { b: val('sec-b'), h: val('sec-h'), t: val('sec-t'), shape: 'c-channel' };
        var btn = ; setButtonLoading(btn, true, 'Analyze Section');
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
        var params = { E: val('buck-e') * 1e9, Sy: val('buck-sy') * 1e6, L: val('buck-l'), I: val('buck-i') * 1e-8, A: val('buck-a') * 1e-4, bc: .value };
        var btn = ; setButtonLoading(btn, true, 'Analyze Buckling');
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

    function initResizeHandler() {
        var plotDivs = ['plotly-container', 'plot-sfd', 'plot-bmd', 'plot-def', 'heatmap-container', 'plot-torsion-twist', 'plot-torsion-stress', 'plot-axial-stress', 'plot-axial-def', 'plot-pv-mohr', 'plot-pv-dist', 'plot-th-def', 'plot-sec-layout', 'plot-buck-mode'];
        window.addEventListener('resize', () => {
            plotDivs.forEach(id => { var el = $(id); if (el && el.getBoundingClientRect().width > 0) Plotly.Plots.resize(el); });
        });
    }

    function initButtons() {
        $('calculate-btn').addEventListener('click', updatePointApplication);
        $('calculate-beam-btn').addEventListener('click', updateBeamApplication);
        $('calculate-torsion-btn').addEventListener('click', updateTorsionApplication);
        $('calculate-axial-btn').addEventListener('click', updateAxialApplication);
        $('calculate-pv-btn').addEventListener('click', updatePressureApplication);
        $('calculate-thermal-btn').addEventListener('click', updateThermalApplication);
        .addEventListener('click', updateSectionApplication);
        .addEventListener('click', updateBucklingApplication);
    }

    window.addEventListener('load', function () {
        initTabs();
        initButtons();
        initExports();
        initPointSymmetrySync();
        initResizeHandler();
        initThreeJS();
        updatePointApplication();
    });

})();
