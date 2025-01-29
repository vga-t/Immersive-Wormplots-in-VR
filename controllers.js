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
    let isOffset = false;
    let originalPositions = {}; // { groupName: [list of original x-positions], ... }
    let offsetValue = 3; // Variable to control the offset amount

    let isGlobalScaling = false;
    let initialScalingDistance = 0;
    let initialScales = {};

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

    function startGlobalScaling(leftController, rightController) {
        if (leftController && rightController) {
            initialScalingDistance = BABYLON.Vector3.Distance(
                leftController.grip.position,
                rightController.grip.position
            );
            // Store initial scales of all meshes
            initialScales = {};
            Object.keys(groupMeshes).forEach(group => {
                const entry = groupMeshes[group];
                if (Array.isArray(entry)) {
                    entry.forEach(sub => {
                        if (sub.parentNode) {
                            initialScales[sub.parentNode.name] = sub.parentNode.scaling.clone();
                        }
                    });
                } else {
                    if (entry.parentNode) {
                        initialScales[entry.parentNode.name] = entry.parentNode.scaling.clone();
                    }
                }
            });
            isGlobalScaling = true;
        }
    }

    function stopGlobalScaling() {
        isGlobalScaling = false;
        initialScalingDistance = 0;
        initialScales = {};
    }

    function updateGlobalScaling(leftController, rightController) {
        if (isGlobalScaling && leftController && rightController) {
            const currentDistance = BABYLON.Vector3.Distance(
                leftController.grip.position,
                rightController.grip.position
            );
            const scaleFactor = currentDistance / initialScalingDistance;
            Object.keys(groupMeshes).forEach(group => {
                const entry = groupMeshes[group];
                if (Array.isArray(entry)) {
                    entry.forEach(sub => {
                        if (sub.parentNode && initialScales[sub.parentNode.name]) {
                            sub.parentNode.scaling = initialScales[sub.parentNode.name].multiply(
                                new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor)
                            );
                        }
                    });
                } else {
                    if (entry.parentNode && initialScales[entry.parentNode.name]) {
                        entry.parentNode.scaling = initialScales[entry.parentNode.name].multiply(
                            new BABYLON.Vector3(scaleFactor, scaleFactor, scaleFactor)
                        );
                    }
                }
            });
        }
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

        if (isGlobalScaling) {
            updateGlobalScaling(leftController, rightController);
        }
    });

    xrHelper.input.onControllerAddedObservable.add((controller) => {
        controller.onMotionControllerInitObservable.add((motionController) => {
            const triggerComponent = motionController.getComponent('xr-standard-trigger');
            const squeezeComponent = motionController.getComponent('xr-standard-squeeze');
            const menuComponent = motionController.getComponent('x-button');
            const flightComponent = motionController.getComponent('y-button');
            const aComponent = motionController.getComponent('a-button');

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

                const triggerComponent = motionController.getComponent('xr-standard-trigger');

                triggerComponent.onButtonStateChangedObservable.add(() => {
                    if (triggerComponent.changes.pressed) {
                        if (triggerComponent.pressed && squeezeComponent && squeezeComponent.pressed) {
                            startGlobalScaling(leftController, rightController);
                        } else {
                            if (isGlobalScaling) {
                                stopGlobalScaling();
                            }
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

                            const foundGroup = Object.keys(groupMeshes).find(g => {
                                const entry = groupMeshes[g];
                                if (Array.isArray(entry)) {
                                    return entry.some(sub =>
                                        sub.parentNode === mesh ||
                                        sub.LineSystem === mesh ||
                                        sub.ribbon === mesh
                                    );
                                } else {
                                    return entry.parentNode === mesh ||
                                           entry.LineSystem === mesh ||
                                           entry.ribbon === mesh;
                                }
                            });

                            if (foundGroup) {
                                const entry = groupMeshes[foundGroup];
                                if (Array.isArray(entry)) {
                                    const subItem = entry.find(sub =>
                                        sub.parentNode === mesh ||
                                        sub.LineSystem === mesh ||
                                        sub.ribbon === mesh
                                    );
                                    if (subItem) {
                                        pickedMesh = subItem.parentNode;
                                    }
                                } else {
                                    pickedMesh = entry.parentNode;
                                }
                                if (pickedMesh) {
                                    originalParent = pickedMesh.parent;
                                    pickedMesh.setParent(motionController.rootMesh);
                                }
                            }
                        } else {
                            if (pickedMesh) {
                                pickedMesh.setParent(originalParent);
                                pickedMesh = null;
                            }
                        }
                    }
                });

                squeezeComponent.onButtonStateChangedObservable.add(() => {
                    if (squeezeComponent.changes.pressed) {
                        if (squeezeComponent.pressed && leftController && rightController) {
                            // Check if left trigger is also pressed
                            const leftTrigger = leftController.motionController.getComponent('xr-standard-trigger');
                            if (leftTrigger && leftTrigger.pressed) {
                                startGlobalScaling(leftController, rightController);
                            }
                        } else {
                            if (isGlobalScaling) {
                                stopGlobalScaling();
                            } else {
                                // ...existing code...
                            }
                        }
                    }
                });

                aComponent.onButtonStateChangedObservable.add(() => {
                    if (aComponent.pressed) {
                        const groups = Object.keys(groupMeshes);
                        isOffset = !isOffset;
                        let indexOffset = (groups.length - 1) / 2;

                        groups.forEach((groupName, i) => {
                            const groupEntry = groupMeshes[groupName];
    
                            if (Array.isArray(groupEntry)) {
                                groupEntry.forEach((subGroup, j) => {
                                    if (Array.isArray(subGroup)) {
                                        subGroup.forEach((meshObj, k) => {
                                            const parentNode = meshObj.parentNode;
                                            if (!parentNode) return;
                                            handleOffsetToggle(parentNode, groupName, i, j, k, indexOffset);
                                        });
                                    } else {
                                        const parentNode = subGroup.parentNode;
                                        if (!parentNode) return;
                                        handleOffsetToggle(parentNode, groupName, i, j, 0, indexOffset);
                                    }
                                });
                            } else {
                                const parentNode = groupEntry.parentNode;
                                if (!parentNode) return;
                                handleOffsetToggle(parentNode, groupName, i, 0, 0, indexOffset);
                            }
                        });
                    }
                });

                function handleOffsetToggle(parentNode, gName, i, j, k, indexOffset) {
                    const calculatedOffset = (i - indexOffset) * offsetValue + (j * offsetValue) + (k * offsetValue);
                    // Store original positions once
                    if (!originalPositions[gName]) {
                        originalPositions[gName] = {};
                    }
                    const id = `${j}-${k}`;
                    if (originalPositions[gName][id] === undefined) {
                        originalPositions[gName][id] = parentNode.position.x;
                    }
                    if (isOffset) {
                        parentNode.position.x = originalPositions[gName][id] + calculatedOffset;
                    } else {
                        // Restore original position
                        parentNode.position.x = originalPositions[gName][id];
                    }
                }
            }
        });
    });
}