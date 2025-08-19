const executeCommandNode = require('./execute_command.js');
const httpRequestNode = require('./http_request.js');
const logMessageNode = require('./log_message.js');
const sendEmailNode = require('./send_email.js');

module.exports = {
    name: 'Actions',
    color: '#00a8ff',
    nodes: [
        httpRequestNode,
        sendEmailNode,
        logMessageNode,
        executeCommandNode,
    ]
};