import { StemPhysics, WindModel } from './physics.js';

// --- UI Binding & State ---
const state = {
    L: 0.08, d: 3.0, E: 2.0, nu: 0.35,
    a: 30, b: 50,
    F0: 0.03, freq: 2.0, gust: 0.15, speed: 1.0,
    rho: 1100, zeta: 0.02, dur: 5.0,
    isPlaying: true
};

function $(id) { return document.getElementById(id); }
function bindSlider(id, key, suffix = "", multiplier = 1, callback = null) {
    const el = $(`in-${id}`);
    const valEl = $(`val-${id}`);
    el.addEventListener('input', (e) => {
        state[key] = parseFloat(e.target.value);
        let decimals = 0;
        if (el.step && el.step.includes('.')) {
            decimals = el.step.split('.')[1].length;
        }
        valEl.textContent = (state[key] * multiplier).toFixed(decimals) + (suffix ? ' ' + suffix : '');
        if (callback) callback();
    });
}

bindSlider('L', 'L', 'm');
bindSlider('d', 'd', 'mm');
bindSlider('E', 'E', 'GPa');
bindSlider('nu', 'nu', '');
bindSlider('a', 'a', 'mm', 1, updateLeafGeometry);
bindSlider('b', 'b', 'mm', 1, updateLeafGeometry);
bindSlider('F0', 'F0', 'N');
bindSlider('freq', 'freq', 'Hz');
bindSlider('gust', 'gust', '');
bindSlider('speed', 'speed', 'x');
bindSlider('rho', 'rho', 'kg/m³');
bindSlider('zeta', 'zeta', '');
bindSlider('dur', 'dur', 's');

$('pre-small').onclick = () => setLeafParams(15, 25);
$('pre-medium').onclick = () => setLeafParams(30, 50);
$('pre-large').onclick = () => setLeafParams(50, 80);

function setLeafParams(a, b) {
    $('in-a').value = a; $('in-b').value = b;
    $('in-a').dispatchEvent(new Event('input'));
    $('in-b').dispatchEvent(new Event('input'));
}

$('btn-play').onclick = () => {
    state.isPlaying = !state.isPlaying;
    $('btn-play').textContent = state.isPlaying ? 'Pause' : 'Play';
};

// Tabs
document.querySelectorAll('[role="tab"]').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('[role="tab"]').forEach(t => t.setAttribute('aria-selected', 'false'));
        document.querySelectorAll('[role="tabpanel"]').forEach(p => p.setAttribute('aria-hidden', 'true'));
        tab.setAttribute('aria-selected', 'true');
        $(tab.getAttribute('aria-controls')).setAttribute('aria-hidden', 'false');
        if (tab.id === 'tab-analysis') {
            Plotly.Plots.resize('plot-history');
            Plotly.Plots.resize('plot-deflection');
            Plotly.Plots.resize('plot-moment');
            Plotly.Plots.resize('plot-stress');
        }
    });
});

// --- Three.js Setup ---
const container = $('three-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070d);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10);
camera.position.set(0.25, 0.15, 0.25);
camera.lookAt(0.08, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.id = 'three-canvas';
container.appendChild(renderer.domElement);

const gridHelper = new THREE.GridHelper(0.3, 30, 0x1a2333, 0x0e1525);
gridHelper.position.y = -0.05;
scene.add(gridHelper);

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);
const directional = new THREE.DirectionalLight(0xffffff, 1.0);
directional.position.set(1, 2, 1);
scene.add(directional);


const stemMat = new THREE.MeshPhongMaterial({ color: 0x5a8c42, shininess: 10 });
let stemMesh = new THREE.Mesh(new THREE.BufferGeometry(), stemMat);
scene.add(stemMesh);

let leafMesh;
function updateLeafGeometry() {
    if (leafMesh) scene.remove(leafMesh);
    const shape = new THREE.Shape();
    const segments = 32;
    const a = state.a / 1000;
    const b = state.b / 1000;
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = b * Math.cos(theta) + b; // base at x=0
        const y = a * Math.sin(theta); // width along y (will become z after rotation)
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2); // Make it flat horizontally (X-Z plane)
    
    const material = new THREE.MeshPhongMaterial({ color: 0x2d8c4e, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    leafMesh = new THREE.Mesh(geometry, material);
    
    // Add central vein
    const veinGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(2*b, 0, 0)]);
    const veinMat = new THREE.LineBasicMaterial({ color: 0x1a5c30 });
    leafMesh.add(new THREE.Line(veinGeo, veinMat));
    scene.add(leafMesh);
}
updateLeafGeometry();

// Resize handler
const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        const width = entry.contentRect.width;
        const height = entry.contentRect.height;
        if (width > 0 && height > 0) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false); // false to prevent overriding canvas CSS if set
        }
    }
});
resizeObserver.observe(container);

// --- Physics & Animation ---
const physics = new StemPhysics(getPhysicsParams());
const wind = new WindModel(getWindParams());

function getPhysicsParams() {
    return { stemLength: state.L, stemDiameter: state.d / 1000, youngsModulus: state.E * 1e9, poissonsRatio: state.nu, nNodes: 24 };
}
function getWindParams() {
    return { windStrength: state.F0, windFrequency: state.freq, gustIntensity: state.gust, leafB: state.b / 1000 };
}

let time = 0;
let lastTimestamp = 0;
function animate(timestamp) {
    requestAnimationFrame(animate);
    const dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    
    if (state.isPlaying) {
        time += dt * state.speed;
        
        physics.update(getPhysicsParams());
        wind.update(getWindParams());
        
        const Fy = wind.getForceY(time);
        const Fz = wind.getForceZ(time);
        const T = wind.getTorque(time);
        
        const nodes = physics.solve(Fy, Fz, T);
        
        // Update Stem
        const points = nodes.map(n => new THREE.Vector3(n.x, n.y, n.z));
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, 20, state.d/1000/2, 8, false);
        stemMesh.geometry.dispose();
        stemMesh.geometry = tubeGeo;
        
        // Update Leaf
        const tip = nodes[nodes.length - 1];
        leafMesh.position.set(tip.x, tip.y, tip.z);
        const euler = new THREE.Euler(tip.twist, -tip.slopeZ, tip.slopeY, 'ZYX');
        leafMesh.quaternion.setFromEuler(euler);
        
        // Update Dashboard
        $('out-defl-y').innerHTML = `${(tip.y*1000).toFixed(2)} <span class="unit">mm</span>`;
        $('out-defl-z').innerHTML = `${(tip.z*1000).toFixed(2)} <span class="unit">mm</span>`;
        $('out-twist').innerHTML = `${(tip.twist*180/Math.PI).toFixed(1)} <span class="unit">°</span>`;
        const F_mag = Math.sqrt(Fy*Fy + Fz*Fz);
        $('out-sigma').innerHTML = `${(physics.maxBendingStress(F_mag)/1e6).toFixed(1)} <span class="unit">MPa</span>`;
    }
    
    // Auto-orbit camera slowly if playing
    if (state.isPlaying) {
        camera.position.x = 0.08 + 0.25 * Math.cos(time * 0.1);
        camera.position.z = 0.25 * Math.sin(time * 0.1);
        camera.lookAt(0.08, 0, 0);
    }
    
    renderer.render(scene, camera);
}
requestAnimationFrame((t) => { lastTimestamp = t; animate(t); });

// --- Analysis Tab ---
const layoutDark = {
    paper_bgcolor: '#0e1525', plot_bgcolor: '#0e1525',
    font: { color: '#8892a4' },
    margin: { t: 30, r: 20, b: 40, l: 50 },
    xaxis: { gridcolor: '#1a2333', zerolinecolor: '#334155' },
    yaxis: { gridcolor: '#1a2333', zerolinecolor: '#334155' }
};

$('btn-analyze').onclick = async () => {
    $('btn-analyze').textContent = "Analyzing...";
    $('btn-analyze').disabled = true;
    try {
        const payload = {
            L: state.L, d: state.d, E: state.E * 1e9, nu: state.nu,
            rho: state.rho, zeta: state.zeta, leaf_a: state.a, leaf_b: state.b,
            F0: state.F0, freq: state.freq, gust: state.gust, duration: state.dur
        };
        // Fix up parameter scales for the API
        payload.d /= 1000; 
        payload.leaf_a /= 1000;
        payload.leaf_b /= 1000;

        const res = await fetch('http://127.0.0.1:8001/api/analyze_dynamic', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        $('res-fbend').textContent = `${data.natural_freq_bending.toFixed(1)} Hz`;
        $('res-ftor').textContent = `${data.natural_freq_torsion.toFixed(1)} Hz`;
        $('res-ratio').textContent = `${data.freq_ratio.toFixed(2)}`;
        $('res-warning').style.display = data.resonance_warning ? 'block' : 'none';
        
        Plotly.react('plot-history', [
            { x: data.t, y: data.tip_total, name: 'Total Defl', line: { color: '#00e5a0' } }
        ], { ...layoutDark, title: { text: 'Tip Displacement History (mm)', font: { color: '#eceff4' } } });
        
        Plotly.react('plot-deflection', [
            { x: data.x, y: data.deflection, line: { color: '#6366f1' } }
        ], { ...layoutDark, title: { text: 'Peak Deflection Curve v(X) [mm]', font: { color: '#eceff4' } } });
        
        Plotly.react('plot-moment', [
            { x: data.x, y: data.moment, line: { color: '#ff4d6a' } }
        ], { ...layoutDark, title: { text: 'Peak Bending Moment (N·m)', font: { color: '#eceff4' } } });
        
        Plotly.react('plot-stress', [
            { x: data.x, y: data.sigma_bend, name: 'Bending', line: { color: '#6366f1' } },
            { x: [0, data.x[data.x.length-1]], y: [data.tau_tor_max, data.tau_tor_max], name: 'Max Torsion', line: { color: '#ff4d6a', dash: 'dash' } }
        ], { ...layoutDark, title: { text: 'Peak Stresses (MPa)', font: { color: '#eceff4' } } });
        
    } catch (e) {
        console.error(e);
        alert("Analysis failed. Is the backend running?");
    } finally {
        $('btn-analyze').textContent = "Run Analysis";
        $('btn-analyze').disabled = false;
    }
};
