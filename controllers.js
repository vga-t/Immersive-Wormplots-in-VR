import { groupMeshes } from './helpers.js';

export async function setupControllers(scene, xrHelper, panel, anchor, ground) {
    let leftController, rightController;
    let initialDistance = null;
    let initialScale = null;
    let isScaling = false;
    let pickedMesh = null;
    let originalParent = null;
    let isPanelVisible = false;
    let isFlying = false;
    let flightSpeed = 0.1;

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

    function updatePanelPosition() {
        const xrCamera = xrHelper.baseExperience.camera;
        const forward = xrCamera.getDirection(BABYLON.Vector3.Forward());
        anchor.position = xrCamera.position.add(forward.scale(2));
        anchor.lookAt(xrCamera.position, 0, Math.PI, Math.PI);
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

        if (isFlying) {
            const xrCamera = xrHelper.baseExperience.camera;
            const forward = xrCamera.getDirection(BABYLON.Vector3.Forward()).scale(flightSpeed);
            xrCamera.position.addInPlace(forward);
        }
    });

    xrHelper.input.onControllerAddedObservable.add((controller) => {
        controller.onMotionControllerInitObservable.add((motionController) => {
            const triggerComponent = motionController.getComponent('xr-standard-trigger');
            const squeezeComponent = motionController.getComponent('xr-standard-squeeze');
            const menuComponent = motionController.getComponent('x-button');
            const flightComponent = motionController.getComponent('y-button');

            const profileId = motionController.profileId;
            BABYLON.SceneLoader.ImportMesh("", "https://controllers.babylonjs.com/", `${profileId}.glb`, scene, (meshes) => {
                meshes.forEach(mesh => {
                    mesh.parent = motionController.rootMesh;
                    const emissiveMaterial = new BABYLON.StandardMaterial("emissiveMaterial", scene);
                    emissiveMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
                    mesh.material = emissiveMaterial;
                });
            });

            if (motionController.handness === 'left') {
                leftController = controller;

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

                if (flightComponent) {
                    flightComponent.onButtonStateChangedObservable.add(() => {
                        if (flightComponent.pressed) {
                            isFlying = !isFlying;
                        }
                    });
                }

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

                triggerComponent.onButtonStateChangedObservable.add(() => {
                    if (triggerComponent.changes.pressed) {
                        if (triggerComponent.pressed) {
                            let mesh = scene.meshUnderPointer;
                            if (xrHelper.pointerSelection.getMeshUnderPointer) {
                                mesh = xrHelper.pointerSelection.getMeshUnderPointer(controller.uniqueId);
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
}