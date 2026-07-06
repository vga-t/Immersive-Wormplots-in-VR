importScripts("https://cdn.jsdelivr.net/npm/danfojs@1.1.2/lib/bundle.min.js");

self.onmessage = async (event) => {
    const { requestId, fileUrl, wormName, timeAttribute, colors, attribute1, attribute2 } = event.data;

    try {
        // Load the CSV data in the worker using Danfo.js
        const df = await self.dfd.readCSV(fileUrl);

        // Extract raw data from df inside the worker
        const datasetData = extractRawDataInWorker(df, wormName, timeAttribute, colors, attribute1, attribute2);

        // Compute the box plot stats and coordinate mappings inside the worker
        const result = computeDataset(datasetData);

        self.postMessage({ requestId, ok: true, result });
    } catch (error) {
        self.postMessage({
            requestId,
            ok: false,
            error: error && error.message ? error.message : String(error)
        });
    }
};

function extractRawDataInWorker(df, wormName, timeAttribute, colors, attribute1, attribute2) {
    const Groups = df[wormName].unique().values;

    const datasetData = {
        groups: [],
        colors: colors
    };

    for (let Group of Groups) {
        let filteredDf = df.loc({ rows: df[wormName].eq(Group), columns: [timeAttribute, attribute1, attribute2] });
        let groupedDf = filteredDf.groupby([timeAttribute]);
        const timeSeries = [];

        for (let timeStamp of filteredDf[timeAttribute].unique().values) {
            const groupData = groupedDf.getGroup([timeStamp]);
            if (groupData) {
                const valuesX = groupData[attribute1].values;
                const valuesY = groupData[attribute2].values;
                timeSeries.push({
                    timeStamp: Number(timeStamp),
                    valuesX,
                    valuesY
                });
            }
        }
        datasetData.groups.push({
            group: Group,
            timeSeries
        });
    }

    return datasetData;
}


function computeDataset(dataset) {
    const groups = [];

    dataset.groups.forEach(groupData => {
        const values = [];
        groupData.timeSeries.forEach(timeStampData => {
            const stats = computeBoxPlotStats(timeStampData.valuesX, timeStampData.valuesY);
            values.push({
                timeStamp: timeStampData.timeStamp,
                points: [
                    [stats.medianX, stats.q1Y, timeStampData.timeStamp],
                    [stats.q1X, stats.medianY, timeStampData.timeStamp],
                    [stats.medianX, stats.q3Y, timeStampData.timeStamp],
                    [stats.q3X, stats.medianY, timeStampData.timeStamp],
                    [stats.medianX, stats.minY, timeStampData.timeStamp],
                    [stats.minX, stats.medianY, timeStampData.timeStamp],
                    [stats.medianX, stats.maxY, timeStampData.timeStamp],
                    [stats.maxX, stats.medianY, timeStampData.timeStamp]
                ]
            });
        });

        groups.push({
            group: groupData.group,
            values
        });
    });

    return {
        groups,
        colors: dataset.colors
    };
}

function computeBoxPlotStats(valuesX, valuesY) {
    const q1X = quantile(valuesX, 0.25);
    const medianX = quantile(valuesX, 0.5);
    const q3X = quantile(valuesX, 0.75);
    const iqrX = q3X - q1X;
    const minX = minWithinFence(valuesX, q1X - 1.5 * iqrX);
    const maxX = maxWithinFence(valuesX, q3X + 1.5 * iqrX);

    const q1Y = quantile(valuesY, 0.25);
    const medianY = quantile(valuesY, 0.5);
    const q3Y = quantile(valuesY, 0.75);
    const iqrY = q3Y - q1Y;
    const minY = minWithinFence(valuesY, q1Y - 1.5 * iqrY);
    const maxY = maxWithinFence(valuesY, q3Y + 1.5 * iqrY);

    return { q1X, medianX, q3X, minX, maxX, q1Y, medianY, q3Y, minY, maxY };
}

function quantile(values, percentile) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (sorted.length === 0) {
        return 0;
    }

    const position = (sorted.length - 1) * percentile;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);

    if (lowerIndex === upperIndex) {
        return sorted[lowerIndex];
    }

    const lowerWeight = upperIndex - position;
    const upperWeight = position - lowerIndex;
    return (sorted[lowerIndex] * lowerWeight) + (sorted[upperIndex] * upperWeight);
}

function minWithinFence(values, lowerBound) {
    const filtered = values.filter(value => value >= lowerBound);
    return filtered.length ? Math.min(...filtered) : Math.min(...values);
}

function maxWithinFence(values, upperBound) {
    const filtered = values.filter(value => value <= upperBound);
    return filtered.length ? Math.max(...filtered) : Math.max(...values);
}