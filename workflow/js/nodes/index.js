const actionsCategory = require('./actions');
const dataCategory = require('./data');
const fileSystemCategory = require('./filesystem');
const logicCategory = require('./logic');

const nodeCategories = [
    actionsCategory,
    fileSystemCategory,
    dataCategory,
    logicCategory
];

module.exports = nodeCategories;