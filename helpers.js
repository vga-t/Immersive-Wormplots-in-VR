import { state } from './state.js';

export function connectPoints(points, scene, color, group, parentNode, zClip) {
    const diamondLines = [];
    const whiskerLines = [];
    const ribbonPaths = [];
    for (let i = 0; i < points.length; i++) {
        const diamond = [
            points[i][0], points[i][1],
            points[i][1], points[i][2],
            points[i][2], points[i][3],
            points[i][3], points[i][0]
        ];
        diamondLines.push(diamond);
        whiskerLines.push(
            [points[i][0], points[i][4]],
            [points[i][1], points[i][5]],
            [points[i][2], points[i][6]],
            [points[i][3], points[i][7]]
        );
        ribbonPaths.push([
            points[i][0], points[i][1], points[i][2], points[i][3], points[i][0]
        ]);
    }

    const allLines = [...diamondLines, ...whiskerLines];
    const LineSystem = BABYLON.MeshBuilder.CreateLineSystem(`lines_${group}`, { lines: allLines, updatable: true }, scene);
    LineSystem.alwaysSelectAsActiveMesh = true;
    const ribbon = BABYLON.MeshBuilder.CreateRibbon(`ribbon_${group}`, {
        pathArray: ribbonPaths,
        closeArray: false,
        closePath: false,
        updatable: true
    }, scene);
    ribbon.alwaysSelectAsActiveMesh = true;

    // Custom shader materials for GPU-based clipping
    const lineMat = new BABYLON.ShaderMaterial(`lineMat_${group}`, scene, {
        vertex: "wormplot",
        fragment: "wormplot",
    }, {
        attributes: ["position", "normal"],
        uniforms: ["world", "worldViewProjection", "uColor", "uAlpha", "uClipZ", "uIsLineSystem"]
    });
    lineMat.setColor3("uColor", color);
    lineMat.setFloat("uAlpha", 1.0);
    lineMat.setFloat("uClipZ", zClip);
    lineMat.setFloat("uIsLineSystem", 1.0);
    lineMat.alpha = 1.0;
    lineMat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
    lineMat.needAlphaBlending = () => true;
    LineSystem.material = lineMat;

    const ribbonMat = new BABYLON.ShaderMaterial(`ribbonMat_${group}`, scene, {
        vertex: "wormplot",
        fragment: "wormplot",
    }, {
        attributes: ["position", "normal"],
        uniforms: ["world", "worldViewProjection", "uColor", "uAlpha", "uClipZ", "uIsLineSystem"]
    });
    ribbonMat.setColor3("uColor", color);
    ribbonMat.setFloat("uAlpha", 0.85);
    ribbonMat.setFloat("uClipZ", zClip);
    ribbonMat.setFloat("uIsLineSystem", 0.0);
    ribbonMat.backFaceCulling = true;
    ribbonMat.separateCullingPass = true;
    ribbonMat.alpha = 0.85;
    ribbonMat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
    ribbonMat.needAlphaBlending = () => true;
    ribbon.material = ribbonMat;

    LineSystem.parent = parentNode;
    ribbon.parent = parentNode;

    return { LineSystem, ribbon, lineMat, ribbonMat };
}

export function updatePoints(points, LineSystem, ribbon, color, lineMat, ribbonMat, zClip) {
    const diamondLines = [];
    const whiskerLines = [];
    const ribbonPaths = [];
    for (let i = 0; i < points.length; i++) {
        const diamond = [
            points[i][0], points[i][1],
            points[i][1], points[i][2],
            points[i][2], points[i][3],
            points[i][3], points[i][0]
        ];
        diamondLines.push(diamond);
        whiskerLines.push(
            [points[i][0], points[i][4]],
            [points[i][1], points[i][5]],
            [points[i][2], points[i][6]],
            [points[i][3], points[i][7]]
        );
        ribbonPaths.push([
            points[i][0], points[i][1], points[i][2], points[i][3], points[i][0]
        ]);
    }

    const allLines = [...diamondLines, ...whiskerLines];
    BABYLON.MeshBuilder.CreateLineSystem(null, { lines: allLines, instance: LineSystem });

    BABYLON.MeshBuilder.CreateRibbon(null, { pathArray: ribbonPaths, instance: ribbon });

    if (lineMat) {
        lineMat.setColor3("uColor", color);
        lineMat.setFloat("uClipZ", zClip);
    }
    if (ribbonMat) {
        ribbonMat.setColor3("uColor", color);
        ribbonMat.setFloat("uClipZ", zClip);
    }
}

export function clearGroupMeshes() {
    Object.keys(state.groupMeshes).forEach(group => {
        const entry = state.groupMeshes[group];
        if (entry) {
            if (entry.LineSystem) entry.LineSystem.dispose();
            if (entry.ribbon) entry.ribbon.dispose();
            if (entry.lineMat) entry.lineMat.dispose();
            if (entry.ribbonMat) entry.ribbonMat.dispose();
        }
        delete state.groupMeshes[group];
    });
}

export function updateAllGroupMeshUniforms() {
    state.datasetGroups.forEach((g, idx) => {
        const entry = state.groupMeshes[g.group];
        if (!entry) return;

        const originalColor = state.colors[g.group];
        const color = originalColor;

        // 2. Determine alpha based on user-configured groupAlphaMultiplier
        let lineAlpha = state.groupAlphaMultiplier;
        let ribbonAlpha = state.groupAlphaMultiplier * 0.85;

        // 3. Set line uniforms
        if (entry.lineMat) {
            entry.lineMat.setColor3("uColor", color);
            entry.lineMat.setFloat("uAlpha", lineAlpha);
            entry.lineMat.setFloat("uClipZ", state.zClip);
            entry.lineMat.alpha = lineAlpha;
        }

        // 4. Set ribbon uniforms
        if (entry.ribbonMat) {
            entry.ribbonMat.setColor3("uColor", color);
            entry.ribbonMat.setFloat("uAlpha", ribbonAlpha);
            entry.ribbonMat.setFloat("uClipZ", state.zClip);
            entry.ribbonMat.alpha = ribbonAlpha;
        }

        // 5. Update capping polygon meshes and materials
        const cap = state.capMeshes[g.group];
        if (cap) {
            // Apply a slight Z offset based on group index to prevent Z-fighting when all are shown
            const zOffsetEpsilon = idx * 0.0002;
            if (cap.lines) {
                cap.lines.position.z = zOffsetEpsilon;
                cap.lines.isVisible = true;
                cap.lines.color = originalColor.scale(0.5);
                cap.lines.renderingGroupId = 2;
            }
            if (cap.diamond) {
                cap.diamond.position.z = zOffsetEpsilon;
                cap.diamond.isVisible = true;
                if (cap.diamond.material) {
                    cap.diamond.material.diffuseColor = originalColor;
                    cap.diamond.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
                    cap.diamond.material.disableLighting = false;
                    cap.diamond.material.alpha = 1.0;
                    cap.diamond.renderingGroupId = 2;
                }
            }
        }
    });
}

export function moveToPreviousTimestamp() {
    if (!state.uniqueLocalTimestamps || state.uniqueLocalTimestamps.length === 0) return;
    const EPSILON = 0.0001;
    let targetZ = state.uniqueLocalTimestamps[0];
    let found = false;
    for (let i = state.uniqueLocalTimestamps.length - 1; i >= 0; i--) {
        if (state.uniqueLocalTimestamps[i] < state.zClip - EPSILON) {
            targetZ = state.uniqueLocalTimestamps[i];
            found = true;
            break;
        }
    }
    if (found) {
        state.zClip = targetZ;
        updateZClipUIAndApply();
    }
}

export function moveToNextTimestamp() {
    if (!state.uniqueLocalTimestamps || state.uniqueLocalTimestamps.length === 0) return;
    const EPSILON = 0.0001;
    let targetZ = state.uniqueLocalTimestamps[state.uniqueLocalTimestamps.length - 1];
    let found = false;
    for (let i = 0; i < state.uniqueLocalTimestamps.length; i++) {
        if (state.uniqueLocalTimestamps[i] > state.zClip + EPSILON) {
            targetZ = state.uniqueLocalTimestamps[i];
            found = true;
            break;
        }
    }
    if (found) {
        state.zClip = targetZ;
        updateZClipUIAndApply();
    }
}

function updateZClipUIAndApply() {
    if (state.clipPlaneSliderLeft) state.clipPlaneSliderLeft.position.z = state.zClip;
    if (state.clipPlaneSliderRight) state.clipPlaneSliderRight.position.z = state.zClip;
    if (state.clipPlaneMesh) state.clipPlaneMesh.position.z = state.zClip;
    if (state.applyClippingCallback) {
        state.applyClippingCallback();
    }
}

