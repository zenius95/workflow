const readFileNode = require('./read_file.js');
const writeFileNode = require('./write_file.js');

module.exports = {
    name: 'File System',
    color: '#4cd137',
    nodes: [
        readFileNode,
        writeFileNode,
    ]
};