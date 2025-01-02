import { datasetConfig } from './config.js';

export async function loadCSVData(currentDataset) {
    try {
        const cfg = datasetConfig[currentDataset];
        const df = await dfd.readCSV(cfg.file);
        return df;
    } catch (error) {
        console.error('Error loading CSV:', error);
        return null;
    }
}