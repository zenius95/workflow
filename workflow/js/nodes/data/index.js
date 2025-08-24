const htmlExtractorNode = require('./html_extractor.js');
const generateDataNode = require('./generate_data.js');
const dataProcessingNode = require('./data_processing.js');

module.exports = {
    name: 'Data',
    color: '#fbc531',
    nodes: [
        htmlExtractorNode,
        generateDataNode,
        dataProcessingNode
    ]
};