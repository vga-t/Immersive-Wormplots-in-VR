
export const groupMeshes = {};

export function toggleVisibility(group) {
    const meshes = groupMeshes[group];
    if (meshes) {
        meshes.LineSystem.isVisible = !meshes.LineSystem.isVisible;
        meshes.ribbon.isVisible = !meshes.ribbon.isVisible;
    }
}

export function getRandomColor() {
    return new BABYLON.Color3(
        Math.random(),
        Math.random(),
        Math.random()
    );
}