import { datasetConfig } from './config.js';

export let currentDataset = 'Weather';
export let attribute1 = '';
export let attribute2 = '';
let debounceTimeout;

// Debounce function to delay scene initialization
export function debounceInitializeScene(initializeScene) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        initializeScene();
    }, 300); // Adjust the delay as needed
}

// Create or update UI controls
export function setupUI(initializeScene) {
    const datasetSelect = document.getElementById('datasetSelect');
    const attr1Select = document.getElementById('attribute1Select');
    const attr2Select = document.getElementById('attribute2Select');
    datasetSelect.value = currentDataset;

    function populateAttributes() {
        const attrs = datasetConfig[currentDataset].attributes;
        attr1Select.innerHTML = '';
        attr2Select.innerHTML = '';

        attrs.forEach(a => {
            if (a !== attribute2) {
                attr1Select.add(new Option(a, a));
            }
            if (a !== attribute1) {
                attr2Select.add(new Option(a, a));
            }
        });

        if (!attribute1 || !attrs.includes(attribute1)) attribute1 = attrs[0];
        if (!attribute2 || !attrs.includes(attribute2)) attribute2 = attrs[1];

        attr1Select.value = attribute1;
        attr2Select.value = attribute2;
    }

    datasetSelect.onchange = () => {
        currentDataset = datasetSelect.value;
        populateAttributes();
        debounceInitializeScene(initializeScene);
    };

    attr1Select.onchange = () => {
        attribute1 = attr1Select.value;
        populateAttributes();
        debounceInitializeScene(initializeScene);
    };

    attr2Select.onchange = () => {
        attribute2 = attr2Select.value;
        populateAttributes();
        debounceInitializeScene(initializeScene);
    };

    populateAttributes();
}