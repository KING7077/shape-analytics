/**
 * app.js
 * Main application logic for the Solid Mechanics Web App
 */

// --- TAB NAVIGATION ---
const tabs = ['point', 'beam', 'torsion', 'axial', 'pressure', 'thermal'];

function switchTab(activeTab) {
    tabs.forEach(tab => {
        document.getElementById(`view-${tab}`).style.display = (tab === activeTab) ? 'flex' : 'none';
        const btn = document.getElementById(`tab-${tab}`);
        if (tab === activeTab) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    
    // Trigger resize to fix Plotly canvases in newly un-hidden tabs
    window.dispatchEvent(new Event('resize')); 
    
    // Call the specific update function to draw initial plots if not drawn
    if(activeTab === 'beam') updateBeamApplication();
    if(activeTab === 'torsion') updateTorsionApplication();
    if(activeTab === 'axial') updateAxialApplication();
    if(activeTab === 'pressure') updatePressureApplication();
    if(activeTab === 'thermal') updateThermalApplication();
}

// --- Plotly Config ---
const plotlyConfig = { responsive: true, displayModeBar: false };
const plotlyLayout = {
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#94a3b8' }, margin: { t: 40, r: 20, l: 50, b: 40 },
    xaxis: { gridcolor: 'rgba(255,255,255,0.1)' }, yaxis: { gridcolor: 'rgba(255,255,255,0.1)' },
    autosize: true
};

function generateCircleData(cx, r, color, name) {
    const theta = [];
    for(let i=0; i<100; i++) theta.push((i/99)*Math.PI);
    const x = theta.map(t => cx + r * Math.cos(t));
    const y = theta.map(t => r * Math.sin(t));
    return { x: [...x, ...x.slice().reverse()], y: [...y, ...y.map(()=>0)], fill: 'toself', fillcolor: color, line: { color: color, width: 2 }, name: name, type: 'scatter', hoverinfo: 'none' };
}

// ==========================================
// 1. POINT STRESS LABORATORY
// ==========================================
const pointInputs = {
    s11: document.getElementById('s11'), s12: document.getElementById('s12'), s13: document.getElementById('s13'),
    s21: document.getElementById('s21'), s22: document.getElementById('s22'), s23: document.getElementById('s23'),
    s31: document.getElementById('s31'), s32: document.getElementById('s32'), s33: document.getElementById('s33'),
};

let scene, camera, renderer, cube, arrowsGroup, axesGroup;
let isDragging = false, previousMousePosition = { x: 0, y: 0 };

function initThreeJS() {
    const container = document.getElementById('three-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(2, 2, 5);
    camera.lookAt(0, 0, 0);
    
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    scene.add(new THREE.AxesHelper(1.5));
    
    const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const mats = [
        new THREE.MeshLambertMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.7 }),
        new THREE.MeshLambertMaterial({ color: 0x1e3a8a, transparent: true, opacity: 0.7 }),
        new THREE.MeshLambertMaterial({ color: 0x10b981, transparent: true, opacity: 0.7 }),
        new THREE.MeshLambertMaterial({ color: 0x064e3b, transparent: true, opacity: 0.7 }),
        new THREE.MeshLambertMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.7 }),
        new THREE.MeshLambertMaterial({ color: 0x4c1d95, transparent: true, opacity: 0.7 }),
    ];
    cube = new THREE.Mesh(geo, mats);
    cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff })));
    arrowsGroup = new THREE.Group(); cube.add(arrowsGroup);
    axesGroup = new THREE.Group(); cube.add(axesGroup);
    scene.add(cube);

    renderer.domElement.addEventListener('mousedown', () => { isDragging = true; });
    renderer.domElement.addEventListener('mouseup', () => { isDragging = false; });
    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/180 * (e.offsetY - previousMousePosition.y) * 0.5, Math.PI/180 * (e.offsetX - previousMousePosition.x) * 0.5, 0, 'XYZ'));
            cube.quaternion.multiplyQuaternions(q, cube.quaternion);
        }
        previousMousePosition = { x: e.offsetX, y: e.offsetY };
    });

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
    animate();
}

function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }

async function updateApplication() {
    pointInputs.s21.value = pointInputs.s12.value; pointInputs.s31.value = pointInputs.s13.value; pointInputs.s32.value = pointInputs.s23.value;
    const matrix = [
        [parseFloat(pointInputs.s11.value), parseFloat(pointInputs.s12.value), parseFloat(pointInputs.s13.value)],
        [parseFloat(pointInputs.s21.value), parseFloat(pointInputs.s22.value), parseFloat(pointInputs.s23.value)],
        [parseFloat(pointInputs.s31.value), parseFloat(pointInputs.s32.value), parseFloat(pointInputs.s33.value)]
    ];
    
    document.getElementById('calculate-btn').innerText = "Computing...";
    try {
        const response = await fetch('http://127.0.0.1:8000/api/analyze_tensor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matrix: matrix }) });
        const data = await response.json();
        
        document.getElementById('p-s1').innerText = data.principal_stresses[0].toFixed(2);
        document.getElementById('p-s2').innerText = data.principal_stresses[1].toFixed(2);
        document.getElementById('p-s3').innerText = data.principal_stresses[2].toFixed(2);
        document.getElementById('t-max').innerText = data.mohr.tMax.toFixed(2);
        
        const mohrLayout = { ...plotlyLayout, xaxis: { ...plotlyLayout.xaxis, title: 'Normal Stress σ' }, yaxis: { ...plotlyLayout.yaxis, title: 'Shear Stress τ', scaleanchor: 'x', scaleratio: 1 } };
        Plotly.react('plotly-container', [
            generateCircleData(data.mohr.c13, data.mohr.r13, 'rgba(59, 130, 246, 0.4)', 'σ1 - σ3'),
            generateCircleData(data.mohr.c12, data.mohr.r12, 'rgba(30, 41, 59, 1)', 'σ1 - σ2'),
            generateCircleData(data.mohr.c23, data.mohr.r23, 'rgba(30, 41, 59, 1)', 'σ2 - σ3')
        ], mohrLayout, plotlyConfig);
        
        // Update 3D Arrows
        while(arrowsGroup.children.length > 0) arrowsGroup.remove(arrowsGroup.children[0]); 
        const addArr = (dx,dy,dz, ox,oy,oz, col) => { if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz) > 0) arrowsGroup.add(new THREE.ArrowHelper(new THREE.Vector3(dx,dy,dz).normalize(), new THREE.Vector3(ox,oy,oz), 0.5, col, 0.2, 0.1)); }
        if(matrix[0][0]!==0) addArr(matrix[0][0]>0?1:-1,0,0, 0.75,0,0, 0xff0000);
        if(matrix[1][1]!==0) addArr(0,matrix[1][1]>0?1:-1,0, 0,0.75,0, 0x00ff00);
        if(matrix[2][2]!==0) addArr(0,0,matrix[2][2]>0?1:-1, 0,0,0.75, 0x0000ff);

        // Update Principal Axes
        while(axesGroup.children.length > 0) axesGroup.remove(axesGroup.children[0]); 
        for(let i=0; i<3; i++) {
            const p = new THREE.Vector3(data.eigenvectors[0][i], data.eigenvectors[1][i], data.eigenvectors[2][i]).normalize();
            axesGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p.clone().multiplyScalar(1.5), p.clone().multiplyScalar(-1.5)]), new THREE.LineBasicMaterial({ color: [0xffaaaa, 0xaaffaa, 0xaaaaff][i], linewidth: 3 })));
        }
    } catch(e) { console.error(e); }
    finally { document.getElementById('calculate-btn').innerText = "Calculate via Python Math Engine"; }
}
document.getElementById('calculate-btn').addEventListener('click', updateApplication);
pointInputs.s12.addEventListener('input', () => { pointInputs.s21.value = pointInputs.s12.value; });
pointInputs.s13.addEventListener('input', () => { pointInputs.s31.value = pointInputs.s13.value; });
pointInputs.s23.addEventListener('input', () => { pointInputs.s32.value = pointInputs.s23.value; });

// ==========================================
// 2. BEAM FAILURE LABORATORY
// ==========================================
async function updateBeamApplication() {
    const p = {
        E: parseFloat(document.getElementById('beam-e').value) * 1e9,
        L: parseFloat(document.getElementById('beam-l').value),
        b: parseFloat(document.getElementById('beam-w').value),
        h: parseFloat(document.getElementById('beam-h').value),
        load_mag: parseFloat(document.getElementById('beam-p').value) * 1000,
        support_type: document.getElementById('beam-support').value,
        load_type: document.getElementById('beam-load-type').value
    };
    const Sy = parseFloat(document.getElementById('beam-sy').value) * 1e6;
    document.getElementById('hint-sy').innerText = document.getElementById('beam-sy').value;
    const btn = document.getElementById('calculate-beam-btn'); btn.innerText = "Analyzing in Python...";
    try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze_beam', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
        const d = await res.json();
        
        Plotly.react('plot-sfd', [{x: d.x, y: d.V, type: 'scatter', line: {color: '#ef4444'}}], { ...plotlyLayout, yaxis: {title: 'Shear (kN)'} }, plotlyConfig);
        Plotly.react('plot-bmd', [{x: d.x, y: d.M, type: 'scatter', line: {color: '#3b82f6'}}], { ...plotlyLayout, yaxis: {title: 'Moment (kNm)'} }, plotlyConfig);
        Plotly.react('plot-def', [{x: d.x, y: d.deflection, type: 'scatter', line: {color: '#10b981'}}], { ...plotlyLayout, yaxis: {title: 'Deflection (mm)'}, xaxis:{title:'Length X (m)'} }, plotlyConfig);
        Plotly.react('heatmap-container', [{z: d.heatmap, x: d.x, y: d.y_cross, type: 'heatmap', colorscale: 'Jet'}], { ...plotlyLayout, xaxis: {title: 'Length X (m)'}, yaxis: {title:'Height Y (m)'} }, plotlyConfig);
        
        const stat = document.getElementById('failure-flag');
        document.getElementById('max-vm-stress').innerText = d.max_vm.toFixed(2);
        stat.innerText = d.max_vm >= (Sy/1e6) ? "YIELD FAILURE" : "SAFE";
        stat.style.color = d.max_vm >= (Sy/1e6) ? "#ef4444" : "#10b981";
    } catch(e) { console.error(e); } finally { btn.innerText = "Analyze Failure Criteria"; }
}
document.getElementById('calculate-beam-btn').addEventListener('click', updateBeamApplication);

// ==========================================
// 3. SHAFT TORSION LABORATORY
// ==========================================
async function updateTorsionApplication() {
    const p = {
        T: parseFloat(document.getElementById('tor-t').value) * 1000,
        L: parseFloat(document.getElementById('tor-l').value),
        G: parseFloat(document.getElementById('tor-g').value) * 1e9,
        R: parseFloat(document.getElementById('tor-r').value),
        ri: parseFloat(document.getElementById('tor-ri').value)
    };
    try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze_torsion', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
        const d = await res.json();
        document.getElementById('tor-tau').innerText = d.tau_max.toFixed(2);
        document.getElementById('tor-phi').innerText = d.phi_max_deg.toFixed(2);
        
        Plotly.react('plot-torsion-twist', [{x: d.x, y: d.phi, type: 'scatter', line: {color: '#8b5cf6'}}], { ...plotlyLayout, xaxis:{title:'Length (m)'}, yaxis:{title:'Angle (deg)'} }, plotlyConfig);
        Plotly.react('plot-torsion-stress', [{x: d.r, y: d.tau, type: 'scatter', line: {color: '#ef4444'}}], { ...plotlyLayout, xaxis:{title:'Radius (m)'}, yaxis:{title:'Shear Stress (MPa)'} }, plotlyConfig);
    } catch(e) { console.error(e); }
}
document.getElementById('calculate-torsion-btn').addEventListener('click', updateTorsionApplication);

// ==========================================
// 4. AXIAL LOADING LABORATORY
// ==========================================
async function updateAxialApplication() {
    const p = {
        P: parseFloat(document.getElementById('ax-p').value) * 1000,
        L: parseFloat(document.getElementById('ax-l').value),
        A: parseFloat(document.getElementById('ax-a').value) / 10000, // cm2 to m2
        E: parseFloat(document.getElementById('ax-e').value) * 1e9
    };
    try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze_axial', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
        const d = await res.json();
        document.getElementById('ax-sig').innerText = d.sigma_max.toFixed(2);
        document.getElementById('ax-del').innerText = d.delta_max.toFixed(2);
        
        Plotly.react('plot-axial-stress', [{x: d.x, y: d.sigma, type: 'scatter', line: {color: '#f59e0b'}}], { ...plotlyLayout, xaxis:{title:'Length (m)'}, yaxis:{title:'Stress (MPa)'} }, plotlyConfig);
        Plotly.react('plot-axial-def', [{x: d.x, y: d.delta, type: 'scatter', line: {color: '#10b981'}}], { ...plotlyLayout, xaxis:{title:'Length (m)'}, yaxis:{title:'Elongation (mm)'} }, plotlyConfig);
    } catch(e) { console.error(e); }
}
document.getElementById('calculate-axial-btn').addEventListener('click', updateAxialApplication);

// ==========================================
// 5. PRESSURE VESSEL LABORATORY
// ==========================================
async function updatePressureApplication() {
    const p = {
        p: parseFloat(document.getElementById('pv-p').value) * 1e6,
        r: parseFloat(document.getElementById('pv-r').value),
        t: parseFloat(document.getElementById('pv-t').value) / 1000, // mm to m
        type: document.getElementById('pv-type').value
    };
    try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze_pressure_vessel', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
        const d = await res.json();
        document.getElementById('pv-s1').innerText = d.s1.toFixed(2);
        document.getElementById('pv-s2').innerText = d.s2.toFixed(2);
        document.getElementById('pv-tmax').innerText = d.tmax.toFixed(2);
        
        const m = d.mohr;
        const mohrLayout = { ...plotlyLayout, xaxis: { title: 'Normal Stress σ' }, yaxis: { title: 'Shear Stress τ', scaleanchor: 'x', scaleratio: 1 } };
        Plotly.react('plot-pv-mohr', [
            generateCircleData(m.c13, m.r13, 'rgba(59, 130, 246, 0.4)', 'σ1 - σ3'),
            generateCircleData(m.c12, m.r12, 'rgba(30, 41, 59, 1)', 'σ1 - σ2'),
            generateCircleData(m.c23, m.r23, 'rgba(30, 41, 59, 1)', 'σ2 - σ3')
        ], mohrLayout, plotlyConfig);
    } catch(e) { console.error(e); }
}
document.getElementById('calculate-pv-btn').addEventListener('click', updatePressureApplication);

// ==========================================
// 6. THERMAL STRESS LABORATORY
// ==========================================
async function updateThermalApplication() {
    const p = {
        dt: parseFloat(document.getElementById('th-dt').value),
        L: parseFloat(document.getElementById('th-l').value),
        alpha: parseFloat(document.getElementById('th-alpha').value) * 1e-6,
        E: parseFloat(document.getElementById('th-e').value) * 1e9,
        constraint: document.getElementById('th-constraint').value
    };
    try {
        const res = await fetch('http://127.0.0.1:8000/api/analyze_thermal', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(p) });
        const d = await res.json();
        document.getElementById('th-sig').innerText = d.sigma.toFixed(2);
        document.getElementById('th-del').innerText = d.delta.toFixed(2);
        
        Plotly.react('plot-th-def', [{x: d.x, y: d.deflection, type: 'scatter', fill:'tozeroy', line: {color: '#ec4899'}}], { ...plotlyLayout, xaxis:{title:'Length (m)'}, yaxis:{title:'Deformation (mm)'} }, plotlyConfig);
    } catch(e) { console.error(e); }
}
document.getElementById('calculate-thermal-btn').addEventListener('click', updateThermalApplication);


// Handlers for dynamic window resizing of all Plotly divs
window.addEventListener('resize', () => {
    const divs = ['plotly-container', 'plot-sfd', 'plot-bmd', 'plot-def', 'heatmap-container', 'plot-torsion-twist', 'plot-torsion-stress', 'plot-axial-stress', 'plot-axial-def', 'plot-pv-mohr', 'plot-th-def'];
    divs.forEach(id => {
        const el = document.getElementById(id);
        if(el && el.getBoundingClientRect().width > 0) Plotly.Plots.resize(el);
    });
});

window.onload = () => {
    initThreeJS();
    updateApplication();
};
