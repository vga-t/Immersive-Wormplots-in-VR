
export const datasetConfig = {
    Weather: {
        file: './Weather.csv',
        wormName: 'city_name',
        timeAttribute: 'time_int',
        attributes: ['tavg', 'tmin', 'tmax', 'prcp', 'snow', 'wdir', 'wspd', 'wpgt', 'pres', 'tsun'],
    },
    Toxicology: {
        file: './Toxicology.csv',
        wormName: 'Group',
        timeAttribute: 'Time',
        attributes: ['Daphnia_Large', 'Daphnia_Small', 'Scenedesmus', 'Ankistrodesmus', 'pH'],
    }
};