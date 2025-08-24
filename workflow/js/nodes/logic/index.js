const conditionNode = require('./condition.js');
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
        tryCatchNode,
        delayNode,
        setVariableNode,
    ]
};