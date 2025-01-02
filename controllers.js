
import { groupMeshes, toggleVisibility, getRandomColor } from './helpers.js';

export function setupControllers(scene) {
    const xrHelper = scene.createDefaultXRExperienceAsync({
        floorMeshes: [ground],
        inputOptions: {
            disableDefaultControllerMesh: true,
        }
    });

    xrHelper.then(async (xrHelperInstance) => {
        let leftController, rightController;
        let initialDistance = null;
        let initialScale = null;
        let isScaling = false;
        let pickedMesh = null;
        let originalParent = null;

        // Existing scaling and other methods remain the same
        function startScaling() {
            if (leftController && rightController && pickedMesh) {
                const leftPosition = leftController.grip.position;
                const rightPosition = rightController.grip.position;
                initialDistance = BABYLON.Vector3.Distance(leftPosition, rightPosition);
                initialScale = pickedMesh.scaling.clone();
                isScaling = true;
            }
        }

        function stopScaling() {
            isScaling = false;
            initialDistance = null;
            initialScale = null;
        }

        scene.onBeforeRenderObservable.add(() => {
            if (isScaling && leftController && rightController && pickedMesh) {
                const leftPosition = leftController.grip.position;
                const rightPosition = rightController.grip.position;
                const currentDistance = BABYLON.Vector3.Distance(leftPosition, rightPosition);
                if (initialDistance && initialScale) {
                    const scaleFactor = currentDistance / initialDistance;
                    pickedMesh.scaling = initialScale.multiply(new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor));
                }
            }
        });

        xrHelperInstance.input.onControllerAddedObservable.add((controller) => {
            controller.onMotionControllerInitObservable.add((motionController) => {
                const triggerComponent = motionController.getComponent('xr-standard-trigger');
                const squeezeComponent = motionController.getComponent('xr-standard-squeeze');
                const menuComponent = motionController.getComponent('x-button');

                // Load the appropriate controller model based on profileId
                const profileId = motionController.profileId;
                BABYLON.SceneLoader.ImportMesh("", "https://controllers.babylonjs.com/", `${profileId}.glb`, scene, (meshes) => {
                    meshes.forEach(mesh => {
                        mesh.parent = motionController.rootMesh;

                        // Make the mesh emissive
                        const emissiveMaterial = new BABYLON.StandardMaterial("emissiveMaterial", scene);
                        emissiveMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1); // Set emissive color to white
                        mesh.material = emissiveMaterial;
                    });
                });

                if (motionController.handness === 'left') {
                    leftController = controller;

                    // Menu button toggle
                    if (menuComponent) {
                        menuComponent.onButtonStateChangedObservable.add(() => {
                            if (menuComponent.pressed) {
                                isPanelVisible = !isPanelVisible;
                                if (isPanelVisible) {
                                    updatePanelPosition();
                                }
                                panel.isVisible = isPanelVisible;
                                panel.children.forEach(button => {
                                    button.isVisible = isPanelVisible;
                                    button.isPickable = isPanelVisible;
                                });
                            }
                        });
                    }

                    // Scaling using left squeeze and right trigger
                    squeezeComponent.onButtonStateChangedObservable.add(() => {
                        if (squeezeComponent.changes.pressed) {
                            if (squeezeComponent.pressed && leftController && rightController && pickedMesh) {
                                startScaling();
                            } else {
                                stopScaling();
                            }
                        }
                    });
                } else if (motionController.handness === 'right') {
                    rightController = controller;

                    // Move worm plots using either controller's trigger
                    triggerComponent.onButtonStateChangedObservable.add(() => {
                        if (triggerComponent.changes.pressed) {
                            if (triggerComponent.pressed) {
                                let mesh = scene.meshUnderPointer;
                                if (xrHelperInstance.pointerSelection.getMeshUnderPointer) {
                                    mesh = xrHelperInstance.pointerSelection.getMeshUnderPointer(controller.uniqueId);
                                }
                                if (mesh === ground) {
                                    return;
                                }
                                const group = Object.keys(groupMeshes).find(group =>
                                    groupMeshes[group].parentNode === mesh ||
                                    groupMeshes[group].LineSystem === mesh ||
                                    groupMeshes[group].ribbon === mesh
                                );
                                if (group) {
                                    pickedMesh = groupMeshes[group].parentNode;
                                    originalParent = pickedMesh.parent;
                                    pickedMesh.setParent(motionController.rootMesh);
                                }
                            } else {
                                if (pickedMesh) {
                                    pickedMesh.setParent(originalParent);
                                    pickedMesh = null;
                                }
                            }
                        }
                    });
                }
            });
        });

        // ...existing controller-related code...
    });
}