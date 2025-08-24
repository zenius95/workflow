const path = require('path');
const { getProperty, setProperty } = require(path.join(__dirname, 'nodes/data/data_processing.js'));

// --- CONFIGURATION ---
const nodeCategories = require(path.join(__dirname, 'nodes'));

const workflowConfig = {
    nodeCategories: nodeCategories
};

// --- DÀNH CHO NODE.JS ---
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        workflowConfig,
        getProperty,
        setProperty,
    };
}