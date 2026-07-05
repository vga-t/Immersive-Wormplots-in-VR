import { currentDataset, attribute1, attribute2, setupUI } from './ui.js';
import { datasetConfig } from './config.js';
import { setupControllers } from './controllers.js';
import { extractRawData, connectPoints, updatePoints, clearGroupMeshes, updateAllGroupMeshUniforms } from './helpers.js';
import { state } from './state.js';

let engine, camera, lights, xrHelper;
let worker;
let isInitialized = false;
let glowLayer = null;

function registerShaders() {
    BABYLON.Effect.ShadersStore["wormplotVertexShader"] = `
        precision highp float;
        attribute vec3 position;
        attribute vec3 normal;
        uniform mat4 world;
        uniform mat4 worldViewProjection;
        varying vec3 vLocalPos;
        varying vec3 vNormal;
        void main(void) {
            gl_Position = worldViewProjection * vec4(position, 1.0);
            vLocalPos = position;
            vNormal = vec3(world * vec4(normal, 0.0));
        }
    `;

    BABYLON.Effect.ShadersStore["wormplotFragmentShader"] = `
        precision highp float;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform float uClipZ;
        uniform float uIsLineSystem;
        varying vec3 vLocalPos;
        varying vec3 vNormal;
        void main(void) {
            // Clip plane check along Z axis
            if (vLocalPos.z > uClipZ) {
                discard; // Hide both ribbon and lines completely
            } else {
                if (uIsLineSystem > 0.5) {
                    // Shaded line color (zero emissivity) to match diffuse ribbon shading
                    gl_FragColor = vec4(uColor * 0.5, uAlpha);
                } else {
                    // Diffuse lighting (zero emissivity)
                    float ndl = abs(dot(normalize(vNormal), normalize(vec3(0.5, 1.0, 0.3))));
                    vec3 litColor = uColor * (0.2 + ndl * 0.8);
                    gl_FragColor = vec4(litColor, uAlpha);
                }
            }
        }
    `;
}

export async function initializeScene() {
    if (isInitialized) {
        loadAndRenderDataset();
        return;
    }

    const canvas = document.getElementById("renderCanvas");
    engine = new BABYLON.Engine(canvas, true, { xrCompatible: true });
    state.scene = new BABYLON.Scene(engine);

    // Register custom GPU shaders
    registerShaders();

    camera = setupCamera(state.scene, canvas);
    lights = setupLights(state.scene);
    state.ground = setupGround(state.scene);

    xrHelper = await setupXR(state.scene, state.ground);
    window.xrHelper = xrHelper;


    // Create persistent visualization container floating at ergonomic height Y = 1.3m
    state.visualizationContainer = new BABYLON.TransformNode("visualizationContainer", state.scene);
    state.visualizationContainer.position = new BABYLON.Vector3(0, 1.3, 2.5);

    // GlowLayer for boundary volume neon edge effect
    glowLayer = new BABYLON.GlowLayer("glow", state.scene);
    glowLayer.intensity = 0.4;

    // Create persistent boundary volume with edge rendering (created once, never disposed)
    createBoundaryVolume();

    // Create persistent clipping plane, slider track, and slider handle (created once)
    setupClippingPlane();

    // Initialize the Web Worker for statistical computations
    worker = new Worker('./statsWorker.js');
    worker.onmessage = handleWorkerMessage;

    await setupControllers(state.scene, xrHelper, state.ground);

    isInitialized = true;
    state.applyClippingCallback = applyClipping;

    // Keyboard Q/W and E/R keys for slicing and group transparency
    window.addEventListener("keydown", (evt) => {
        let changed = false;
        const key = evt.key.toLowerCase();
        if (key === "w") {
            state.groupAlphaMultiplier = Math.min(1.0, state.groupAlphaMultiplier + 0.05);
            changed = true;
        } else if (key === "q") {
            state.groupAlphaMultiplier = Math.max(0.0, state.groupAlphaMultiplier - 0.05);
            changed = true;
        } else if (key === "e") {
            state.zClip = Math.max(-1.5, state.zClip - 0.05);
            if (state.clipPlaneSliderLeft) state.clipPlaneSliderLeft.position.z = state.zClip;
            if (state.clipPlaneSliderRight) state.clipPlaneSliderRight.position.z = state.zClip;
            if (state.clipPlaneMesh) state.clipPlaneMesh.position.z = state.zClip;
            changed = true;
        } else if (key === "r") {
            state.zClip = Math.min(1.5, state.zClip + 0.05);
            if (state.clipPlaneSliderLeft) state.clipPlaneSliderLeft.position.z = state.zClip;
            if (state.clipPlaneSliderRight) state.clipPlaneSliderRight.position.z = state.zClip;
            if (state.clipPlaneMesh) state.clipPlaneMesh.position.z = state.zClip;
            changed = true;
        }

        if (changed) {
            applyClipping();
        }
    });

    // Setup UI after initialization — callback goes directly to loadAndRenderDataset
    setupUI(loadAndRenderDataset);

    loadAndRenderDataset();

    engine.runRenderLoop(function () {
        state.scene.render();
        var fps = engine.getFps().toFixed();
        document.getElementById('fpsCounter').innerText = fps + " FPS";
    });

    window.addEventListener("resize", function () {
        engine.resize();
    });
}

function setupCamera(scene, canvas) {
    const camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 1.6, 6), scene);
    camera.setTarget(new BABYLON.Vector3(0, 1.3, 2.5));
    camera.attachControl(canvas, true);
    return camera;
}

function setupGround(scene) {
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
    const gridMat = new BABYLON.GridMaterial("groundMaterial", scene);
    gridMat.majorUnitFrequency = 5;
    gridMat.minorUnitVisibility = 0.3;
    gridMat.gridRatio = 1;
    gridMat.backFaceCulling = false;
    gridMat.mainColor = new BABYLON.Color3(0.05, 0.05, 0.08);
    gridMat.lineColor = new BABYLON.Color3(0.1, 0.2, 0.3);
    gridMat.opacity = 0.98;
    ground.material = gridMat;
    ground.position = new BABYLON.Vector3(0, 0, 2.5);
    return ground;
}

async function setupXR(scene, ground) {
    return await scene.createDefaultXRExperienceAsync({
        floorMeshes: [ground],
    });
}


function setupLights(scene) {
    const ambientLight = new BABYLON.HemisphericLight("ambientLight", new BABYLON.Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.7;
    ambientLight.groundColor = new BABYLON.Color3(0.15, 0.15, 0.2);

    const dirLight1 = new BABYLON.DirectionalLight("dirLight1", new BABYLON.Vector3(1, -1, 1), scene);
    dirLight1.intensity = 0.5;
    dirLight1.position = new BABYLON.Vector3(-10, 10, -10);

    const dirLight2 = new BABYLON.DirectionalLight("dirLight2", new BABYLON.Vector3(-1, -1, 1), scene);
    dirLight2.intensity = 0.5;
    dirLight2.position = new BABYLON.Vector3(10, 10, -10);

    // Point light near visualization center for better data readability
    const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 2.0, 2.5), scene);
    pointLight.intensity = 0.3;
    pointLight.diffuse = new BABYLON.Color3(0.8, 0.9, 1.0);

    return [ambientLight, dirLight1, dirLight2, pointLight];
}

function createBoundaryVolume() {
    state.boundaryVolume = BABYLON.MeshBuilder.CreateBox("boundaryVolume",
        { width: 1.5, height: 1.5, depth: 3.0 }, state.scene);

    const mat = new BABYLON.StandardMaterial("boundaryMat", state.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new BABYLON.Color3(0.0, 0.8, 1.0);
    mat.alpha = 0.02; // Nearly invisible faces — edges rendered via EdgesRenderer
    state.boundaryVolume.material = mat;
    state.boundaryVolume.parent = state.visualizationContainer;
    state.boundaryVolume.isPickable = false; // Prevent blocking raycasts to slider handle

    // EdgesRenderer for clean 12-edge cuboid wireframe with soft glow
    state.boundaryVolume.enableEdgesRendering();
    state.boundaryVolume.edgesWidth = 2.0;
    state.boundaryVolume.edgesColor = new BABYLON.Color4(0.0, 0.8, 1.0, 0.8);
}

async function loadCSVData(currentDataset) {
    try {
        const cfg = datasetConfig[currentDataset];
        const df = await dfd.readCSV(cfg.file);
        return df;
    } catch (error) {
        console.error('Error loading CSV:', error);
        return null;
    }
}

export async function loadAndRenderDataset() {
    if (!isInitialized) return; // Guard against premature calls during init

    const df = await loadCSVData(currentDataset);
    if (!df) return;

    const datasetData = extractRawData(df, currentDataset, attribute1, attribute2);

    worker.postMessage({
        requestId: Date.now().toString(),
        dataset: datasetData
    });
}

function handleWorkerMessage(event) {
    const { ok, result, error } = event.data;
    if (!ok) {
        console.error("Worker error:", error);
        return;
    }

    renderVisualization(result);
}

function renderVisualization(result) {
    // Check if group structure has changed
    const newGroupNames = new Set(result.groups.map(g => g.group));
    const oldGroupNames = new Set(Object.keys(state.groupMeshes));

    let needsFullClear = false;
    if (oldGroupNames.size !== newGroupNames.size) {
        needsFullClear = true;
    } else {
        for (let name of newGroupNames) {
            if (!oldGroupNames.has(name)) {
                needsFullClear = true;
                break;
            }
        }
    }

    if (needsFullClear) {
        clearGroupMeshes();
    }

    // Dispose old capping polygons (lightweight, recreated per render)
    Object.keys(state.capMeshes).forEach(group => {
        if (state.capMeshes[group].lines) state.capMeshes[group].lines.dispose();
        if (state.capMeshes[group].diamond) state.capMeshes[group].diamond.dispose();
    });
    state.capMeshes = {};

    // 1. Calculate Bounds and Midpoints
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    result.groups.forEach(g => {
        g.values.forEach(v => {
            v.points.forEach(pt => {
                if (pt[0] < minX) minX = pt[0];
                if (pt[0] > maxX) maxX = pt[0];
                if (pt[1] < minY) minY = pt[1];
                if (pt[1] > maxY) maxY = pt[1];
                if (pt[2] < minZ) minZ = pt[2];
                if (pt[2] > maxZ) maxZ = pt[2];
            });
        });
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;
    const rangeZ = (maxZ - minZ) || 1;

    // Normalize data into bounding volume coordinate space
    state.datasetGroups = result.groups.map(g => {
        const mappedValues = g.values.map(v => {
            const mappedPoints = v.points.map(pt => {
                const x = ((pt[0] - centerX) / rangeX) * 1.5;
                const y = ((pt[1] - centerY) / rangeY) * 1.5;
                const z = ((pt[2] - centerZ) / rangeZ) * 3.0;
                return new BABYLON.Vector3(x, y, z);
            });
            const localZ = ((v.timeStamp - centerZ) / rangeZ) * 3.0;
            return {
                timeStamp: v.timeStamp,
                localZ,
                points: mappedPoints
            };
        });

        mappedValues.sort((a, b) => a.localZ - b.localZ);

        return {
            group: g.group,
            values: mappedValues
        };
    });

    // Extract unique local timestamps
    state.rawTimestamps = [];
    state.datasetGroups[0].values.forEach(v => {
        state.rawTimestamps.push({ timeStamp: v.timeStamp, localZ: v.localZ });
    });
    state.rawTimestamps.sort((a, b) => a.localZ - b.localZ);
    state.uniqueLocalTimestamps = state.rawTimestamps.map(rt => rt.localZ);

    // Setup colors per group
    state.colors = {};
    const datasetColors = datasetConfig[currentDataset].colors;
    state.datasetGroups.forEach((g, index) => {
        state.colors[g.group] = datasetColors[index % datasetColors.length];
    });

    // Reset container transforms on dataset change
    state.visualizationContainer.scaling = new BABYLON.Vector3(1, 1, 1);
    state.visualizationContainer.position = new BABYLON.Vector3(0, 1.3, 2.5);

    // 2. Render or Update wormplot meshes in-place
    state.datasetGroups.forEach(g => {
        const color = state.colors[g.group];
        const pointsArray = g.values.map(v => v.points);

        const existing = state.groupMeshes[g.group];
        if (existing && existing.LineSystem && existing.ribbon) {
            updatePoints(pointsArray, existing.LineSystem, existing.ribbon, color, existing.lineMat, existing.ribbonMat, state.zClip);
        } else {
            const meshes = connectPoints(pointsArray, state.scene, color, g.group, state.visualizationContainer, state.zClip);
            state.groupMeshes[g.group] = meshes;
        }
    });


    // 3. Reset clipping and apply
    state.zClip = 1.5;
    resetClippingPlanePosition();
    applyClipping();
}


function setCappingPolygonsVisibility(visible) {
    Object.keys(state.capMeshes).forEach(group => {
        const cap = state.capMeshes[group];
        if (cap) {
            if (cap.lines) cap.lines.isVisible = visible;
            if (cap.diamond) cap.diamond.isVisible = visible;
        }
    });
}

function setupClippingPlane() {
    // Semi-transparent plane mesh for visual cross-section
    state.clipPlaneMesh = BABYLON.MeshBuilder.CreatePlane("clipPlaneMesh", { width: 1.5, height: 1.5 }, state.scene);
    state.clipPlaneMesh.parent = state.visualizationContainer;
    state.clipPlaneMesh.rotation.y = Math.PI; // Face forward
    state.clipPlaneMesh.position = new BABYLON.Vector3(0, 0, state.zClip);
    state.clipPlaneMesh.isPickable = false; // Prevent blocking raycasts

    const clipPlaneMat = new BABYLON.StandardMaterial("clipPlaneMat", state.scene);
    clipPlaneMat.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8);
    clipPlaneMat.emissiveColor = new BABYLON.Color3(0.2, 0.4, 0.8);
    clipPlaneMat.disableLighting = true; // Make the clipping plane emissive
    clipPlaneMat.alpha = 0.25;
    clipPlaneMat.backFaceCulling = false;
    state.clipPlaneMesh.material = clipPlaneMat;

    // Track material
    const trackMat = new BABYLON.StandardMaterial("trackMat", state.scene);
    trackMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.4);
    trackMat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.15);
    trackMat.disableLighting = true;

    // Slider handle material
    const sliderMat = new BABYLON.StandardMaterial("sliderMat", state.scene);
    sliderMat.diffuseColor = new BABYLON.Color3(1, 0.5, 0);
    sliderMat.emissiveColor = new BABYLON.Color3(0.6, 0.3, 0); // Brighter emissive for VR visibility
    sliderMat.disableLighting = true;

    // Left slider track (at X = -0.75, Y = -0.76)
    state.sliderTrackLeft = BABYLON.MeshBuilder.CreateCylinder("sliderTrackLeft", { height: 3.0, diameter: 0.02 }, state.scene);
    state.sliderTrackLeft.parent = state.visualizationContainer;
    state.sliderTrackLeft.rotation.x = Math.PI / 2; // Lie along Z axis
    state.sliderTrackLeft.position = new BABYLON.Vector3(-0.75, -0.76, 0);
    state.sliderTrackLeft.isPickable = false;
    state.sliderTrackLeft.material = trackMat;

    // Right slider track (at X = 0.75, Y = -0.76)
    state.sliderTrackRight = BABYLON.MeshBuilder.CreateCylinder("sliderTrackRight", { height: 3.0, diameter: 0.02 }, state.scene);
    state.sliderTrackRight.parent = state.visualizationContainer;
    state.sliderTrackRight.rotation.x = Math.PI / 2; // Lie along Z axis
    state.sliderTrackRight.position = new BABYLON.Vector3(0.75, -0.76, 0);
    state.sliderTrackRight.isPickable = false;
    state.sliderTrackRight.material = trackMat;

    // Left slider handle (at X = -0.75, Y = -0.76, Z = state.zClip)
    state.clipPlaneSliderLeft = BABYLON.MeshBuilder.CreateSphere("clipPlaneSliderLeft", { diameter: 0.10 }, state.scene);
    state.clipPlaneSliderLeft.parent = state.visualizationContainer;
    state.clipPlaneSliderLeft.position = new BABYLON.Vector3(-0.75, -0.76, state.zClip);
    state.clipPlaneSliderLeft.material = sliderMat;

    // Right slider handle (at X = 0.75, Y = -0.76, Z = state.zClip)
    state.clipPlaneSliderRight = BABYLON.MeshBuilder.CreateSphere("clipPlaneSliderRight", { diameter: 0.10 }, state.scene);
    state.clipPlaneSliderRight.parent = state.visualizationContainer;
    state.clipPlaneSliderRight.position = new BABYLON.Vector3(0.75, -0.76, state.zClip);
    state.clipPlaneSliderRight.material = sliderMat;

    // Attach PointerDragBehavior for 1DOF drag along local Z axis
    const dragBehaviorLeft = new BABYLON.PointerDragBehavior({ dragAxis: new BABYLON.Vector3(0, 0, 1) });
    dragBehaviorLeft.useObjectOrientationForDragging = false;
    state.clipPlaneSliderLeft.addBehavior(dragBehaviorLeft);

    const dragBehaviorRight = new BABYLON.PointerDragBehavior({ dragAxis: new BABYLON.Vector3(0, 0, 1) });
    dragBehaviorRight.useObjectOrientationForDragging = false;
    state.clipPlaneSliderRight.addBehavior(dragBehaviorRight);

    // Synchronized drag behavior handlers
    dragBehaviorLeft.onDragStartObservable.add(() => {
        setCappingPolygonsVisibility(false);
    });
    dragBehaviorRight.onDragStartObservable.add(() => {
        setCappingPolygonsVisibility(false);
    });

    dragBehaviorLeft.onDragObservable.add(() => {
        if (state.clipPlaneSliderLeft.position.z < -1.5) state.clipPlaneSliderLeft.position.z = -1.5;
        if (state.clipPlaneSliderLeft.position.z > 1.5) state.clipPlaneSliderLeft.position.z = 1.5;

        state.zClip = state.clipPlaneSliderLeft.position.z;
        state.clipPlaneSliderRight.position.z = state.zClip;
        state.clipPlaneMesh.position.z = state.zClip;

        applyClipping();
    });

    dragBehaviorRight.onDragObservable.add(() => {
        if (state.clipPlaneSliderRight.position.z < -1.5) state.clipPlaneSliderRight.position.z = -1.5;
        if (state.clipPlaneSliderRight.position.z > 1.5) state.clipPlaneSliderRight.position.z = 1.5;

        state.zClip = state.clipPlaneSliderRight.position.z;
        state.clipPlaneSliderLeft.position.z = state.zClip;
        state.clipPlaneMesh.position.z = state.zClip;

        applyClipping();
    });

    dragBehaviorLeft.onDragEndObservable.add(() => {
        snapToClosestTimestamp();
    });
    dragBehaviorRight.onDragEndObservable.add(() => {
        snapToClosestTimestamp();
    });

    function snapToClosestTimestamp() {
        if (state.uniqueLocalTimestamps.length > 0) {
            let closestZ = state.uniqueLocalTimestamps[0];
            let minDiff = Math.abs(state.zClip - closestZ);
            for (let i = 1; i < state.uniqueLocalTimestamps.length; i++) {
                const diff = Math.abs(state.zClip - state.uniqueLocalTimestamps[i]);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestZ = state.uniqueLocalTimestamps[i];
                }
            }
            state.zClip = closestZ;
            state.clipPlaneSliderLeft.position.z = state.zClip;
            state.clipPlaneSliderRight.position.z = state.zClip;
            state.clipPlaneMesh.position.z = state.zClip;
            applyClipping();
        }
        setCappingPolygonsVisibility(true);
    }
}

function resetClippingPlanePosition() {
    if (state.clipPlaneSliderLeft) state.clipPlaneSliderLeft.position.z = state.zClip;
    if (state.clipPlaneSliderRight) state.clipPlaneSliderRight.position.z = state.zClip;
    if (state.clipPlaneMesh) state.clipPlaneMesh.position.z = state.zClip;
}

function applyClipping() {
    // 1. Update shader clipZ uniform, color, and alpha dynamically on all group meshes and caps
    updateAllGroupMeshUniforms();

    // 2. Interpolate boxplot values at zClip and render capping polygon
    state.datasetGroups.forEach(g => {
        const color = state.colors[g.group];
        if (!color) return;

        let p1 = null, p2 = null;
        let z1 = 0, z2 = 0;

        for (let i = 0; i < g.values.length; i++) {
            const v = g.values[i];
            if (v.localZ <= state.zClip) {
                p1 = v.points;
                z1 = v.localZ;
            }
            if (v.localZ >= state.zClip && p2 === null) {
                p2 = v.points;
                z2 = v.localZ;
            }
        }

        if (p1 === null) p1 = g.values[0].points;
        if (p2 === null) p2 = g.values[g.values.length - 1].points;

        const factor = (z1 === z2) ? 0 : (state.zClip - z1) / (z2 - z1);
        const interpPoints = [];
        for (let idx = 0; idx < 8; idx++) {
            const p = BABYLON.Vector3.Lerp(p1[idx], p2[idx], factor);
            p.z = state.zClip;
            interpPoints.push(p);
        }

        // Capping polygon: diamond outline + whiskers
        const lines = [
            [interpPoints[0], interpPoints[1]],
            [interpPoints[1], interpPoints[2]],
            [interpPoints[2], interpPoints[3]],
            [interpPoints[3], interpPoints[0]],
            [interpPoints[0], interpPoints[4]],
            [interpPoints[1], interpPoints[5]],
            [interpPoints[2], interpPoints[6]],
            [interpPoints[3], interpPoints[7]]
        ];

        const medianPoint = new BABYLON.Vector3(interpPoints[0].x, interpPoints[1].y, state.zClip);
        const paths = [
            [medianPoint, medianPoint, medianPoint, medianPoint, medianPoint],
            [interpPoints[0], interpPoints[1], interpPoints[2], interpPoints[3], interpPoints[0]]
        ];

        if (state.capMeshes[g.group]) {
            // Update existing capping polygon in-place
            BABYLON.MeshBuilder.CreateLineSystem(null, { lines, instance: state.capMeshes[g.group].lines });
            BABYLON.MeshBuilder.CreateRibbon(null, { pathArray: paths, instance: state.capMeshes[g.group].diamond });
        } else {
            // Create new capping polygon
            const linesMesh = BABYLON.MeshBuilder.CreateLineSystem(`capLines_${g.group}`, { lines, updatable: true }, state.scene);
            linesMesh.alwaysSelectAsActiveMesh = true;
            linesMesh.color = color.scale(0.5);
            linesMesh.parent = state.visualizationContainer;
            linesMesh.renderingGroupId = 2; // Render above wormplot geometry
 
            const diamondMesh = BABYLON.MeshBuilder.CreateRibbon(`capDiamond_${g.group}`, {
                pathArray: paths,
                closeArray: false,
                closePath: false,
                updatable: true
            }, state.scene);
            diamondMesh.alwaysSelectAsActiveMesh = true;
            const diamondMat = new BABYLON.StandardMaterial(`capMat_${g.group}`, state.scene);
            diamondMat.diffuseColor = color;
            diamondMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            diamondMat.disableLighting = false;
            diamondMat.backFaceCulling = false;
            diamondMesh.material = diamondMat;
            diamondMesh.parent = state.visualizationContainer;
            diamondMesh.renderingGroupId = 2; // Render above wormplot geometry
 
            state.capMeshes[g.group] = { lines: linesMesh, diamond: diamondMesh };
        }
    });
}

initializeScene();