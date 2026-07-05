import { state } from './state.js';
import { currentDataset } from './ui.js';
import { datasetConfig } from './config.js';
import { updateAllGroupMeshUniforms } from './helpers.js';

export async function setupControllers(scene, xrHelper, ground) {
    let leftController = null;
    let rightController = null;

    // Pinch-to-scale variables
    let isSqueezingScale = false;
    let initialMidpoint = null;
    let initialDistance = 0;
    let initialContainerScale = null;
    let initialContainerPos = null;

    // Minimum scale clamp to prevent zero/negative/degenerate scaling
    const MIN_SCALE = 0.1;

    function checkFloorCollision() {
        if (!state.boundaryVolume || !state.visualizationContainer) return;
        const floorY = ground.position.y;

        // Calculate world positions of bottom corners of the bounding box
        const worldMatrix = state.boundaryVolume.computeWorldMatrix(true);
        const bottomCorners = [
            new BABYLON.Vector3(0.75, -0.75, 1.5),
            new BABYLON.Vector3(-0.75, -0.75, 1.5),
            new BABYLON.Vector3(0.75, -0.75, -1.5),
            new BABYLON.Vector3(-0.75, -0.75, -1.5),
        ];

        let minY = Infinity;
        bottomCorners.forEach(c => {
            const worldPoint = BABYLON.Vector3.TransformCoordinates(c, worldMatrix);
            if (worldPoint.y < minY) {
                minY = worldPoint.y;
            }
        });

        // Push visualization up if it clipped through the floor
        if (minY < floorY) {
            const deltaY = floorY - minY;
            state.visualizationContainer.position.y += deltaY;
        }
    }

    // Per-frame update loop for scaling, dragging, and floor collision
    scene.onBeforeRenderObservable.add(() => {
        if (!state.visualizationContainer) return;

        // 1. Handle Pinch-to-scale (both controllers squeezing)
        if (isSqueezingScale && leftController && rightController) {
            const leftPos = leftController.grip.position;
            const rightPos = rightController.grip.position;
            const currentMidpoint = BABYLON.Vector3.Center(leftPos, rightPos);
            const currentDist = BABYLON.Vector3.Distance(leftPos, rightPos);

            if (initialDistance > 0.01) {
                const scaleFactor = currentDist / initialDistance;
                const newScale = initialContainerScale.scale(scaleFactor);
                // Clamp minimum scale on all axes
                newScale.x = Math.max(newScale.x, MIN_SCALE);
                newScale.y = Math.max(newScale.y, MIN_SCALE);
                newScale.z = Math.max(newScale.z, MIN_SCALE);
                state.visualizationContainer.scaling = newScale;
                // Move container with hands' translation without scaling the offset distance
                state.visualizationContainer.position = currentMidpoint.add(
                    initialContainerPos.subtract(initialMidpoint)
                );
                checkFloorCollision();
            }
        }





        // 4. Handle Button Inputs for Opacity and Slider
        let changed = false;
        if (leftController && leftController.motionController) {
            const xButton = leftController.motionController.getComponent('x-button');
            const yButton = leftController.motionController.getComponent('y-button');
            
            if (xButton && xButton.pressed) {
                state.groupAlphaMultiplier = Math.max(0.0, Math.min(1.0, state.groupAlphaMultiplier - 0.015));
                changed = true;
            }
            if (yButton && yButton.pressed) {
                state.groupAlphaMultiplier = Math.max(0.0, Math.min(1.0, state.groupAlphaMultiplier + 0.015));
                changed = true;
            }
        }

        if (rightController && rightController.motionController) {
            const aButton = rightController.motionController.getComponent('a-button');
            const bButton = rightController.motionController.getComponent('b-button');
            
            if (aButton && aButton.pressed) {
                state.zClip = Math.max(-1.5, Math.min(1.5, state.zClip - 0.03));
                changed = true;
            }
            if (bButton && bButton.pressed) {
                state.zClip = Math.max(-1.5, Math.min(1.5, state.zClip + 0.03));
                changed = true;
            }
        }

        if (changed) {
            if (state.clipPlaneSliderLeft) state.clipPlaneSliderLeft.position.z = state.zClip;
            if (state.clipPlaneSliderRight) state.clipPlaneSliderRight.position.z = state.zClip;
            if (state.clipPlaneMesh) state.clipPlaneMesh.position.z = state.zClip;
            if (state.applyClippingCallback) {
                state.applyClippingCallback();
            }
        }


    });

    // Setup input events for XR controllers
    xrHelper.input.onControllerAddedObservable.add((controller) => {
        controller.onMotionControllerInitObservable.add((motionController) => {
            const squeezeComponent = motionController.getComponent('xr-standard-squeeze');
            const yButtonComponent = motionController.getComponent('y-button');
            const xButtonComponent = motionController.getComponent('x-button');

            // Apply custom material/glow once model is loaded automatically
            motionController.onModelLoadedObservable.add((mc) => {
                const meshes = mc.rootMesh.getChildMeshes(false);
                meshes.forEach(mesh => {
                    const emissiveMaterial = new BABYLON.StandardMaterial("emissiveMaterial", scene);
                    emissiveMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5);
                    mesh.material = emissiveMaterial;
                });
            });

            if (motionController.handness === 'left') {
                leftController = controller;

            } else {
                rightController = controller;
            }

            // Squeeze: pinch-to-scale setup
            squeezeComponent.onButtonStateChangedObservable.add(() => {
                if (squeezeComponent.changes.pressed) {
                    if (squeezeComponent.pressed) {
                        // Start pinch-to-scale when both controllers are squeezing
                        if (leftController && rightController &&
                            leftController.motionController.getComponent('xr-standard-squeeze').pressed &&
                            rightController.motionController.getComponent('xr-standard-squeeze').pressed) {

                            isSqueezingScale = true;
                            const leftPos = leftController.grip.position;
                            const rightPos = rightController.grip.position;
                            initialMidpoint = BABYLON.Vector3.Center(leftPos, rightPos);
                            initialDistance = BABYLON.Vector3.Distance(leftPos, rightPos);
                            initialContainerScale = state.visualizationContainer.scaling.clone();
                            initialContainerPos = state.visualizationContainer.position.clone();
                        }
                    } else {
                        isSqueezingScale = false;
                    }
                }
            });


        });
    });


}