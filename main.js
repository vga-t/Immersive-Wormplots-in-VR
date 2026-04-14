import { currentDataset, attribute1, attribute2, setupUI } from './ui.js';
import { datasetConfig } from './config.js';
import { setupControllers } from './controllers.js';
import { groupMeshes, toggleVisibility, processData, connectPoints } from './helpers.js';

async function loadCSVData(currentDataset) {
    try {
        const cfg = datasetConfig[currentDataset];
        const df = await dfd.readCSV(cfg.file);
        return df;
    } catch (error) {
        console.error('Error loading CSV:', error);
        return null;
    }
}

export async function initializeScene() {
    if (window.xrHelper && window.xrHelper.baseExperience) {
        await window.xrHelper.baseExperience.exitXRAsync();
        window.xrHelper = undefined;
    }
    
    setupUI(initializeScene); 

    const { canvas, engine, scene } = setupEngine();
    const camera = setupCamera(scene, canvas);
    const walls = setupWalls(scene);
    const lights = setupLights(scene, walls);
    const ground = setupGround(scene);
    
    const xrHelper = await setupXR(scene, ground);
    window.xrHelper = xrHelper;
    // scene.debugLayer.show();

    const { manager, panel, anchor } = setupUIManager(scene);
    const df = await loadCSVData(currentDataset);

    let Groups, allBoxPlotValues;
    if (currentDataset === 'WeatherDetailed') {

        ({ Groups, allBoxPlotValues } = processDetailedWeatherData(df, attribute1, attribute2));

        const colors = {};
        const datasetColors = datasetConfig[currentDataset].colors;
        Groups.forEach((group, index) => {
            colors[group] = datasetColors[index % datasetColors.length];
        });
        renderVisualization(allBoxPlotValues, colors, scene);
        setupToggleButtons(Groups, colors, panel, scene);

    } else {
        ({ Groups, allBoxPlotValues } = processData(df, currentDataset, attribute1, attribute2));
        

    const colors = {};
    const datasetColors = datasetConfig[currentDataset].colors;
    Groups.forEach((group, index) => {
        colors[group] = datasetColors[index % datasetColors.length];
    });

    renderVisualization(allBoxPlotValues, colors, scene);
    setupToggleButtons(Groups, colors, panel, scene);
    }
    await setupControllers(scene, xrHelper, panel, anchor, ground);

    //scene.debugLayer.show();

    engine.runRenderLoop(function() {
        scene.render();
        var fps = engine.getFps().toFixed();
        document.getElementById('fpsCounter').innerText = fps + " FPS";
    });

    window.addEventListener("resize", function() {
        engine.resize();
    });
}

function setupEngine() {
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true, { xrCompatible: true });
    const scene = new BABYLON.Scene(engine);
    return { canvas, engine, scene };
}

function setupCamera(scene, canvas) {
    const camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(-6.58, 2.72, -5.40), scene);
    camera.setTarget(new BABYLON.Vector3(24.19, 2.92, 47.08));
    camera.attachControl(canvas, true);
    return camera;
}

function setupGround(scene) {
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 300 }, scene);
    const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.4);
    groundMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = groundMaterial;
    ground.position = new BABYLON.Vector3(5, 0.5, 90);
    return ground;
}

async function setupXR(scene, ground) {
    return await scene.createDefaultXRExperienceAsync({
        floorMeshes: [ground],
        inputOptions: { disableDefaultControllerMesh: true },
    });
}

function setupWalls(scene) {
    const wallMaterial = new BABYLON.StandardMaterial("wallMaterial", scene);
    wallMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    wallMaterial.specularColor = new BABYLON.Color3(0, 0, 0);

    const createWall = (name, width, height, depth, position) => {
        const wall = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
        wall.material = wallMaterial;
        wall.position = position;
        return wall;
    };

    const wallHeight = 30;
    const wallThickness = 0.5;
    return [
        createWall("wall1", 100, wallHeight, wallThickness, new BABYLON.Vector3(5, wallHeight / 2, 240)),
        createWall("wall2", 100, wallHeight, wallThickness, new BABYLON.Vector3(5, wallHeight / 2, -60)),
        createWall("wall3", wallThickness, wallHeight, 300, new BABYLON.Vector3(55, wallHeight / 2, 90)),
        createWall("wall4", wallThickness, wallHeight, 300, new BABYLON.Vector3(-45, wallHeight / 2, 90)),
        createWall("roof", 100, wallThickness, 300, new BABYLON.Vector3(5, wallHeight + wallThickness / 2, 90))
    ];
}

function setupUIManager(scene) {
    const manager = new BABYLON.GUI.GUI3DManager(scene);
    const panel = new BABYLON.GUI.PlanePanel();
    panel.margin = 0.02;
    manager.addControl(panel);
    panel.scaling = new BABYLON.Vector3(0.3, 0.3, 0.3);
    const anchor = new BABYLON.TransformNode("panelAnchor");
    panel.linkToTransformNode(anchor);
    return { manager, panel, anchor };
}

function setupLights(scene, walls) {
    const lightPositions = [
        new BABYLON.Vector3(5, 15, -60),
        new BABYLON.Vector3(5, 15, 240),
        new BABYLON.Vector3(-45, 15, 90),
        new BABYLON.Vector3(55, 15, 90),
    ];

    lightPositions.forEach((position, index) => {
        const light = new BABYLON.PointLight(`pointLight${index + 1}`, position, scene);
        light.intensity = 1.0;
    });

    const groundLight = new BABYLON.DirectionalLight("groundLight", new BABYLON.Vector3(0, -1, 0), scene);
    groundLight.position = new BABYLON.Vector3(5, 10, 90);
    groundLight.intensity = 1.0;

    const roofLight = new BABYLON.DirectionalLight("roofLight", new BABYLON.Vector3(0, 1, 0), scene);
    roofLight.position = new BABYLON.Vector3(5, 30.5, 90);
    roofLight.intensity = 1.0;
}

function setupToggleButtons(Groups, colors, panel, scene) {
    function addButton(group, color) {
        const button = new BABYLON.GUI.HolographicButton("button_" + group);
        button.width = "0.15";
        button.height = "0.15";
        panel.addControl(button);
        button.text = group;
        const buttonMaterial = new BABYLON.StandardMaterial("buttonColor_" + group, scene);
        buttonMaterial.diffuseColor = color;
        buttonMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
        buttonMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        button.mesh.material = buttonMaterial;

        button.onPointerUpObservable.add(() => {
            toggleVisibility(group);
        });
    }
    Groups.forEach(group => {
        addButton(group, colors[group]);
    });
}

function renderVisualization(allBoxPlotValues, colors, scene) {
    allBoxPlotValues.forEach(groupData => {
        if (groupData.subBoxPlotValues) {
            groupMeshes[groupData.group] = [];
            groupData.subBoxPlotValues.forEach(sub => {
                const meshes = connectPoints(sub, scene, colors[groupData.group], groupData.group);
                groupMeshes[groupData.group].push(meshes);
            });
        } else {
            const meshes = connectPoints(groupData.values, scene, colors[groupData.group], groupData.group);
            groupMeshes[groupData.group] = meshes;
        }
    });
}

function processDetailedWeatherData(df, attribute1, attribute2) {
    const cfg = datasetConfig[currentDataset];
    const wormName = cfg.wormName;
    const TimeAttribute = cfg.timeAttribute;
    const Groups = df[wormName].unique().values;
    const Attribute1 = attribute1;
    const Attribute2 = attribute2;

    const allBoxPlotValues = [];

    for (let Group of Groups) {
        let filteredDf = df.loc({ rows: df[wormName].eq(Group), columns: [TimeAttribute, Attribute1, Attribute2] });
        let groupedDf = filteredDf.groupby([TimeAttribute]);
        let Attrnames = [Attribute1, Attribute2];
        let intermediate = {};
        let [min, Q1, median, Q3, IQR, max] = [[], [], [], [], [], []];
        let boxPLotvalues = [];
        let totalTimeStamps = filteredDf[TimeAttribute].unique().values;
        
        for (let timeStamp of totalTimeStamps) {
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

        const subBoxPlotValues = [];

        for (let i = 0; i < boxPLotvalues.length; i += 12) {
            subBoxPlotValues.push(boxPLotvalues.slice(i, i + 12));
        }
        allBoxPlotValues.push({ group: Group, subBoxPlotValues });
    }


    return { Groups, allBoxPlotValues };
}

initializeScene();