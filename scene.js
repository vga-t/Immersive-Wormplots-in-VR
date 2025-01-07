import { loadCSVData } from './dataLoader.js';
import { currentDataset, attribute1, attribute2, setupUI } from './ui.js'; // Add setupUI import
import { datasetConfig } from './config.js';
import { setupControllers } from './controllers.js';
import { groupMeshes, getRandomColor, toggleVisibility } from './helpers.js'; 




export async function initializeScene() {
    try {
        setupUI(initializeScene); // Ensure we have up-to-date UI selections
        const canvas = document.getElementById("renderCanvas");
        const engine = new BABYLON.Engine(canvas, true, { xrCompatible: true }); // Set xrCompatible to true
        const scene = new BABYLON.Scene(engine);

        // Set up the camera
        var camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(-6.58, 2.72, -5.40), scene);
        camera.setTarget(new BABYLON.Vector3(24.19, 2.92, 47.08));
        camera.attachControl(canvas, true);

        // Create the ground
        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 300 }, scene);
        const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
        groundMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        groundMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        ground.material = groundMaterial;
        ground.position = new BABYLON.Vector3(5, 0.5, 90);

        // Create XR experience
        const xrHelper = await scene.createDefaultXRExperienceAsync({
            floorMeshes: [ground],
            inputOptions: {
                disableDefaultControllerMesh: true,
            }
        });

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


        
        // Call setupControllers to handle all controller logic
        await setupControllers(scene, xrHelper, panel, anchor, ground);

        // Create walls around the ground
        const wallMaterial = new BABYLON.StandardMaterial("wallMaterial", scene);
        wallMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        wallMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        const wallThickness = 0.5;
        const wallHeight = 30;

        const createWall = (name, width, height, depth, position, wallMaterial) => {
            const wall = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
            wall.material = wallMaterial;
            wall.position = position;
            return wall;
        };

        const wall1 = createWall("wall1", 100, wallHeight, wallThickness, new BABYLON.Vector3(5, wallHeight / 2, 240), wallMaterial);
        const wall2 = createWall("wall2", 100, wallHeight, wallThickness, new BABYLON.Vector3(5, wallHeight / 2, -60), wallMaterial);
        const wall3 = createWall("wall3", wallThickness, wallHeight, 300, new BABYLON.Vector3(55, wallHeight / 2, 90), wallMaterial);
        const wall4 = createWall("wall4", wallThickness, wallHeight, 300, new BABYLON.Vector3(-45, wallHeight / 2, 90), wallMaterial);
        const roof = createWall("roof", 100, wallThickness, 300, new BABYLON.Vector3(5, wallHeight + wallThickness / 2, 90), wallMaterial);

        // Add lights
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

        // Load CSV data
        const df = await loadCSVData(currentDataset);
        if (!df) {
            console.error('Failed to load Dataset.csv');
            return;
        }

        const cfg = datasetConfig[currentDataset];
        const wormName = cfg.wormName;
        const TimeAttribute = cfg.timeAttribute;
        const Groups = df[wormName].unique().values;
        const Attribute1 = attribute1;
        const Attribute2 = attribute2;

        let allBoxPlotValues = [];

        // Process data for each group
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

                if (Attribute1 === Attribute2) {
                    boxPLotvalues.push([
                        new BABYLON.Vector3(median[0], Q1[0], timeStamp),
                        new BABYLON.Vector3(Q1[0], median[0], timeStamp),
                        new BABYLON.Vector3(median[0], Q3[0], timeStamp),
                        new BABYLON.Vector3(Q3[0], median[0], timeStamp),
                        new BABYLON.Vector3(median[0], min[0], timeStamp),
                        new BABYLON.Vector3(min[0], median[0], timeStamp),
                        new BABYLON.Vector3(median[0], max[0], timeStamp),
                        new BABYLON.Vector3(max[0], median[0], timeStamp)
                    ]);
                } else {
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
            }

            allBoxPlotValues.push({ group: Group, values: boxPLotvalues });
        }

        // Connect points to create box plots
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
            ribbonMaterial.backFaceCulling = false;
            ribbon.material = ribbonMaterial;

            const parentNode = new BABYLON.TransformNode(`parent_${group}`, scene);
            LineSystem.parent = parentNode;
            ribbon.parent = parentNode;

            parentNode.scaling = new BABYLON.Vector3(0.8, 0.8, 0.8);
            parentNode.position = new BABYLON.Vector3(5, 0.5, 13.57);
            groupMeshes[group] = { parentNode, LineSystem, ribbon };
        }

   

        const colors = {};
        Groups.forEach(group => {
            colors[group] = getRandomColor();
        });

        allBoxPlotValues.forEach(groupData => {
            connectPoints(groupData.values, scene, colors[groupData.group], groupData.group);
        });



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

        engine.runRenderLoop(function() {
            scene.render();
            var fps = engine.getFps().toFixed();
            document.getElementById('fpsCounter').innerText = fps + " FPS";
        });

        window.addEventListener("resize", function() {
            engine.resize();
        });
    } catch (error) {
        console.error('Error initializing scene:', error);
    }
}