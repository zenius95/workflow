// workflow/js/runner.js
const path = require('path');
const { getProperty } = require(path.join(__dirname, 'nodes/logic/data_processing.js'));
const i18n = require('./i18n.js');

i18n.loadLanguage('en');

class ConsoleLogger {
    _log(message, type = 'INFO') {
        const timestamp = new Date().toLocaleTimeString('en-GB');
        let finalMessage = (typeof message === 'object') ? JSON.stringify(message, null, 2) : message;
        console.log(`[${timestamp}][${type}] ${finalMessage}`);
    }
    info(message) { this._log(message, i18n.get('common.info').toUpperCase()); }
    success(message) { this._log(message, i18n.get('common.success').toUpperCase()); }
    error(message) { this._log(message, i18n.get('common.error').toUpperCase()); }
    system(message) { this._log(message, i18n.get('common.system').toUpperCase()); }
    clear() { console.clear(); }
}

class WorkflowRunner {
    constructor(config, workflowData) {
        this.config = config;
        this.workflow = workflowData;
        this.logger = new ConsoleLogger();
        this.globalVariables = { environment: "headless_production" };
        this.executionState = {};
    }

    _findNodeConfig(type) {
        for (const category of this.config.nodeCategories) {
            const foundNode = category.nodes.find(node => node.type === type);
            if (foundNode) return foundNode;
        }
        return null;
    }

    _resolveVariables(text, context) {
        if (typeof text !== 'string') return text;
        const singleVarMatch = text.match(/{{\s*([^}]+)\s*}}/);
        if (singleVarMatch && singleVarMatch[0] === text) {
            const value = getProperty(context, singleVarMatch[1].trim());
            return value === undefined ? text : value;
        }
        return text.replace(/{{\s*(.*?)\s*}}/g, (match, path) => {
            const value = getProperty(context, path.trim());
            if (value === undefined) return match;
            if (typeof value === 'object' && value !== null) return JSON.stringify(value);
            return value;
        });
    }

    async run() {
        this.logger.system(i18n.get('runner.start_log'));
        const startNodes = this.workflow.nodes.filter(n => !this.workflow.connections.some(c => c.to === n.id));

        if (startNodes.length === 0 && this.workflow.nodes.length > 0) {
            this.logger.error(i18n.get('runner.no_start_node'));
            return;
        }

        try {
            await Promise.allSettled(startNodes.map(node => this._executeNode(node, [])));
        } catch (e) {
            this.logger.error(i18n.get('runner.critical_error', { message: e.message }));
        }

        this.logger.system(i18n.get('runner.end_log'));
    }

    async _executeNode(node, tryCatchStack) {
        const nodeConfig = this._findNodeConfig(node.type);
        if (!nodeConfig) {
            this.logger.error(i18n.get('runner.node_config_not_found', { type: node.type, id: node.id }));
            return;
        }

        this.logger.info(i18n.get('runner.executing_node', { title: node.data.title, id: node.id }));

        const resolvedNodeData = JSON.parse(JSON.stringify(node.data));
        const resolutionContext = { global: this.globalVariables, ...this.executionState };

        const resolveRecursively = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') obj[key] = this._resolveVariables(obj[key], resolutionContext);
                else if (typeof obj[key] === 'object' && obj[key] !== null) resolveRecursively(obj[key]);
            }
        };
        resolveRecursively(resolvedNodeData);

        const executeNextNodes = async (portName, newTryCatchStack, callingNodeId = node.id) => {
            const nextConnections = this.workflow.connections.filter(c => c.from === callingNodeId && c.fromPort === portName);
            if (nextConnections.length > 0) {
                await Promise.all(nextConnections.map(async (conn) => {
                    const nextNode = this.workflow.nodes.find(n => n.id === conn.to);
                    if (nextNode) await this._executeNode(nextNode, newTryCatchStack);
                }));
            }
        };

        if (node.type === 'try_catch') {
            this.logger.info(i18n.get('runner.try_catch_start', { title: node.data.title }));
            this.executionState[node.id] = { status: 'try_path_taken' };
            await executeNextNodes('try', [...tryCatchStack, node]);
            return;
        }

        try {
            if (node.type === 'loop') {
                const items = await nodeConfig.execute(resolvedNodeData, this.logger, this);
                const loopConnection = this.workflow.connections.find(c => c.from === node.id && c.fromPort === 'loop');
                if (loopConnection) {
                    const loopBodyStartNode = this.workflow.nodes.find(n => n.id === loopConnection.to);
                    if (loopBodyStartNode) {
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            this.logger.info(i18n.get('runner.loop_iteration', { index: i + 1, total: items.length, item: JSON.stringify(item) }));
                            this.executionState[node.id] = { currentItem: item, currentIndex: i, totalItems: items.length };
                            await this._executeNode(loopBodyStartNode, [...tryCatchStack]);
                        }
                    }
                }
                this.logger.success(i18n.get('runner.loop_complete'));
                this.executionState[node.id] = { allItems: items, count: items.length };
                await executeNextNodes('done', tryCatchStack);
                return;
            }

            const result = await nodeConfig.execute(resolvedNodeData, this.logger, this);
            if (result && typeof result === 'object' && result.hasOwnProperty('selectedPort')) {
                this.executionState[node.id] = result.data;
                await executeNextNodes(result.selectedPort, tryCatchStack);
            } else {
                this.executionState[node.id] = result;
                const successPortName = (nodeConfig.outputs || ['success'])[0];
                await executeNextNodes(successPortName, tryCatchStack);
            }
        } catch (error) {
            this.logger.error(i18n.get('runner.node_error', { title: node.data.title, message: error.message }));
            this.executionState[node.id] = { error: error.message, ...error.context };
            const lastTryCatchNode = tryCatchStack.pop();
            if (lastTryCatchNode) {
                this.logger.info(i18n.get('runner.error_caught', { title: lastTryCatchNode.data.title }));
                this.executionState.error = { message: error.message, sourceNode: node.id, context: error.context };
                await executeNextNodes('catch', tryCatchStack, lastTryCatchNode.id);
            } else {
                await executeNextNodes('error', tryCatchStack);
            }
        }
    }
}

module.exports = WorkflowRunner;