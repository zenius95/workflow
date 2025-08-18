const htmlExtractorNode = require('./html_extractor.js');
const generateDataNode = require('./generate_data.js');

module.exports = {
    name: 'Data',
    nodes: [
        htmlExtractorNode,
        generateDataNode,
    ]
};