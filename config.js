export const datasetConfig = {
    Weather: {
        file: './Weather.csv',
        wormName: 'city_name',
        timeAttribute: 'time_int',
        attributes: ['tavg', 'tmin', 'tmax', 'prcp', 'snow', 'wdir', 'wspd', 'wpgt', 'pres', 'tsun'],
        colors: [
            new BABYLON.Color3(1, 0, 0), // Red
            new BABYLON.Color3(0, 1, 0), // Green
            new BABYLON.Color3(0, 0, 1), // Blue
            new BABYLON.Color3(1, 1, 0), // Yellow
            new BABYLON.Color3(1, 0, 1), // Magenta
            new BABYLON.Color3(0, 1, 1), // Cyan
            new BABYLON.Color3(0.5, 0.5, 0.5), // Gray
            new BABYLON.Color3(1, 0.5, 0), // Orange
            new BABYLON.Color3(0.5, 0, 0.5), // Purple
            new BABYLON.Color3(0, 0.5, 0.5) // Teal
        ]
    },
    Toxicology: {
        file: './Toxicology.csv',
        wormName: 'Group',
        timeAttribute: 'Time',
        attributes: ['Daphnia_Large', 'Daphnia_Small', 'Scenedesmus', 'Ankistrodesmus', 'pH'],
        colors: [
            new BABYLON.Color3(1, 0, 0), // Red
            new BABYLON.Color3(0, 1, 0), // Green
            new BABYLON.Color3(0, 0, 1) // Blue
        ]
    }
};