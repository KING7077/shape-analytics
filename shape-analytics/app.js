import { poissonOf, halfSpaceDisplacement, boussinesqTensor, tangentialTensor, principalStresses, vonMises, strainNorm } from './physics.js';
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
        // The plots live in a drawer under the viewport, shown only on the analytics tab.
        document.querySelector('.app-layout').dataset.view = tab.id === 'tab-analytics' ? 'analytics' : 'controls';
        if (tab.id === 'tab-analytics') {
            requestAnimationFrame(() => {
                const p1 = $('plot-stress-dist');
                if (p1 && p1.data) Plotly.Plots.resize(p1);
            });
        }
    });
});

// --- Three.js Setup ---
const container = $('three-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1f33);

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

let gridHelper = null;
function updateGridHelper(isDark) {
    if (gridHelper) scene.remove(gridHelper);
    const centerColor = isDark ? 0x2f4a68 : 0xb9b4a4;
    const gridColor = isDark ? 0x1a3350 : 0xd3cfc0;
    gridHelper = new THREE.GridHelper(40, 40, centerColor, gridColor);
    gridHelper.position.y = -10;
    scene.add(gridHelper);
}
updateGridHelper(true);

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
    const mat = new THREE.PointsMaterial({ color: 0xd0451b, size: 0.15, sizeAttenuation: true, depthTest: false, transparent: true, opacity: 0.8 });
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
        color: 0x8a96a3, 
        vertexColors: true,
        shininess: 30,
        flatShading: false
    });
    
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1f4e79, transparent: true, opacity: 0.18 });
    wireframe = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), wireMat);
    scene.add(wireframe);
    
    basePositions = new Float32Array(geometry.attributes.position.array);
    computeVertexAreas();
    
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
    
    const mainArrow = new THREE.ArrowHelper(forceDir, loadPoint.clone().add(forceDir.clone().multiplyScalar(-3)), 3, 0xd0451b, 0.5, 0.3);
    arrowGroup.add(mainArrow);
}

function resetColors() {
    if(!geometry) return;
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for(let i=0; i<count; i++) {
        colors[i*3] = 0.78; colors[i*3+1] = 0.80; colors[i*3+2] = 0.82; 
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Per-vertex surface area (each triangle's area split equally over its corners). Painted coverage is
// an AREA fraction, so uneven vertex density on the mesh doesn't distort the load.
let vertexArea = null, surfaceArea = 0;
function computeVertexAreas() {
    const pos = geometry.attributes.position.array;
    const idx = geometry.index ? geometry.index.array : null;
    const nTri = idx ? idx.length / 3 : geometry.attributes.position.count / 3;
    vertexArea = new Float64Array(geometry.attributes.position.count);
    surfaceArea = 0;
    for (let t = 0; t < nTri; t++) {
        const i0 = idx ? idx[3*t] : 3*t, i1 = idx ? idx[3*t+1] : 3*t+1, i2 = idx ? idx[3*t+2] : 3*t+2;
        const ux = pos[i1*3]-pos[i0*3], uy = pos[i1*3+1]-pos[i0*3+1], uz = pos[i1*3+2]-pos[i0*3+2];
        const vx = pos[i2*3]-pos[i0*3], vy = pos[i2*3+1]-pos[i0*3+1], vz = pos[i2*3+2]-pos[i0*3+2];
        const A = 0.5 * Math.hypot(uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx);
        vertexArea[i0] += A/3; vertexArea[i1] += A/3; vertexArea[i2] += A/3;
        surfaceArea += A;
    }
}
function paintedAreaOf(indices) {
    let s = 0;
    indices.forEach(i => { s += vertexArea[i]; });
    return Math.max(1e-6, s);
}

function computeStressField() {
    if (!geometry || !basePositions) return;
    drawArrows();
    if (!vertexArea || vertexArea.length !== geometry.attributes.position.count) computeVertexAreas();

    const positions = geometry.attributes.position.array;
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const E = state.material;
    const nu = poissonOf(E);
    const K = E / (3 * (1 - 2 * nu));   // Ch. 6: bulk modulus
    const G = E / (2 * (1 + nu));

    $('out-bulk').innerHTML = `${(K / 1e9).toFixed(1)} <span class="unit">GPa</span>`;
    $('out-shear').innerHTML = `${(G / 1e9).toFixed(1)} <span class="unit">GPa</span>`;

    let baseDensity = 7850;
    if (E === 70e9) baseDensity = 2700;
    else if (E === 30e9) baseDensity = 2400;
    else if (E === 3e9) baseDensity = 1200;
    else if (E === 0.01e9) baseDensity = 1100;

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

    geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const bottomCenter = new THREE.Vector3(0, minY, 0);

    // Per-load constants, computed once (not once per vertex).
    let eps_hydro_total = 0;
    const infos = allLoads.map(load => {
        if (!load.sampledPoints) {
            load.sampledPoints = [];
            for (let idx of load.indices) {
                load.sampledPoints.push(new THREE.Vector3(basePositions[idx*3], basePositions[idx*3+1], basePositions[idx*3+2]));
            }
            if (load.sampledPoints.length === 0) load.sampledPoints.push(load.loadPoint.clone());
        }
        const nz = load.loadNormal.clone().multiplyScalar(-1);
        const nx = new THREE.Vector3(1, 0, 0);
        if (Math.abs(nz.x) > 0.9) nx.set(0, 1, 0);
        nx.cross(nz).normalize();
        const ny = new THREE.Vector3().crossVectors(nz, nx).normalize();

        const forceDir = nz.clone();
        if (load.tractionType === 'arbitrary') forceDir.set(load.vecX, load.vecY, load.vecZ).normalize();
        const fz = forceDir.dot(nz);
        const fT = forceDir.clone().sub(nz.clone().multiplyScalar(fz));
        const fx = fT.dot(nx), fy = fT.dot(ny);

        // load.force is a PRESSURE in kN/m^2; total force in N = pressure * painted area * 1000.
        const area = paintedAreaOf(load.indices);
        const coverage = area / surfaceArea;
        const P = load.force * area * 1000;
        const Px = P * fx, Py = P * fy, Pz = P * fz;
        const pressure = P / area;

        let avgDist = 0;
        load.indices.forEach(idx => {
            avgDist += Math.hypot(basePositions[idx*3]-load.loadPoint.x, basePositions[idx*3+1]-load.loadPoint.y, basePositions[idx*3+2]-load.loadPoint.z);
        });
        const effectivePatch = load.indices.size > 0 ? (avgDist / load.indices.size) : 0.5;
        // Overlap the integration points by 2.5x their spacing to ensure smooth blurring
        const patchLocal = (effectivePatch / Math.max(1, Math.sqrt(load.sampledPoints.length))) * 2.5;

        // Ch. 2: pressure p on the ENTIRE boundary gives sigma = -p I (hydrostatic) everywhere. This holds
        // only for a fully covered surface; a partial patch is the half-space (Boussinesq/Cerruti) solution.
        const full = load.tractionType === 'normal' && coverage >= 0.99;
        const eps_hydro = full ? -pressure / (3 * K) : 0;
        eps_hydro_total += eps_hydro;

        const rel = bottomCenter.clone().sub(load.loadPoint);
        const dBC = halfSpaceDisplacement(rel.dot(nx), rel.dot(ny), Math.max(0.01, rel.dot(nz)), Px, Py, Pz, effectivePatch, nu, E);
        const dispCorr = nx.clone().multiplyScalar(dBC.ux).add(ny.clone().multiplyScalar(dBC.uy)).add(nz.clone().multiplyScalar(dBC.uz));

        return { nx, ny, nz, Px, Py, Pz, pressure, full, eps_hydro, effectivePatch, patchLocal, dispCorr, sp: load.sampledPoints, dP: 1 / load.sampledPoints.length, load };
    });

    $('out-density').innerHTML = `${(baseDensity / (1 + 3 * eps_hydro_total)).toFixed(1)} <span class="unit">kg/m³</span>`;

    let maxSigmaN = 0, maxTau = 0, maxVM = 0, maxEps = 0;
    const stressValues = new Float32Array(count);
    const displacements = new Array(count);
    let maxDispMag = 0;

    // Display exaggeration only. Displacement is physically proportional to 1/E; the global clamp below
    // rescales uniformly, so stiffness ratios between materials are preserved.
    const scale = state.defScale * 1e6;

    const rot = (info, t) => { // local tensor -> global: R T R^T with R = [nx ny nz]
        const a = [info.nx, info.ny, info.nz], out = [0, 0, 0, 0, 0, 0];
        const L = [[t[0], t[3], t[4]], [t[3], t[1], t[5]], [t[4], t[5], t[2]]];
        const pairs = [[0,0],[1,1],[2,2],[0,1],[0,2],[1,2]];
        pairs.forEach(([p, q], k) => {
            let s = 0;
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                s += L[i][j] * a[i].getComponent(p) * a[j].getComponent(q);
            }
            out[k] = s;
        });
        return out;
    };

    for (let i = 0; i < count; i++) {
        const bx = basePositions[i*3], by = basePositions[i*3+1], bz = basePositions[i*3+2];
        const vertexPos = new THREE.Vector3(bx, by, bz);

        const totalDisp = new THREE.Vector3();
        const S = [0, 0, 0, 0, 0, 0]; // total Cauchy stress: tensors of separate loads ADD (linear elasticity, Ch. 6)

        for (const info of infos) {
            const { nx, ny, nz } = info;
            const rc = vertexPos.clone().sub(info.load.loadPoint);
            const xc = rc.dot(nx), yc = rc.dot(ny), zc = Math.max(0.01, rc.dot(nz));
            const dv = halfSpaceDisplacement(xc, yc, zc, info.Px, info.Py, info.Pz, info.effectivePatch, nu, E);
            const dispBouss = nx.clone().multiplyScalar(dv.ux).add(ny.clone().multiplyScalar(dv.uy)).add(nz.clone().multiplyScalar(dv.uz)).sub(info.dispCorr);

            if (info.full) {
                const dispHydro = new THREE.Vector3(bx, by, bz).multiplyScalar(info.eps_hydro);
                dispHydro.y -= minY * info.eps_hydro;
                totalDisp.add(dispHydro.multiplyScalar(scale));
                S[0] -= info.pressure; S[1] -= info.pressure; S[2] -= info.pressure;
                continue;
            }
            totalDisp.add(dispBouss.multiplyScalar(scale));

            // Stress by superposition of point-force solutions over the painted points.
            const local = [0, 0, 0, 0, 0, 0];
            const hasTan = info.Px !== 0 || info.Py !== 0;
            for (const sp of info.sp) {
                const rel = vertexPos.clone().sub(sp);
                const x = rel.dot(nx), y = rel.dot(ny), z = Math.max(0.01, rel.dot(nz));
                const b = boussinesqTensor(x, y, z, info.Pz * info.dP, info.patchLocal, nu);
                for (let k = 0; k < 6; k++) local[k] += b[k];
                if (hasTan) {
                    const c = tangentialTensor(x, y, z, info.Px * info.dP, info.Py * info.dP, info.patchLocal, nu, E);
                    for (let k = 0; k < 6; k++) local[k] += c[k];
                }
            }
            const g = rot(info, local);
            for (let k = 0; k < 6; k++) S[k] += g[k];
        }

        displacements[i] = totalDisp;
        const mag = totalDisp.length();
        if (mag > maxDispMag) maxDispMag = mag;

        // Ch. 4: extreme normal stress and tau_max = (s1 - s3)/2 from the principal stresses.
        const [s1, , s3] = principalStresses(S);
        const sigN = Math.max(Math.abs(s1), Math.abs(s3)) / 1e6;
        const tau = (s1 - s3) / 2 / 1e6;
        const vm = vonMises(S) / 1e6;
        const eps = strainNorm(S, nu, E) * 1e6; // microstrain

        let val = 0;
        if (state.mapType === 'sigma_n') val = sigN;
        if (state.mapType === 'tau_max') val = tau;
        if (state.mapType === 'von_mises') val = vm;
        if (state.mapType === 'strain_mag') val = eps;
        stressValues[i] = val;

        if (sigN > maxSigmaN) maxSigmaN = sigN;
        if (tau > maxTau) maxTau = tau;
        if (vm > maxVM) maxVM = vm;
        if (eps > maxEps) maxEps = eps;
    }

    // Global clamp: If the maximum displacement exceeds a safe visual limit (e.g. 15.0 units),
    // we scale DOWN all displacements uniformly. This strictly preserves the mesh's geometric shape!
    const maxAllowedDisp = 15.0;
    const globalClampScale = maxDispMag > maxAllowedDisp ? (maxAllowedDisp / maxDispMag) : 1.0;

    for (let i = 0; i < count; i++) {
        const disp = displacements[i];
        positions[i*3]   = basePositions[i*3]   + disp.x * globalClampScale;
        positions[i*3+1] = basePositions[i*3+1] + disp.y * globalClampScale;
        positions[i*3+2] = basePositions[i*3+2] + disp.z * globalClampScale;
    }

    $('out-sigma-max').innerHTML = `${maxSigmaN.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-tau-max').innerHTML = `${maxTau.toFixed(1)} <span class="unit">MPa</span>`;
    $('out-vm-max').innerHTML = `${maxVM.toFixed(1)} <span class="unit">MPa</span>`;
    // The model is linear and small-strain: beyond about 1% strain (10 000 με) the numbers are only indicative.
    $('out-eps-max').innerHTML = `${maxEps.toFixed(1)} <span class="unit">με${maxEps > 1e4 ? ' (beyond small-strain theory)' : ''}</span>`;

    let maxVal = 0;
    for (let i = 0; i < count; i++) if (stressValues[i] > maxVal) maxVal = stressValues[i];
    $('legend-title').textContent = MAP_LABELS[state.mapType];
    $('legend-mid').textContent = (maxVal / 2).toPrecision(3);
    $('legend-max').textContent = maxVal.toPrecision(3);
    for (let i = 0; i < count; i++) {
        // Normalizing strictly to maxVal (no artificial 0.5 multiplier clamping) so different loads show relative colors
        const norm = maxVal > 0 ? Math.min(1.0, Math.max(0, stressValues[i] / maxVal)) : 0;
        const [rv, gv, bv] = stressRamp(norm);

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


// --- Stress ramp (blue -> paper -> vermilion), shared by the 3D mesh and Plotly ---
const RAMP_STOPS = [[0.0, [0.2, 0.42, 0.66]], [0.5, [0.95, 0.94, 0.90]], [1.0, [0.82, 0.27, 0.11]]];
function stressRamp(t) {
    const [a, b] = t < 0.5 ? [RAMP_STOPS[0], RAMP_STOPS[1]] : [RAMP_STOPS[1], RAMP_STOPS[2]];
    const f = (t - a[0]) / (b[0] - a[0]);
    return a[1].map((c, k) => c + (b[1][k] - c) * f);
}
const PLOTLY_RAMP = [[0, '#3a6ba8'], [0.5, '#f2efe6'], [1, '#d0451b']];
const MAP_LABELS = { sigma_n: 'Normal stress (MPa)', tau_max: 'Max shear stress (MPa)', von_mises: 'Von Mises stress (MPa)', strain_mag: 'Strain magnitude |ε| (με)' };
const MAP_UNITS = { sigma_n: 'MPa', tau_max: 'MPa', von_mises: 'MPa', strain_mag: 'με' };

// --- Theme Toggle System ---
function getThemeLayout() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bg = isDark ? '#0f1f33' : '#e9e6dc';
    const fontColor = isDark ? '#a3b5c9' : '#4b5766';
    const gridColor = isDark ? '#2f4a68' : '#c9c4b4';
    const zeroColor = isDark ? '#4a6a8c' : '#9f9a8a';
    const titleColor = isDark ? '#e6edf5' : '#1b2733';

    return {
        paper_bgcolor: bg,
        plot_bgcolor: bg,
        font: { color: fontColor, family: 'IBM Plex Mono, monospace' },
        titleColor: titleColor,
        margin: { t: 40, r: 20, b: 40, l: 50 },
        xaxis: { gridcolor: gridColor, zerolinecolor: zeroColor, color: fontColor },
        yaxis: { gridcolor: gridColor, zerolinecolor: zeroColor, color: fontColor }
    };
}

function initThemeToggle() {
    const btn = $('theme-toggle-btn');
    const icon = $('theme-icon');
    const label = $('theme-label');
    if (!btn) return;

    const saved = localStorage.getItem('shape-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = saved || (prefersDark ? 'dark' : 'light');

    applyTheme(initialTheme);

    btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('shape-theme', theme);
        const isDark = theme === 'dark';

        if (icon && label) {
            label.textContent = isDark ? 'Light' : 'Dark';
            btn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        }

        // Update 3D canvas background and grid
        if (scene) {
            scene.background = new THREE.Color(isDark ? 0x0f1f33 : 0xf1eee5);
            updateGridHelper(isDark);
        }

        // Refresh analytics plots
        updateAnalyticsPlots();
    }
}

let sectionSeq = 0;   // guards against an older response overwriting a newer plot

async function updateAnalyticsPlots() {
    const slicePlane = $('in-slice').value;

    // Bounding-box extents of the body (three.js cylinders have their axis along Y).
    let dx = state.dimX, dy = state.dimY, dz = state.dimZ;
    if (state.shape === 'cylinder') { dx = state.cylR*2; dy = state.cylH; dz = state.cylR*2; }
    if (state.shape === 'sphere') { dx = dy = dz = state.sphR*2; }

    // Keep the slice position inside the body along the slice axis.
    const half = ({ x: dx, y: dy, z: dz }[slicePlane]) / 2;
    const posEl = $('in-slice-pos');
    const lim = Math.floor(half * 10) / 10;
    posEl.min = -lim; posEl.max = lim;
    let slicePos = Math.min(lim, Math.max(-lim, parseFloat(posEl.value)));
    if (slicePos !== parseFloat(posEl.value)) posEl.value = slicePos;
    $('val-slice-pos').textContent = slicePos.toFixed(1) + ' m';
    
    let forceDir = loadNormal.clone().multiplyScalar(-1);
    if (state.tractionType === 'arbitrary') {
        forceDir.set(state.vecX, state.vecY, state.vecZ).normalize();
    }
    
    const count = geometry ? geometry.attributes.position.count : 0;
    if (count === 0) return;
    
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
        
        const paintedArea = paintedAreaOf(load.indices);
        const coverage = paintedArea / surfaceArea;
        
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
        nu: poissonOf(state.material),
        material_E: state.material,
        shape: state.shape
    };

    const seq = ++sectionSeq;
    try {
        const response = await fetch('/api/section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });
        
        if (!response.ok) throw new Error('API ' + response.status);
        const data = await response.json();
        if (seq !== sectionSeq) return;
        const tLayout = getThemeLayout();
        const z = data.fields[state.mapType];
        const zTop = Math.max(0, ...z.flat().filter(v => v !== null));

        Plotly.react('plot-stress-dist', [{
            z,
            x: data.axis1,
            y: data.axis2,
            type: 'heatmap',
            zmin: 0,
            zmax: zTop > 0 ? zTop : 1,
            colorscale: PLOTLY_RAMP,
            hoverongaps: false,
            hovertemplate: `${data.title1} %{x:.2f} m<br>${data.title2} %{y:.2f} m<br>%{z:.3g}<extra></extra>`,
            colorbar: { title: { text: MAP_UNITS[state.mapType], font: { color: tLayout.font.color } }, tickfont: { color: tLayout.font.color } }
        }], { 
            paper_bgcolor: tLayout.paper_bgcolor,
            plot_bgcolor: tLayout.plot_bgcolor,
            font: tLayout.font,
            title: { text: `${MAP_LABELS[state.mapType]} on the ${data.title1}${data.title2} section at ${slicePlane} = ${slicePos.toFixed(1)} m`, font: { color: tLayout.titleColor } },
            xaxis: { ...tLayout.xaxis, title: data.title1 },
            yaxis: { ...tLayout.yaxis, title: data.title2, scaleanchor: 'x', scaleratio: 1 },
            margin: tLayout.margin,
            autosize: true
        }, { responsive: true });
        
        const strainEl = $('plot-strain-dist');
        if (strainEl) strainEl.style.display = 'none';

    } catch (e) {
        if (seq !== sectionSeq) return;
        console.error("Section analytics request failed:", e);
        const tLayout = getThemeLayout();
        Plotly.react('plot-stress-dist', [], {
            paper_bgcolor: tLayout.paper_bgcolor, plot_bgcolor: tLayout.plot_bgcolor, font: tLayout.font,
            xaxis: { visible: false }, yaxis: { visible: false },
            annotations: [{ text: 'Section data unavailable: the analysis server did not respond.', showarrow: false, font: { color: tLayout.font.color } }]
        }, { responsive: true });
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
            <div class="load-case-item">
                <span><b>Load ${i+1}</b> (${l.indices.size} pts)</span>
                <div style="display:flex; gap: 6px; align-items: center;">
                    <input type="number" min="0" step="10" value="${l.force}" 
                           onchange="window.updateSavedLoadForce(${i}, this.value)" 
                           style="width: 70px; font-size: 0.9em; padding: 2px 4px;" title="Pressure (kN/m²)">
                    <span style="font-size:0.8em; color:var(--color-text-muted);">kN/m²</span>
                    <button onclick="window.deleteSavedLoad(${i})" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 1.1em; padding: 0 5px;" title="Delete Load">❌</button>
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

initThemeToggle();
setTimeout(updateAnalyticsPlots, 500);

updateGeometry();
animate();
