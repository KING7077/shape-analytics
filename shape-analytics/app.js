

function $(id) { return document.getElementById(id); }

// --- UI Binding & State ---
const state = {
    shape: 'cuboid', 
    dimX: 10, dimY: 5, dimZ: 5,
    cylR: 5, cylH: 10,
    sphR: 5,
    force: 100, brushSize: 1.0,
    tractionType: 'normal',
    vecX: 1, vecY: -1, vecZ: 0,
    mapType: 'sigma_n',
    defScale: 1,
    material: 200e9,
    interactionMode: 'orbit'
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

function bindParam(id, key, suffix = "") {
    const el = $(`in-${id}`);
    const valEl = $(`val-${id}`);
    if(!el) return;
    el.addEventListener('input', (e) => {
        state[key] = parseFloat(e.target.value);
        valEl.textContent = state[key].toFixed(1) + (suffix ? ' ' + suffix : '');
        computeStressField();
    });
}

function bindSilentParam(id, key, suffix = "") {
    const el = $(`in-${id}`);
    const valEl = $(`val-${id}`);
    if(!el) return;
    el.addEventListener('input', (e) => {
        state[key] = parseFloat(e.target.value);
        valEl.textContent = state[key].toFixed(1) + (suffix ? ' ' + suffix : '');
    });
}

bindSlider('dim-x', 'dimX', 'm');
bindSlider('dim-y', 'dimY', 'm');
bindSlider('dim-z', 'dimZ', 'm');
bindSlider('cyl-r', 'cylR', 'm');
bindSlider('cyl-h', 'cylH', 'm');
bindSlider('sph-r', 'sphR', 'm');

const elForce = $('in-force');
const elForceNum = $('in-force-num');
if (elForce && elForceNum) {
    elForce.addEventListener('input', (e) => {
        state.force = parseFloat(e.target.value) || 0;
        elForceNum.value = state.force;
        computeStressField();
    });
    elForceNum.addEventListener('input', (e) => {
        state.force = parseFloat(e.target.value) || 0;
        elForce.value = state.force;
        computeStressField();
    });
}

bindSilentParam('brush-size', 'brushSize', 'm');
bindParam('def-scale', 'defScale', 'x');

$('in-interaction-mode').addEventListener('change', (e) => {
    state.interactionMode = e.target.value;
    const isInteract = state.interactionMode === 'paint' || state.interactionMode === 'erase';
    controls.enabled = !isInteract; 
    $('brush-size-container').style.display = isInteract ? 'block' : 'none';
    $('btn-clear-paint').style.display = isInteract ? 'block' : 'none';
    if (paintMesh) paintMesh.visible = isInteract;
});

let paintedVertexIndices = new Set();
let paintMesh = null;

$('btn-clear-paint').addEventListener('click', () => {
    paintedVertexIndices.clear();
    updatePaintedVisuals();
    if(geometry) {
        geometry.computeBoundingBox();
        loadPoint.set(0, geometry.boundingBox.max.y, 0);
    }
    loadNormal.set(0, 1, 0);
    computeStressField();
});

$('in-material').addEventListener('change', (e) => {
    state.material = parseFloat(e.target.value);
    computeStressField();
});

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

const controls = new THREE.OrbitControls(camera, renderer.domElement);
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

// --- Raycasting & Painting ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isPainting = false;

container.addEventListener('pointerdown', (e) => {
    if (state.interactionMode !== 'paint' && state.interactionMode !== 'erase') return;
    if (e.button !== 0) return; // left click only
    isPainting = true;
    updateMousePos(e);
    handlePaint();
});

container.addEventListener('pointermove', (e) => {
    if (!isPainting) return;
    updateMousePos(e);
    handlePaint();
});

container.addEventListener('pointerup', (e) => {
    if (isPainting) {
        isPainting = false;
        finalizePaintArea();
    }
});

function updateMousePos(e) {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function handlePaint() {
    raycaster.setFromCamera(mouse, camera);
    if (!mesh) return;
    
    const intersects = raycaster.intersectObject(mesh);
    if (intersects.length > 0) {
        const center = intersects[0].point;
        const localCenter = center.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
        
        const count = geometry.attributes.position.count;
        let changed = false;
        for (let i = 0; i < count; i++) {
            const vx = basePositions[i*3];
            const vy = basePositions[i*3+1];
            const vz = basePositions[i*3+2];
            
            const dist = Math.sqrt((vx-localCenter.x)**2 + (vy-localCenter.y)**2 + (vz-localCenter.z)**2);
            if (dist <= state.brushSize) {
                if (state.interactionMode === 'paint' && !paintedVertexIndices.has(i)) {
                    paintedVertexIndices.add(i);
                    changed = true;
                } else if (state.interactionMode === 'erase' && paintedVertexIndices.has(i)) {
                    paintedVertexIndices.delete(i);
                    changed = true;
                }
            }
        }
        
        if (changed) {
            updatePaintedVisuals();
        }
    }
}

function updatePaintedVisuals() {
    if (paintMesh) scene.remove(paintMesh);
    if (paintedVertexIndices.size === 0) return;
    
    const geom = new THREE.BufferGeometry();
    const pos = [];
    const pts = geometry.attributes.position.array; 
    
    paintedVertexIndices.forEach(idx => {
        pos.push(pts[idx*3], pts[idx*3+1], pts[idx*3+2]);
    });
    
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // Changed to bright cyan with a larger size and disabled depthTest to prevent z-fighting so it clearly pops out
    const mat = new THREE.PointsMaterial({ color: 0x00ffff, size: 0.15, sizeAttenuation: true, depthTest: false, transparent: true, opacity: 0.8 });
    paintMesh = new THREE.Points(geom, mat);
    paintMesh.renderOrder = 999; // Render on top
    paintMesh.visible = (state.interactionMode === 'paint' || state.interactionMode === 'erase');
    scene.add(paintMesh);
}

function finalizePaintArea() {
    if (paintedVertexIndices.size === 0) return;
    
    let avgX=0, avgY=0, avgZ=0;
    const normals = geometry.attributes.normal.array;
    let nx=0, ny=0, nz=0;
    
    paintedVertexIndices.forEach(idx => {
        avgX += basePositions[idx*3];
        avgY += basePositions[idx*3+1];
        avgZ += basePositions[idx*3+2];
        nx += normals[idx*3];
        ny += normals[idx*3+1];
        nz += normals[idx*3+2];
    });
    
    const count = paintedVertexIndices.size;
    avgX /= count; avgY /= count; avgZ /= count;
    
    loadPoint.set(avgX, avgY, avgZ);
    loadNormal.set(nx, ny, nz).normalize();
    if(loadNormal.lengthSq() < 0.1) loadNormal.set(0,1,0); 
    
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
    
    paintedVertexIndices.clear();
    updatePaintedVisuals();
    
    resetColors();
    computeStressField();
}

function drawArrows() {
    while(arrowGroup.children.length > 0){ 
        arrowGroup.remove(arrowGroup.children[0]); 
    }
    
    const forceDir = new THREE.Vector3();
    if (state.tractionType === 'normal') {
        forceDir.copy(loadNormal).multiplyScalar(-1); // Pointing INTO the surface
    } else {
        forceDir.set(state.vecX, state.vecY, state.vecZ).normalize();
    }
    
    const mainArrow = new THREE.ArrowHelper(forceDir, loadPoint.clone().add(forceDir.clone().multiplyScalar(-3)), 3, 0xff4d6a, 0.5, 0.3);
    arrowGroup.add(mainArrow);
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
function calculateHalfSpaceDisplacement(x, y, z, Px, Py, Pz, a, nu, E) {
    const z_eff = z + a;
    const r2 = x*x + y*y;
    const R = Math.sqrt(r2 + z_eff*z_eff);
    const Rz = R + z_eff;
    
    let ux = 0, uy = 0, uz = 0;
    
    // Normal load (Pz) - Boussinesq
    if (Math.abs(Pz) > 0) {
        const C = (Pz * (1 + nu)) / (2 * Math.PI * E * R);
        uz += C * (2 * (1 - nu) + (z_eff * z_eff) / (R * R));
        if (r2 > 0) {
            const ur = (Pz * (1 - 2*nu) * (1 + nu)) / (2 * Math.PI * E * Math.sqrt(r2)) * ((z_eff/R) - 1 + (r2*z_eff)/(R*R*R));
            ux += ur * (x / Math.sqrt(r2));
            uy += ur * (y / Math.sqrt(r2));
        }
    }
    
    // Shear load X (Px) - Cerruti
    if (Math.abs(Px) > 0) {
        const C = (Px * (1 + nu)) / (2 * Math.PI * E * R);
        ux += C * (1 + (x*x)/(R*R) + (1 - 2*nu)*(R/Rz - (x*x)/(Rz*Rz)));
        uy += C * ((x*y)/(R*R) - (1 - 2*nu)*((x*y)/(Rz*Rz)));
        uz += C * ((x*z_eff)/(R*R) + (1 - 2*nu)*(x/Rz));
    }
    
    // Shear load Y (Py) - Cerruti
    if (Math.abs(Py) > 0) {
        const C = (Py * (1 + nu)) / (2 * Math.PI * E * R);
        ux += C * ((x*y)/(R*R) - (1 - 2*nu)*((x*y)/(Rz*Rz)));
        uy += C * (1 + (y*y)/(R*R) + (1 - 2*nu)*(R/Rz - (y*y)/(Rz*Rz)));
        uz += C * ((y*z_eff)/(R*R) + (1 - 2*nu)*(y/Rz));
    }
    
    return { ux, uy, uz };
}
function calculateBoussinesq(r, z, P, a = 0) {
    // Equivalent depth to simulate distributed patch load
    const z_eff = z + a;
    const R = Math.sqrt(r*r + z_eff*z_eff);
    
    const nu = 0.3; 
    const E = state.material;
    
    const sz = (3 * P * z_eff * z_eff * z_eff) / (2 * Math.PI * Math.pow(R, 5));
    const sr = (P / (2 * Math.PI)) * ( (3 * r * r * z_eff)/Math.pow(R, 5) - ((1 - 2*nu)/(R * (R + z_eff))) );
    const trz = (3 * P * r * z_eff * z_eff) / (2 * Math.PI * Math.pow(R, 5));
    
    const uz = (P * (1 + nu) / (2 * Math.PI * E * R)) * (2 * (1 - nu) + (z_eff * z_eff) / (R * R));
    let ur = 0;
    if(r > 0) {
        ur = (P * (1 - 2*nu) * (1 + nu)) / (2 * Math.PI * E * r) * ( (z_eff/R) - 1 + (r*r*z_eff)/Math.pow(R,3) );
    }
    
    return { sz, sr, trz, uz, ur };
}

function computeStressField() {
    if (!geometry || !basePositions) return;
    drawArrows();
    
    const positions = geometry.attributes.position.array;
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const E = state.material;
    const nu = 0.3;
    const K = E / (3 * (1 - 2 * nu));
    const G = E / (2 * (1 + nu));
    
    $('out-bulk').innerHTML = `${(K / 1e9).toFixed(1)} <span class="unit">GPa</span>`;
    $('out-shear').innerHTML = `${(G / 1e9).toFixed(1)} <span class="unit">GPa</span>`;
    
    let baseDensity = 7850; 
    if (E === 70e9) baseDensity = 2700;
    else if (E === 30e9) baseDensity = 2400;
    else if (E === 3e9) baseDensity = 1200;
    else if (E === 0.01e9) baseDensity = 1100;
    
    const coverage = paintedVertexIndices.size / count;
    const blend = Math.min(1.0, Math.pow(coverage, 2)); 
    
    let totalArea = 0;
    let dx = state.dimX, dy = state.dimY, dz = state.dimZ;
    if (state.shape === 'cylinder') totalArea = 2*Math.PI*state.cylR*state.cylH + 2*Math.PI*state.cylR**2;
    else if (state.shape === 'sphere') totalArea = 4*Math.PI*state.sphR**2;
    else totalArea = 2*(dx*dy + dy*dz + dx*dz);
    
    let paintedArea = totalArea * coverage;
    if (paintedArea < 1e-6) paintedArea = 1e-6;
    
    const P = state.force * 1000; 
    let pressure = P / paintedArea;
    // For arbitrary traction, we can still use the applied pressure for surface visual mapping!
    
    // Hydrostatic strain applies only for normal inward pressure
    let eps_hydro = 0;
    if (state.tractionType === 'normal') {
        eps_hydro = -(pressure) / (3 * K);
    }
    const newDensity = baseDensity / (1 + eps_hydro*3);
    $('out-density').innerHTML = `${newDensity.toFixed(1)} <span class="unit">kg/m³</span>`;

    let maxSigmaN = 0, maxTau = 0, maxVM = 0;
    const stressValues = new Float32Array(count);
    const displacements = new Array(count);
    let maxDispMag = 0;
    
    const stiffnessRatio = state.material / 200e9; 
    const matScale = 1e6 * Math.sqrt(stiffnessRatio); 
    const scale = state.defScale * matScale; 
    
    // Compile all loads
    const allLoads = state.savedLoads ? [...state.savedLoads] : [];
    if (paintedVertexIndices.size > 0) {
        allLoads.push({
            indices: new Set(paintedVertexIndices),
            force: state.force,
            tractionType: state.tractionType,
            vecX: state.vecX, vecY: state.vecY, vecZ: state.vecZ,
            loadPoint: loadPoint.clone(),
            loadNormal: loadNormal.clone()
        });
    }

    // Precompute sample points for numerical superposition of stress
    for (const load of allLoads) {
        if (!load.sampledPoints) {
            load.sampledPoints = [];
            for (let idx of load.indices) {
                load.sampledPoints.push(new THREE.Vector3(basePositions[idx*3], basePositions[idx*3+1], basePositions[idx*3+2]));
            }
            if (load.sampledPoints.length === 0) load.sampledPoints.push(load.loadPoint.clone());
        }
    }

    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const bottomCenter = new THREE.Vector3(0, minY, 0);

    for (let i = 0; i < count; i++) {
        const bx = basePositions[i*3];
        const by = basePositions[i*3+1];
        const bz = basePositions[i*3+2];
        const vertexPos = new THREE.Vector3(bx, by, bz);
        
        let totalDisp = new THREE.Vector3();
        let maxLoadSigmaN = 0;
        let maxLoadTau = 0;
        let maxLoadVM = 0;
        
        for (const load of allLoads) {
            const nz = load.loadNormal.clone().multiplyScalar(-1); 
            let nx = new THREE.Vector3(1, 0, 0);
            if (Math.abs(nz.x) > 0.9) nx.set(0, 1, 0);
            nx.cross(nz).normalize();
            const ny = new THREE.Vector3().crossVectors(nz, nx).normalize();
            
            let forceDir = nz.clone();
            if (load.tractionType === 'arbitrary') forceDir.set(load.vecX, load.vecY, load.vecZ).normalize();
            
            const fz = forceDir.dot(nz);
            const fTangential = new THREE.Vector3().copy(forceDir).sub(nz.clone().multiplyScalar(fz));
            const fx = fTangential.dot(nx);
            const fy = fTangential.dot(ny);
            
            const relPosBC = bottomCenter.clone().sub(load.loadPoint);
            const xBC = relPosBC.dot(nx), yBC = relPosBC.dot(ny), zBC = Math.max(0.01, relPosBC.dot(nz));
            
            const coverage = load.indices.size / count;
            let totalArea = 0;
            if (state.shape === 'cylinder') totalArea = 2*Math.PI*state.cylR*state.cylH + 2*Math.PI*state.cylR**2;
            else if (state.shape === 'sphere') totalArea = 4*Math.PI*state.sphR**2;
            else totalArea = 2*(state.dimX*state.dimY + state.dimY*state.dimZ + state.dimX*state.dimZ);
            
            let paintedArea = Math.max(1e-6, totalArea * coverage);
            
            // load.force is now PRESSURE in kN/m^2. 
            // Total force in kN = Pressure * Area.
            // Total force in N = (Pressure * Area) * 1000
            const P = load.force * paintedArea * 1000;
            const Px = P * fx, Py = P * fy, Pz = P * fz;
            
            let avgDist = 0;
            load.indices.forEach(idx => {
                const px = basePositions[idx*3], py = basePositions[idx*3+1], pz = basePositions[idx*3+2];
                avgDist += Math.sqrt((px-load.loadPoint.x)**2 + (py-load.loadPoint.y)**2 + (pz-load.loadPoint.z)**2);
            });
            const effectivePatch = load.indices.size > 0 ? (avgDist / load.indices.size) : 0.5;
            
            // 1. Calculate Single-Point Displacement
            const dispValsBC = calculateHalfSpaceDisplacement(xBC, yBC, zBC, Px, Py, Pz, effectivePatch, 0.3, state.material);
            const dispCorr = nx.clone().multiplyScalar(dispValsBC.ux).add(ny.clone().multiplyScalar(dispValsBC.uy)).add(nz.clone().multiplyScalar(dispValsBC.uz));
            
            const relPosCenter = vertexPos.clone().sub(load.loadPoint);
            const xc = relPosCenter.dot(nx), yc = relPosCenter.dot(ny), zc = Math.max(0.01, relPosCenter.dot(nz));
            
            const dispVals = calculateHalfSpaceDisplacement(xc, yc, zc, Px, Py, Pz, effectivePatch, 0.3, state.material);
            let dispBouss = nx.clone().multiplyScalar(dispVals.ux).add(ny.clone().multiplyScalar(dispVals.uy)).add(nz.clone().multiplyScalar(dispVals.uz)).sub(dispCorr);
            
            // 2. Numerical Superposition for Stresses (Perfectly continuous)
            let load_sz = 0, load_sr = 0, load_trz = 0;
            const dP = P / load.sampledPoints.length;
            // Overlap the integration points by 2.5x their spacing to ensure smooth blurring
            const patch_local = (effectivePatch / Math.max(1, Math.sqrt(load.sampledPoints.length))) * 2.5;
            for (const sp of load.sampledPoints) {
                const relPos = vertexPos.clone().sub(sp);
                const x = relPos.dot(nx), y = relPos.dot(ny), z = Math.max(0.01, relPos.dot(nz));
                const r = Math.sqrt(x*x + y*y);
                const res = calculateBoussinesq(r, z, dP, patch_local);
                load_sz += res.sz;
                load_sr += res.sr;
                load_trz += res.trz;
            }
            
            let pressure = P / paintedArea;
            
            let eps_hydro = 0;
            if (load.tractionType === 'normal') eps_hydro = -pressure / (3 * K);
            
            let dispHydro = new THREE.Vector3(bx, by, bz).multiplyScalar(eps_hydro);
            dispHydro.y -= minY * eps_hydro;
            
            let blend = Math.min(1.0, coverage*coverage);
            let disp = new THREE.Vector3().lerpVectors(dispBouss, dispHydro, blend);
            disp.multiplyScalar(scale);
            
            totalDisp.add(disp);
            
            // For the fast JS visualization, we take the maximum scalar stress field instead of scalar addition.
            // Scalar addition of Von Mises values is mathematically incorrect (it creates artificial 2X hotspots at corners).
            if (load_sz > maxLoadSigmaN) maxLoadSigmaN = load_sz;
            if (load_trz > maxLoadTau) maxLoadTau = load_trz;
            let vm = Math.sqrt(load_sz*load_sz - load_sz*load_sr + load_sr*load_sr + 3*load_trz*load_trz);
            if (vm > maxLoadVM) maxLoadVM = vm;
        }
        
        displacements[i] = totalDisp;
        const mag = totalDisp.length();
        if (mag > maxDispMag) maxDispMag = mag;
        
        let val = 0;
        if (state.mapType === 'sigma_n') val = maxLoadSigmaN;
        if (state.mapType === 'tau_max') val = maxLoadTau;
        if (state.mapType === 'von_mises') val = maxLoadVM;
        if (state.mapType === 'strain_mag') val = maxLoadVM / state.material;
        
        val = val / 1e6;
        stressValues[i] = val;
        
        if (maxLoadSigmaN/1e6 > maxSigmaN) maxSigmaN = maxLoadSigmaN/1e6;
        if (maxLoadTau/1e6 > maxTau) maxTau = maxLoadTau/1e6;
        if (maxLoadVM/1e6 > maxVM) maxVM = maxLoadVM/1e6;
    }
    
    // Global clamp: If the maximum displacement exceeds a safe visual limit (e.g. 15.0 units),
    // we scale DOWN all displacements uniformly. This strictly preserves the mesh's geometric shape!
    const maxAllowedDisp = 15.0;
    const globalClampScale = maxDispMag > maxAllowedDisp ? (maxAllowedDisp / maxDispMag) : 1.0;
    
    for (let i = 0; i < count; i++) {
        const bx = basePositions[i*3];
        const by = basePositions[i*3+1];
        const bz = basePositions[i*3+2];
        const disp = displacements[i];
        
        positions[i*3]   = bx + disp.x * globalClampScale;
        positions[i*3+1] = by + disp.y * globalClampScale;
        positions[i*3+2] = bz + disp.z * globalClampScale;
    }
    
    $('out-sigma-max').innerHTML = `${maxSigmaN.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-tau-max').innerHTML = `${maxTau.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-vm-max').innerHTML = `${maxVM.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-eps-max').innerHTML = `${(maxVM * 1e6 / state.material * 1e6).toFixed(1)} <span class="unit">με</span>`;
    
    const maxVal = Math.max(...stressValues);
    for (let i = 0; i < count; i++) {
        // Normalizing strictly to maxVal (no artificial 0.5 multiplier clamping) so different loads show relative colors
        const norm = maxVal > 0 ? Math.min(1.0, Math.max(0, stressValues[i] / maxVal)) : 0; 
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
    
    if(paintMesh) {
        updatePaintedVisuals(); // refresh positions of painted dots
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


const layoutDark = {
    paper_bgcolor: '#0e1525', plot_bgcolor: '#0e1525',
    font: { color: '#8892a4' }, margin: { t: 30, r: 20, b: 40, l: 50 },
    xaxis: { gridcolor: '#1a2333', zerolinecolor: '#334155' },
    yaxis: { gridcolor: '#1a2333', zerolinecolor: '#334155' }
};

async function updateAnalyticsPlots() {
    const slicePlane = $('in-slice').value;
    const slicePos = parseFloat($('in-slice-pos').value);
    $('val-slice-pos').textContent = slicePos.toFixed(1) + ' m';
    
    let forceDir = loadNormal.clone().multiplyScalar(-1);
    if (state.tractionType === 'arbitrary') {
        forceDir.set(state.vecX, state.vecY, state.vecZ).normalize();
    }
    
    let dx = state.dimX, dy = state.dimY, dz = state.dimZ;
    if (state.shape === 'cylinder') { dx = state.cylR*2; dy = state.cylR*2; dz = state.cylH; }
    if (state.shape === 'sphere') { dx = state.sphR*2; dy = state.sphR*2; dz = state.sphR*2; }
    
    const count = geometry.attributes.position.count;
    
    // Compile all loads
    const allLoads = state.savedLoads ? [...state.savedLoads] : [];
    if (paintedVertexIndices.size > 0) {
        allLoads.push({
            indices: new Set(paintedVertexIndices),
            force: state.force,
            tractionType: state.tractionType,
            vecX: state.vecX, vecY: state.vecY, vecZ: state.vecZ,
            loadPoint: loadPoint.clone(),
            loadNormal: loadNormal.clone()
        });
    }
    
    const loadsPayload = [];
    
    for (const load of allLoads) {
        let forceDir = load.loadNormal.clone().multiplyScalar(-1);
        if (load.tractionType === 'arbitrary') {
            forceDir.set(load.vecX, load.vecY, load.vecZ).normalize();
        }
        
        const paintedPoints = [];
        load.indices.forEach(idx => {
            paintedPoints.push([
                basePositions[idx*3],
                basePositions[idx*3+1],
                basePositions[idx*3+2]
            ]);
        });
        
        if (paintedPoints.length === 0) {
            paintedPoints.push([load.loadPoint.x, load.loadPoint.y, load.loadPoint.z]);
        }
        
        const coverage = load.indices.size / count;
        let totalArea = 0;
        if (state.shape === 'cylinder') totalArea = 2*Math.PI*state.cylR*state.cylH + 2*Math.PI*state.cylR**2;
        else if (state.shape === 'sphere') totalArea = 4*Math.PI*state.sphR**2;
        else totalArea = 2*(state.dimX*state.dimY + state.dimY*state.dimZ + state.dimX*state.dimZ);
        
        let paintedArea = totalArea * coverage;
        if (paintedArea < 1e-6) paintedArea = 1e-6;
        
        loadsPayload.push({
            P: load.force * paintedArea * 1000,
            painted_points: paintedPoints,
            load_point: [load.loadPoint.x, load.loadPoint.y, load.loadPoint.z],
            load_normal: [load.loadNormal.x, load.loadNormal.y, load.loadNormal.z],
            force_dir: [forceDir.x, forceDir.y, forceDir.z],
            painted_area: paintedArea,
            coverage: coverage,
            traction_type: load.tractionType
        });
    }
    
    const reqBody = {
        loads: loadsPayload,
        slice_plane: slicePlane,
        slice_pos: slicePos,
        dim_x: dx,
        dim_y: dy,
        dim_z: dz,
        resolution: 80,
        nu: 0.3,
        material_E: state.material
    };

    try {
        const response = await fetch('http://127.0.0.1:8002/api/section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });
        
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        
        const reqBodyWithArea = { ...reqBody, coverage, totalArea };
        // We do not need to send coverage to server for now since server calculates it from painted points count, 
        // but we can pass it if we want. For now let's just stick to what we have.
        
        Plotly.react('plot-stress-dist', [{
            z: data.von_mises,
            x: data.axis1,
            y: data.axis2,
            type: 'heatmap',
            colorscale: 'Jet',
            colorbar: { title: 'MPa', titlefont: {color: '#8892a4'}, tickfont: {color: '#8892a4'} }
        }], { 
            ...layoutDark, 
            title: { text: `Internal Von Mises Field (MPa) on ${data.title1}-${data.title2} Slice`, font: { color: '#eceff4' } },
            xaxis: { ...layoutDark.xaxis, title: data.title1 },
            yaxis: { ...layoutDark.yaxis, title: data.title2, scaleanchor: 'x', scaleratio: 1 },
            height: 400
        });
        
        $('plot-strain-dist').style.display = 'none';

    } catch (e) {
        console.error("Backend physics not running or error:", e);
    }
}

$('in-slice').addEventListener('change', updateAnalyticsPlots);
$('in-slice-pos').addEventListener('input', updateAnalyticsPlots);

state.savedLoads = [];

function updateLoadListUI() {
    const list = $('load-list');
    if (state.savedLoads.length === 0) {
        list.innerHTML = "No saved loads. Active paint will be applied.";
        $('btn-clear-loads').style.display = 'none';
    } else {
        list.innerHTML = state.savedLoads.map((l, i) => `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px; background: rgba(0,0,0,0.3); padding: 4px; border-radius: 4px;">
                <span><b>Load ${i+1}</b> (${l.indices.size} pts)</span>
                <div style="display:flex; gap: 5px; align-items: center;">
                    <input type="number" min="0" step="10" value="${l.force}" 
                           onchange="window.updateSavedLoadForce(${i}, this.value)" 
                           style="width: 60px; font-size: 0.9em; padding: 2px; background: #1a2333; color: white; border: 1px solid #334155; border-radius: 3px;" title="Pressure (kN/m²)">
                    <span style="font-size:0.8em; color:#8892a4;">kN/m²</span>
                    <button onclick="window.deleteSavedLoad(${i})" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 1.1em; padding: 0 5px;" title="Delete Load">❌</button>
                </div>
            </div>
        `).join('');
        $('btn-clear-loads').style.display = 'block';
    }
}

window.updateSavedLoadForce = function(index, newForce) {
    state.savedLoads[index].force = parseFloat(newForce) || 0;
    computeStressField();
};

window.deleteSavedLoad = function(index) {
    state.savedLoads.splice(index, 1);
    updateLoadListUI();
    computeStressField();
};

$('btn-save-load').addEventListener('click', () => {
    if (paintedVertexIndices.size === 0) return;
    state.savedLoads.push({
        indices: new Set(paintedVertexIndices),
        force: state.force,
        tractionType: state.tractionType,
        vecX: state.vecX, vecY: state.vecY, vecZ: state.vecZ,
        loadPoint: loadPoint.clone(),
        loadNormal: loadNormal.clone()
    });
    paintedVertexIndices.clear();
    updatePaintedVisuals();
    updateLoadListUI();
    computeStressField();
});

$('btn-clear-loads').addEventListener('click', () => {
    state.savedLoads = [];
    updateLoadListUI();
    computeStressField();
});

setTimeout(updateAnalyticsPlots, 500);

updateGeometry();
animate();
