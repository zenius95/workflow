const conditionNode = require('./condition.js');
const dataProcessingNode = require('./data_processing.js');
const delayNode = require('./delay.js');
const loopNode = require('./loop.js');
const setVariableNode = require('./set_variable.js');
const tryCatchNode = require('./try_catch.js');

module.exports = {
    name: 'Logic',
    color: '#e84118',
    nodes: [
        conditionNode,
        loopNode,
        dataProcessingNode,
        tryCatchNode,
        delayNode,
        setVariableNode,
    ]
};