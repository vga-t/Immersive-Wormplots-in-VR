import { groupMeshes } from './helpers.js';
import { currentDataset } from './ui.js';
import { datasetConfig } from './config.js';

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

    let isDragging = false;
    let draggingMesh = null;
    const dragSpeed = 10; // User defined speed
    let movementAxis = 'z'; // New: current movement axis ("z" or "x")
    let directionSign = 1;  // New: positive or negative movement sign

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
        if (isDragging && draggingMesh) {
            const deltaTime = scene.getEngine().getDeltaTime() / 1000;
            if (movementAxis === 'z') {
                draggingMesh.position.z += directionSign * dragSpeed * deltaTime;
            } else if (movementAxis === 'x') {
                draggingMesh.position.x += directionSign * dragSpeed * deltaTime;
            }
        }

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

                // Updated left squeeze handler: only use for scaling, no drag toggling
                squeezeComponent.onButtonStateChangedObservable.add(() => {
                    if (squeezeComponent.changes.pressed) {
                        if (squeezeComponent.pressed) {
                            if (draggingMesh) {
                                // Toggle sign of movement direction when dragging
                                directionSign *= -1;
                            } else if (leftController && rightController && pickedMesh) {
                                startScaling();
                            }
                        } else {
                            if (!draggingMesh) {
                                stopScaling();
                            }
                        }
                    }
                });

                // Left trigger now solely toggles drag movement
                triggerComponent.onButtonStateChangedObservable.add(() => {
                    if (triggerComponent.changes.pressed && triggerComponent.pressed) {
                        if (isDragging) {
                            isDragging = false;
                            draggingMesh = null;
                        } else {
                            let mesh = scene.meshUnderPointer;
                            if (xrHelper.pointerSelection.getMeshUnderPointer) {
                                mesh = xrHelper.pointerSelection.getMeshUnderPointer(controller.uniqueId);
                            }
                            if (mesh && mesh !== ground) {
                                const processed = Object.values(groupMeshes).some(entry => {
                                    if (Array.isArray(entry)) {
                                        return entry.some(sub => sub.parentNode === mesh.parent);
                                    } else {
                                        return entry.parentNode === mesh.parent;
                                    }
                                });
                                if (processed) {
                                    draggingMesh = mesh.parent;
                                    isDragging = true;
                                }
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
                        if (squeezeComponent.pressed) {
                            // If left trigger is pressed, do global scaling
                            const leftTrigger = leftController.motionController.getComponent('xr-standard-trigger');
                            if (leftTrigger && leftTrigger.pressed) {
                                startGlobalScaling(leftController, rightController);
                            }
                            // Otherwise, if dragging, use right squeeze to toggle movement axis
                            else if (draggingMesh) {
                                movementAxis = (movementAxis === 'z') ? 'x' : 'z';
                            }
                        } else {
                            if (isGlobalScaling) {
                                stopGlobalScaling();
                            }
                        }
                    }
                });

                aComponent.onButtonStateChangedObservable.add(() => {
                    if (aComponent.pressed) {
                        isOffset = !isOffset;
                        const groups = Object.keys(groupMeshes);

                        if (currentDataset === 'WeatherDetailed') {
                            // For detailed weather: compute offset per color.
                            const dsColors = datasetConfig[currentDataset].colors;
                            const mid = (dsColors.length - 1) / 2;
                            // For each group, use the index modulo colors to determine offset.
                            groups.forEach((groupName, i) => {
                                const colorIndex = i % dsColors.length;
                                const offset = (colorIndex - mid) * offsetValue;
                                // For each mesh in this group, apply the same offset.
                                const entry = groupMeshes[groupName];
                                const updateMeshOffset = (parentNode, key) => {
                                    if (!originalPositions[groupName]) {
                                        originalPositions[groupName] = {};
                                    }
                                    if (originalPositions[groupName][key] === undefined) {
                                        originalPositions[groupName][key] = parentNode.position.x;
                                    }
                                    parentNode.position.x = isOffset ?
                                        originalPositions[groupName][key] + offset :
                                        originalPositions[groupName][key];
                                };
                                if (Array.isArray(entry)) {
                                    entry.forEach((subGroup, j) => {
                                        if (Array.isArray(subGroup)) {
                                            subGroup.forEach((meshObj, k) => {
                                                if (meshObj.parentNode) {
                                                    updateMeshOffset(meshObj.parentNode, `${j}-${k}`);
                                                }
                                            });
                                        } else {
                                            if (subGroup.parentNode) {
                                                updateMeshOffset(subGroup.parentNode, `${j}-0`);
                                            }
                                        }
                                    });
                                } else {
                                    if (entry.parentNode) {
                                        updateMeshOffset(entry.parentNode, `0-0`);
                                    }
                                }
                            });
                        } else {
                            // Default offsetting logic for other datasets.
                            const indexOffset = (groups.length - 1) / 2;
                            const handleOffsetToggle = (parentNode, gName, i, j, k, idxOffset) => {
                                const calculatedOffset = (i - idxOffset) * offsetValue + (j * offsetValue) + (k * offsetValue);
                                if (!originalPositions[gName]) {
                                    originalPositions[gName] = {};
                                }
                                const key = `${j}-${k}`;
                                if (originalPositions[gName][key] === undefined) {
                                    originalPositions[gName][key] = parentNode.position.x;
                                }
                                parentNode.position.x = isOffset ?
                                    originalPositions[gName][key] + calculatedOffset :
                                    originalPositions[gName][key];
                            };

                            groups.forEach((groupName, i) => {
                                const groupEntry = groupMeshes[groupName];
                                if (Array.isArray(groupEntry)) {
                                    groupEntry.forEach((subGroup, j) => {
                                        if (Array.isArray(subGroup)) {
                                            subGroup.forEach((meshObj, k) => {
                                                if (meshObj.parentNode) {
                                                    handleOffsetToggle(meshObj.parentNode, groupName, i, j, k, indexOffset);
                                                }
                                            });
                                        } else {
                                            if (subGroup.parentNode) {
                                                handleOffsetToggle(subGroup.parentNode, groupName, i, j, 0, indexOffset);
                                            }
                                        }
                                    });
                                } else {
                                    if (groupEntry.parentNode) {
                                        handleOffsetToggle(groupEntry.parentNode, groupName, i, 0, 0, indexOffset);
                                    }
                                }
                            });
                        }
                    }
                });

                // ...remaining right-controller code...
                function handleOffsetToggle(parentNode, gName, i, j, k, indexOffset) {
                    // (original function not used for detailed weather)
                    const calculatedOffset = (i - indexOffset) * offsetValue + (j * offsetValue) + (k * offsetValue);
                    if (!originalPositions[gName]) {
                        originalPositions[gName] = {};
                    }
                    const key = `${j}-${k}`;
                    if (originalPositions[gName][key] === undefined) {
                        originalPositions[gName][key] = parentNode.position.x;
                    }
                    parentNode.position.x = isOffset ?
                        originalPositions[gName][key] + calculatedOffset :
                        originalPositions[gName][key];
                }
            }
        });
    });

    // Setup slider inputs for offsetValue, flightSpeed and dragSpeed
    const offsetSlider = document.getElementById('offsetSlider');
    const flightSpeedSlider = document.getElementById('flightSpeedSlider');
    const dragSpeedSlider = document.getElementById('dragSpeedSlider');

    if (offsetSlider) {
        offsetSlider.value = offsetValue;
        offsetSlider.oninput = () => { offsetValue = parseFloat(offsetSlider.value); };
    }

    if (flightSpeedSlider) {
        flightSpeedSlider.value = flightSpeed;
        flightSpeedSlider.oninput = () => { flightSpeed = parseFloat(flightSpeedSlider.value); };
    }

    if (dragSpeedSlider) {
        dragSpeedSlider.value = dragSpeed;
        dragSpeedSlider.oninput = () => { dragSpeed = parseFloat(dragSpeedSlider.value); };
    }
}