import { datasetConfig } from './config.js';

export const groupMeshes = {};

export function toggleVisibility(group) {
    const meshesOrArray = groupMeshes[group];
    if (!meshesOrArray) return;
    if (Array.isArray(meshesOrArray)) {
        meshesOrArray.forEach(m => {
            m.LineSystem.isVisible = !m.LineSystem.isVisible;
            m.ribbon.isVisible = !m.ribbon.isVisible;
        });
    } else {
        meshesOrArray.LineSystem.isVisible = !meshesOrArray.LineSystem.isVisible;
        meshesOrArray.ribbon.isVisible = !meshesOrArray.ribbon.isVisible;
    }
}


export function processData(df, currentDataset, attribute1, attribute2) {
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
    return { Groups, allBoxPlotValues };
}

export function connectPoints(points, scene, color, group) {
    const diamondLines = [];
    const whiskerLines = [];
    for (let i = 0; i < points.length; i++) {
        const diamond = [
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

    const allLines = [...diamondLines, ...whiskerLines];
    const LineSystem = BABYLON.MeshBuilder.CreateLineSystem(`lines_${group}`, { lines: allLines }, scene);
    LineSystem.color = color;
    const paths = diamondLines.map(line => line.flat());
    const ribbon = BABYLON.Mesh.CreateRibbon(`ribbon_${group}`, paths, false, false, 0, scene);
    const ribbonMaterial = new BABYLON.StandardMaterial(`ribbonMaterial_${group}`, scene);
    ribbonMaterial.diffuseColor = color;
    ribbonMaterial.backFaceCulling = false;
    ribbon.material = ribbonMaterial;

    const parentNode = new BABYLON.TransformNode(`parent_${group}`, scene);
    LineSystem.parent = parentNode;
    ribbon.parent = parentNode;

    parentNode.scaling = new BABYLON.Vector3(0.8, 0.8, 0.8);
    parentNode.position = new BABYLON.Vector3(5, 0.5, 13.57);
    
    if (group === 'DetailedWeatherData') {
        controller.onTriggerRightPressedObservable.add(() => {
            parentNode.parent = controller;
        });
        controller.onTriggerRightReleasedObservable.add(() => {
            parentNode.parent = scene;
        });
    }

    return { parentNode, LineSystem, ribbon };
}


