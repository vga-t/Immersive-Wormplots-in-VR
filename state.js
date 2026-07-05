// state.js — Centralized shared mutable state
// Breaks circular dependency between main.js <-> controllers.js <-> helpers.js
// All modules import from this single source of truth.

export const state = {
    // Scene references
    scene: null,
    ground: null,

    // Persistent visualization container (TransformNode at Y=1.3m)
    visualizationContainer: null,

    // Boundary volume (EdgesRenderer cuboid)
    boundaryVolume: null,

    // Clipping plane infrastructure
    clipPlaneMesh: null,
    clipPlaneSliderLeft: null,
    clipPlaneSliderRight: null,
    sliderTrackLeft: null,
    sliderTrackRight: null,
    zClip: 1.5, // Starts at max Z (fully unclipped)

    // Timestamp data
    uniqueLocalTimestamps: [],
    rawTimestamps: [],

    // Processed dataset groups (normalized coordinates)
    datasetGroups: [],

    // Capping polygon meshes: { groupName: { lines, diamond } }
    capMeshes: {},

    // Wormplot geometry per group: { groupName: { LineSystem, ribbon, lineMat, ribbonMat } }
    groupMeshes: {},

    // Interactive grab nodes for scaling (corner spheres + face cubes)
    grabNodes: [],

    // Colors per group for the current dataset
    colors: {},

    // Group isolation state (-1 means none)
    isolatedGroupIndex: -1,

    // Dynamic alpha control for de-emphasized states
    groupAlphaMultiplier: 0.8,

    // Callback to apply clipping centrally
    applyClippingCallback: null,

    // Group hovered/pointed at by VR controller
    hoveredGroup: null,
};
