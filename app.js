
async function initializeScene() {

try {
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);

    var camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(-6.58, 2.72, -5.40), scene);
    camera.setTarget(new BABYLON.Vector3(24.19, 2.92, 47.08));
    camera.attachControl(canvas, true);

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 300 }, scene);
    const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
    //groundMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    groundMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMaterial;
    ground.position = new BABYLON.Vector3(5, 0.5, 90);

    //const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(5, 0, -50), scene);
    
    // light.position = new BABYLON.Vector3(6.465342998504639, 4.947967052459717, 1.6477842330932617);
    // light.direction = new BABYLON.Vector3(-0.0005480896732761323, 0.2887493048221811, 0.9574045845735318);


    const xrHelper = await scene.createDefaultXRExperienceAsync({
        floorMeshes: [ground],
        inputOptions: {
            controllerType: "oculusQuest"
        }
    });

    let leftController, rightController;
    let initialDistance = null;
    let initialScale = null;
    let isScaling = false;
    let pickedMesh = null;
    let originalParent = null;
    const groupMeshes = {};

    // Create the 3D UI manager
    const manager = new BABYLON.GUI.GUI3DManager(scene);

    // Create plane panel
    const panel = new BABYLON.GUI.PlanePanel();
    panel.margin = 0.02;
    manager.addControl(panel);

    // Set panel dimensions
    panel.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3);

    // Create an anchor for the panel
    const anchor = new BABYLON.TransformNode("panelAnchor");
    panel.linkToTransformNode(anchor);


        // Create walls around the ground
        const wallMaterial = new BABYLON.StandardMaterial("wallMaterial", scene);
        wallMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        //wallMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        wallMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        const wallThickness = 0.5;
        const wallHeight = 30;

        const createWall = (name, width, height, depth, position,wallMaterial) => {
            const wall = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
            wall.material = wallMaterial;
            wall.position = position;
            
            return wall;
        };

        const wall1 = createWall("wall1", 100, wallHeight, wallThickness, new BABYLON.Vector3(5, wallHeight / 2, 240),wallMaterial);
        const wall2 = createWall("wall2", 100, wallHeight, wallThickness, new BABYLON.Vector3(5, wallHeight / 2, -60),wallMaterial);
        const wall3 = createWall("wall3", wallThickness, wallHeight, 300, new BABYLON.Vector3(55, wallHeight / 2, 90),wallMaterial);
        const wall4 = createWall("wall4", wallThickness, wallHeight, 300, new BABYLON.Vector3(-45, wallHeight / 2, 90),wallMaterial);
        const roof = createWall("roof", 100, wallThickness, 300, new BABYLON.Vector3(5, wallHeight + wallThickness / 2, 90), wallMaterial);
        // Add 4 point lights at the center of each wall and 1 at the center of the roof
        const lightIntensity = 1.0;
        const lightPositions = [
            new BABYLON.Vector3(5, wallHeight / 2, -60), // Center of front wall
            new BABYLON.Vector3(5, wallHeight / 2, 240), // Center of back wall
            new BABYLON.Vector3(-45, wallHeight / 2, 90), // Center of left wall
            new BABYLON.Vector3(55, wallHeight / 2, 90), // Center of right wall
        ];
        const lightDirections = [
            new BABYLON.Vector3(0, 0, 1), // Direction for front wall light
            new BABYLON.Vector3(0, 0, -1), // Direction for back wall light
            new BABYLON.Vector3(1, 0, 0), // Direction for left wall light
            new BABYLON.Vector3(-1, 0, 0), // Direction for right wall light
        ];

        const groundLight = new BABYLON.DirectionalLight("groundLight", new BABYLON.Vector3(0, -1, 0), scene);
        groundLight.position = new BABYLON.Vector3(5, 10, 90);
        groundLight.intensity = lightIntensity;

        const roofLight = new BABYLON.DirectionalLight("roofLight", new BABYLON.Vector3(0, 1, 0), scene);
        roofLight.position = new BABYLON.Vector3(5, wallHeight + wallThickness, 90);
        roofLight.intensity = lightIntensity;

        lightPositions.forEach((position, index) => {
            const light = new BABYLON.PointLight(`pointLight${index + 1}`, position, scene);
            light.intensity = lightIntensity;
            light.direction = lightDirections[index];
        });


        const df = await loadCSVData();
        if (!df) {
            console.error('Failed to load Dataset.csv');
            return;
        }
        
        
        const wormName = "city_name";
        const TimeAttribute = "time_int";
        const Groups = df[wormName].unique().values;
        const Attribute1 = "tmin";
        const Attribute2 = "tmax";

        let allBoxPlotValues = [];

        for (let Group of Groups) {
            let filteredDf = df.loc({ rows: df[wormName].eq(Group), columns: [TimeAttribute, Attribute1, Attribute2] });
            let groupedDf = filteredDf.groupby([TimeAttribute]);
            let Attrnames = [Attribute1, Attribute2];
            let intermediate = {};
            let [min, Q1, median, Q3, IQR, max] = [[], [], [], [], [], []];
            let boxPLotvalues = [];

            for (let timeStamp of filteredDf[TimeAttribute].unique().values) {
                Attrnames.forEach((Attrname, i) => intermediate[i] = groupedDf.getGroup([timeStamp])[Attrname].values);
                for (let i = 0; i < 2; i++) {
                    Q1[i] = math.quantileSeq(intermediate[i], 0.25);
                    median[i] = math.quantileSeq(intermediate[i], 0.5);
                    Q3[i] = math.quantileSeq(intermediate[i], 0.75);
                    IQR = Q3[i] - Q1[i];
                    min[i] = math.min(intermediate[i].filter(value => value >= (Q1[i] - 1.5 * IQR)));
                    max[i] = math.max(intermediate[i].filter(value => value <= (Q3[i] + 1.5 * IQR)));
                }

                boxPLotvalues.push([
                    new BABYLON.Vector3(median[0], Q1[1], timeStamp),
                    new BABYLON.Vector3(Q1[0], median[1], timeStamp),
                    new BABYLON.Vector3(median[0], Q3[1], timeStamp),
                    new BABYLON.Vector3(Q3[0], median[1], timeStamp),
                    new BABYLON.Vector3(median[0], min[1], timeStamp),
                    new BABYLON.Vector3(min[0], median[1], timeStamp),
                    new BABYLON.Vector3(median[0], max[1], timeStamp),
                    new BABYLON.Vector3(max[0], median[1], timeStamp)
                ]);
            }

            allBoxPlotValues.push({ group: Group, values: boxPLotvalues });
        }

        function connectPoints(points, scene, color, group) {
            let diamondLines = [];
            let whiskerLines = [];
            for (let i = 0; i < points.length; i++) {
                let diamond = [
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
            }

            let allLines = [...diamondLines, ...whiskerLines];
            let LineSystem = BABYLON.MeshBuilder.CreateLineSystem(`lines_${group}`, { lines: allLines }, scene);
            LineSystem.color = color;
            var paths = diamondLines.map(line => line.flat());
            var ribbon = BABYLON.Mesh.CreateRibbon(`ribbon_${group}`, paths, false, false, 0, scene);
            const ribbonMaterial = new BABYLON.StandardMaterial(`ribbonMaterial_${group}`, scene);
            ribbonMaterial.diffuseColor = color;
            //ribbonMaterial.emissiveColor = color;
            ribbonMaterial.backFaceCulling = false;
            ribbon.material = ribbonMaterial;

            const parentNode = new BABYLON.TransformNode(`parent_${group}`, scene);
            LineSystem.parent = parentNode;
            ribbon.parent = parentNode;

            parentNode.scaling = new BABYLON.Vector3(0.8, 0.8, 0.8);
            parentNode.position = new BABYLON.Vector3(5, 0.5, 13.57);
            groupMeshes[group] = { parentNode, LineSystem, ribbon };
        }

        function getRandomColor() {
            return new BABYLON.Color3(
                Math.random(),
                Math.random(),
                Math.random()
            );
        }

        const colors = {};
        Groups.forEach(group => {
            colors[group] = getRandomColor();
        });

        allBoxPlotValues.forEach(groupData => {
            connectPoints(groupData.values, scene, colors[groupData.group], groupData.group);
        });

        function toggleVisibility(group) {
            const meshes = groupMeshes[group];
            if (meshes) {
                meshes.LineSystem.isVisible = !meshes.LineSystem.isVisible;
                meshes.ribbon.isVisible = !meshes.ribbon.isVisible;
            }
        }

        // Add buttons to the panel
        const addButton = function(group, color) {
            const button = new BABYLON.GUI.HolographicButton("button_" + group);
            button.width = "0.15";
            button.height = "0.15";
            panel.addControl(button);
            button.text = group;
            const buttonMaterial = new BABYLON.StandardMaterial("buttonColor_" + group, scene);
            buttonMaterial.diffuseColor = color;
            button.mesh.material = buttonMaterial;
            button.onPointerUpObservable.add(() => {
                toggleVisibility(group);
            });
        }

        Groups.forEach(group => {
            addButton(group, colors[group]);
        });

        // Function to update panel position
        const updatePanelPosition = () => {
            const xrCamera = xrHelper.baseExperience.camera;
            const forward = xrCamera.getDirection(BABYLON.Vector3.Forward());
            anchor.position = xrCamera.position.add(forward.scale(2));
            anchor.lookAt(xrCamera.position, 0, Math.PI, Math.PI);
        };

        // Toggle panel visibility and interactivity
        let isPanelVisible = false;
        //updatePanelPosition();

        xrHelper.input.onControllerAddedObservable.add((controller) => {
            controller.onMotionControllerInitObservable.add((motionController) => {
                const triggerComponent = motionController.getComponent('xr-standard-trigger');
                const squeezeComponent = motionController.getComponent('xr-standard-squeeze');
                const menuComponent = motionController.getComponent('x-button');

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
                } 
                else if (motionController.handness === 'right') {
                    rightController = controller;

                    // Move worm plots using either controller's trigger
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




    
        scene.debugLayer.show();


    

    engine.runRenderLoop(function() {
        scene.render();
    });

    window.addEventListener("resize", function() {
        engine.resize();
    });
}catch (error) {
    console.error('Error initializing scene:', error);
}

}
async function loadCSVData() {
    try {

        const df = await dfd.readCSV("./Dataset.csv");
        return df;
    } catch (error) {
        console.error('Error loading CSV:', error);
        return null;
    }
}
initializeScene();

