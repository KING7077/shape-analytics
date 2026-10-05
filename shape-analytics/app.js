import * as THREE from 'https://unpkg.com/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.128.0/examples/jsm/controls/OrbitControls.js';

function $(id) { return document.getElementById(id); }

// --- UI Binding & State ---
const state = {
    shape: 'cuboid', 
    dimX: 10, dimY: 5, dimZ: 5,
    cylR: 5, cylH: 10,
    sphR: 5,
    force: 100, patch: 1.0,
    tractionType: 'normal',
    vecX: 1, vecY: -1, vecZ: 0,
    mapType: 'sigma_n',
    defScale: 1
};

// Current load application point and surface normal
let loadPoint = new THREE.Vector3(0, 2.5, 0);
let loadNormal = new THREE.Vector3(0, 1, 0);

function bindSlider(id, key, suffix = "") {
    const el = $(`in-${id}`);
    const valEl = $(`val-${id}`);
    if(!el) return;
    el.addEventListener('input', (e) => {
        state[key] = parseFloat(e.target.value);
        valEl.textContent = state[key].toFixed(1) + (suffix ? ' ' + suffix : '');
        updateGeometry();
    });
}

bindSlider('dim-x', 'dimX', 'm');
bindSlider('dim-y', 'dimY', 'm');
bindSlider('dim-z', 'dimZ', 'm');
bindSlider('cyl-r', 'cylR', 'm');
bindSlider('cyl-h', 'cylH', 'm');
bindSlider('sph-r', 'sphR', 'm');
bindSlider('force', 'force', 'kN');
bindSlider('patch', 'patch', 'm');
bindSlider('def-scale', 'defScale', 'x');

$('in-shape').addEventListener('change', (e) => {
    state.shape = e.target.value;
    $('dims-cuboid').style.display = state.shape === 'cuboid' ? 'block' : 'none';
    $('dims-cylinder').style.display = state.shape === 'cylinder' ? 'block' : 'none';
    $('dims-sphere').style.display = state.shape === 'sphere' ? 'block' : 'none';
    updateGeometry(); // Resets load point
});

$('in-traction-type').addEventListener('change', (e) => {
    state.tractionType = e.target.value;
    $('vector-inputs').style.display = state.tractionType === 'arbitrary' ? 'block' : 'none';
    computeStressField();
});

['vec-x', 'vec-y', 'vec-z'].forEach(id => {
    $(`in-${id}`).addEventListener('input', (e) => {
        const key = id.replace('-', '').replace('vec', 'vec').replace('x','X').replace('y','Y').replace('z','Z');
        state[key] = parseFloat(e.target.value) || 0;
        computeStressField();
    });
});

$('in-map-type').addEventListener('change', (e) => {
    state.mapType = e.target.value;
    computeStressField();
});
$('in-def-scale').addEventListener('input', (e) => {
    state.defScale = parseFloat(e.target.value);
    $('val-def-scale').textContent = state.defScale + 'x';
    computeStressField(); 
});

// Tabs
document.querySelectorAll('[role="tab"]').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('[role="tab"]').forEach(t => t.setAttribute('aria-selected', 'false'));
        document.querySelectorAll('.sidebar-panel').forEach(p => p.setAttribute('aria-hidden', 'true'));
        tab.setAttribute('aria-selected', 'true');
        $(tab.getAttribute('aria-controls')).setAttribute('aria-hidden', 'false');
        if (tab.id === 'tab-analytics') {
            Plotly.Plots.resize('plot-stress-dist');
            Plotly.Plots.resize('plot-strain-dist');
        }
    });
});

// --- Three.js Setup ---
const container = $('three-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070d);

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(20, 15, 20);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: $('three-canvas'), antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const directional = new THREE.DirectionalLight(0xffffff, 0.8);
directional.position.set(10, 20, 10);
scene.add(directional);

const gridHelper = new THREE.GridHelper(40, 40, 0x1a2333, 0x0e1525);
gridHelper.position.y = -10;
scene.add(gridHelper);

let mesh;
let wireframe;
let geometry;
let basePositions; 
let arrowGroup = new THREE.Group();
scene.add(arrowGroup);

// --- Raycasting (Draggable Load) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDraggingLoad = false;

container.addEventListener('pointerdown', (e) => {
    // Only drag with left click + shift, or just left click if we prioritize it
    // Let's use Shift + Click to move the load point, to not conflict with OrbitControls
    if (!e.shiftKey) return; 
    
    updateMousePos(e);
    raycaster.setFromCamera(mouse, camera);
    if(mesh) {
        const intersects = raycaster.intersectObject(mesh);
        if (intersects.length > 0) {
            isDraggingLoad = true;
            controls.enabled = false; // Disable orbit while dragging
            updateLoadPoint(intersects[0]);
        }
    }
});

container.addEventListener('pointermove', (e) => {
    if (!isDraggingLoad) return;
    updateMousePos(e);
    raycaster.setFromCamera(mouse, camera);
    if(mesh) {
        // Need to intersect the base mesh, not the deformed one to keep stable normals
        // For simplicity, we just intersect current mesh
        const intersects = raycaster.intersectObject(mesh);
        if (intersects.length > 0) {
            updateLoadPoint(intersects[0]);
        }
    }
});

container.addEventListener('pointerup', (e) => {
    isDraggingLoad = false;
    controls.enabled = true;
});

function updateMousePos(e) {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function updateLoadPoint(intersect) {
    loadPoint.copy(intersect.point);
    if (intersect.face) {
        // Get normal in world space
        loadNormal.copy(intersect.face.normal).transformDirection(mesh.matrixWorld).normalize();
    }
    computeStressField();
}

function updateGeometry() {
    if (mesh) scene.remove(mesh);
    if (wireframe) scene.remove(wireframe);

    if (state.shape === 'cuboid') {
        geometry = new THREE.BoxGeometry(state.dimX, state.dimY, state.dimZ, 30, 30, 30);
    } else if (state.shape === 'cylinder') {
        geometry = new THREE.CylinderGeometry(state.cylR, state.cylR, state.cylH, 40, 20);
    } else if (state.shape === 'sphere') {
        geometry = new THREE.SphereGeometry(state.sphR, 40, 40);
    }

    const material = new THREE.MeshPhongMaterial({ 
        color: 0x8892a4, 
        vertexColors: true,
        shininess: 30,
        flatShading: false
    });
    
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    const wireMat = new THREE.LineBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.1 });
    wireframe = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), wireMat);
    scene.add(wireframe);
    
    basePositions = new Float32Array(geometry.attributes.position.array);
    
    // Reset load point to top center bounding box
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    loadPoint.set(0, bb.max.y, 0);
    loadNormal.set(0, 1, 0);
    
    resetColors();
    computeStressField();
}

function drawArrows() {
    while(arrowGroup.children.length > 0){ 
        arrowGroup.remove(arrowGroup.children[0]); 
    }
    
    const patchRadius = state.patch;
    const forceDir = new THREE.Vector3();
    
    if (state.tractionType === 'normal') {
        forceDir.copy(loadNormal).multiplyScalar(-1); // Pointing INTO the surface
    } else {
        forceDir.set(state.vecX, state.vecY, state.vecZ).normalize();
    }
    
    const mainArrow = new THREE.ArrowHelper(forceDir, loadPoint.clone().add(forceDir.clone().multiplyScalar(-3)), 3, 0xff4d6a, 0.5, 0.3);
    arrowGroup.add(mainArrow);
    
    // Ring aligned with surface normal
    const ringGeo = new THREE.RingGeometry(patchRadius - 0.1, patchRadius, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4d6a, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(loadPoint);
    ring.lookAt(loadPoint.clone().add(loadNormal)); // Align ring to face
    arrowGroup.add(ring);
}

function resetColors() {
    if(!geometry) return;
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for(let i=0; i<count; i++) {
        colors[i*3] = 0.53; colors[i*3+1] = 0.57; colors[i*3+2] = 0.64; 
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Boussinesq Approximation
function calculateBoussinesq(r, z, P) {
    const R = Math.sqrt(r*r + z*z);
    if (R < 0.1) return { sz: 0, sr: 0, trz: 0, uz: 0, ur: 0 };
    
    const nu = 0.3; 
    const E = 200e9; 
    
    const sz = (3 * P * z * z * z) / (2 * Math.PI * Math.pow(R, 5));
    const sr = (P / (2 * Math.PI)) * ( (3 * r * r * z)/Math.pow(R, 5) - ((1 - 2*nu)/(R * (R + z))) );
    const trz = (3 * P * r * z * z) / (2 * Math.PI * Math.pow(R, 5));
    
    const uz = (P * (1 + nu) / (2 * Math.PI * E * R)) * (2 * (1 - nu) + (z * z) / (R * R));
    let ur = 0;
    if(r > 0) {
        ur = (P * (1 - 2*nu) * (1 + nu)) / (2 * Math.PI * E * r) * ( (z/R) - 1 + (r*r*z)/Math.pow(R,3) );
    }
    
    return { sz, sr, trz, uz, ur };
}

function computeStressField() {
    if (!geometry || !basePositions) return;
    drawArrows();
    
    const positions = geometry.attributes.position.array;
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const P = state.force * 1000; 
    
    let maxSigmaN = 0, maxTau = 0, maxVM = 0;
    const stressValues = new Float32Array(count);
    
    // Create a local coordinate system based on loadNormal
    const nz = loadNormal.clone().multiplyScalar(-1); // Depth axis points INWARD
    const nx = new THREE.Vector3(1, 0, 0);
    if (Math.abs(nz.x) > 0.9) nx.set(0, 1, 0); // avoid singularity
    nx.cross(nz).normalize();
    const ny = new THREE.Vector3().crossVectors(nz, nx).normalize();
    
    // For arbitrary traction, project force vector onto local coords
    let forceDir = nz.clone();
    if (state.tractionType === 'arbitrary') {
        forceDir.set(state.vecX, state.vecY, state.vecZ).normalize();
    }
    const fz = forceDir.dot(nz); // Normal component
    const fTangential = new THREE.Vector3().copy(forceDir).sub(nz.clone().multiplyScalar(fz));
    const fx = fTangential.dot(nx);
    const fy = fTangential.dot(ny);
    
    for (let i = 0; i < count; i++) {
        const bx = basePositions[i*3];
        const by = basePositions[i*3+1];
        const bz = basePositions[i*3+2];
        const vertexPos = new THREE.Vector3(bx, by, bz);
        
        // Vector from load point to vertex
        const relPos = vertexPos.clone().sub(loadPoint);
        
        // Depth is projection along the inward normal
        const depth = Math.max(0.01, relPos.dot(nz)); 
        
        // In-plane radial vector
        const inPlane = relPos.clone().sub(nz.clone().multiplyScalar(depth));
        const r = inPlane.length();
        
        const res = calculateBoussinesq(r, depth, P * Math.max(0.1, Math.abs(fz))); // Approximate normal Boussinesq
        
        // Deformation
        const scale = state.defScale * 1e6; 
        
        // Radial vector direction
        let dir = new THREE.Vector3(0,0,0);
        if(r > 0) dir.copy(inPlane).normalize();
        
        // Displacement: uz along inward normal, ur radially outwards
        let disp = nz.clone().multiplyScalar(res.uz).add(dir.multiplyScalar(res.ur));
        
        // Apply tangential shear displacement approximation (Cerruti simplified)
        if (state.tractionType === 'arbitrary') {
            disp.add(nx.clone().multiplyScalar(res.uz * fx * 0.5));
            disp.add(ny.clone().multiplyScalar(res.uz * fy * 0.5));
        }
        
        disp.multiplyScalar(scale);
        
        positions[i*3]   = bx + disp.x;
        positions[i*3+1] = by + disp.y;
        positions[i*3+2] = bz + disp.z;
        
        let val = 0;
        if (state.mapType === 'sigma_n') val = res.sz;
        if (state.mapType === 'tau_max') val = res.trz;
        if (state.mapType === 'von_mises') val = Math.sqrt(res.sz*res.sz - res.sz*res.sr + res.sr*res.sr + 3*res.trz*res.trz);
        if (state.mapType === 'strain_mag') val = val / 200e9; 
        
        val = val / 1e6; 
        stressValues[i] = val;
        
        if(res.sz/1e6 > maxSigmaN) maxSigmaN = res.sz/1e6;
        if(res.trz/1e6 > maxTau) maxTau = res.trz/1e6;
        const vm = Math.sqrt(res.sz*res.sz - res.sz*res.sr + res.sr*res.sr + 3*res.trz*res.trz)/1e6;
        if(vm > maxVM) maxVM = vm;
    }
    
    $('out-sigma-max').innerHTML = `${maxSigmaN.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-tau-max').innerHTML = `${maxTau.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-vm-max').innerHTML = `${maxVM.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-eps-max').innerHTML = `${(maxVM * 1e6 / 200e9 * 1e6).toFixed(1)} <span class="unit">με</span>`;
    
    const maxVal = Math.max(...stressValues);
    for (let i = 0; i < count; i++) {
        const norm = maxVal > 0 ? Math.min(1.0, Math.max(0, stressValues[i] / (maxVal * 0.5))) : 0; 
        let rv=0, gv=0, bv=0;
        if (norm < 0.25) { bv=1; gv=4*norm; }
        else if (norm < 0.5) { bv=1-4*(norm-0.25); gv=1; }
        else if (norm < 0.75) { rv=4*(norm-0.5); gv=1; }
        else { rv=1; gv=1-4*(norm-0.75); }
        
        colors[i*3] = rv;
        colors[i*3+1] = gv;
        colors[i*3+2] = bv;
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    if(wireframe) {
        wireframe.geometry.dispose();
        wireframe.geometry = new THREE.WireframeGeometry(geometry);
    }
    
    updateAnalyticsPlots();
}

$('btn-compute').addEventListener('click', computeStressField);

const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        const {width, height} = entry.contentRect;
        if(width > 0 && height > 0) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
        }
    }
});
resizeObserver.observe(container);

function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    renderer.render(scene, camera);
}
updateGeometry();
animate();

const layoutDark = {
    paper_bgcolor: '#0e1525', plot_bgcolor: '#0e1525',
    font: { color: '#8892a4' }, margin: { t: 30, r: 20, b: 40, l: 50 },
    xaxis: { gridcolor: '#1a2333', zerolinecolor: '#334155' },
    yaxis: { gridcolor: '#1a2333', zerolinecolor: '#334155' }
};

function updateAnalyticsPlots() {
    const rVals = [];
    const szVals = [];
    const tauVals = [];
    
    for(let i=0; i<=20; i++) {
        const r = i * 0.5;
        const res = calculateBoussinesq(r, 2.0, state.force * 1000); 
        rVals.push(r);
        szVals.push(res.sz / 1e6);
        tauVals.push(res.trz / 1e6);
    }
    
    Plotly.react('plot-stress-dist', [
        { x: rVals, y: szVals, name: 'Normal (σz)', line: { color: '#00e5a0' } },
        { x: rVals, y: tauVals, name: 'Shear (τrz)', line: { color: '#ff4d6a' } }
    ], { ...layoutDark, title: { text: 'Stress Distribution at Depth z=2m', font: { color: '#eceff4' } } });
    
    Plotly.react('plot-strain-dist', [
        { x: rVals, y: szVals.map(v => v / 2e5 * 1e6), line: { color: '#6366f1' } } 
    ], { ...layoutDark, title: { text: 'Strain Distribution (με)', font: { color: '#eceff4' } } });
}

setTimeout(updateAnalyticsPlots, 500);
