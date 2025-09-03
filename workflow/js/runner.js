class WorkflowRunner {
    /**
     * Hàm khởi tạo "thông minh".
     * @param {object} config - Có thể là một đối tượng WorkflowBuilder (client) hoặc cấu hình cho server.
     */
    constructor(config) {
        this.isSimulating = false;
        this.executionState = {};
        this.executionStack = config.executionStack || []; // Theo dõi chuỗi workflow để chống lặp vô hạn

        // Ràng buộc 'this' cho hàm run để đảm bảo ngữ cảnh luôn đúng
        this.run = this.run.bind(this);

        // Kiểm tra xem chúng ta đang ở môi trường client hay server.
        if (config && config.constructor.name === 'WorkflowBuilder') {
            // MÔI TRƯỜNG CLIENT
            this.builder = config;
            this.logger = config.logger;
            this.isServer = false;
            this.isSubRunner = false;

            if (typeof window !== 'undefined' && window.i18n) {
                this.i18n = window.i18n;
            } else {
                console.error("Runner failed to find i18n on window object.");
                this.i18n = { get: (key) => key }; // Fallback
            }

        } else {
            // MÔI TRƯỜDNG SERVER
            this.builder = null;
            this.workflow = config.workflow || { nodes: [], connections: [] };
            this.nodeConfig = config.config;
            this.logger = config.logger;
            this.isServer = true;
            this.isSubRunner = config.isSubRunner || false;

            try {
                this.i18n = require('./i18n.js');
                const fs = require('fs');
                const path = require('path');

                const lang = 'en'; // Ngôn ngữ mặc định cho server
                const localePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
                const translations = JSON.parse(fs.readFileSync(localePath, 'utf8'));

                this.i18n.init(lang, translations);
            } catch (e) {
                console.error("Runner failed to load i18n on server", e);
                this.i18n = { get: (key) => key }; // Fallback
            }

            this.nodes = this.workflow.nodes || [];
            this.connections = this.workflow.connections || [];
            this.globalVariables = { server_start_time: new Date().toISOString(), ...(config.globalVariables || {}) };
            this.formData = config.formData || {};
        }
    }

    _findNodeConfig(type) {
        const configSource = this.isServer ? this.nodeConfig : this.builder.config;
        
        if (type === 'sub_workflow') {
            if (!this.isServer && this.builder) {
                return this.builder._findNodeConfig(type);
            }
            else if (this.isServer) {
                const db = require('./database.js'); 

                return {
                    type: 'sub_workflow',
                    execute: async (data, logger, runnerInstance) => {
                        const { workflowId } = data;
                        if (!workflowId) {
                            throw new Error("Sub Workflow node is missing 'workflowId'.");
                        }

                        // --- BẢO VỆ CHỐNG ĐỆ QUY VÔ HẠN ---
                        if (runnerInstance.executionStack.includes(workflowId)) {
                            throw new Error(`Recursive sub-workflow call detected. Workflow ID "${workflowId}" is already in the execution stack.`);
                        }

                        logger.info(`Fetching sub-workflow with ID: ${workflowId}`);
                        const subWorkflowData = await db.getWorkflowById(workflowId);

                        if (!subWorkflowData) {
                            throw new Error(`Sub-workflow with ID '${workflowId}' not found.`);
                        }

                        logger.info(`Starting execution of sub-workflow: ${subWorkflowData.name}`);
                        
                        // Tạo execution stack mới cho sub-runner
                        const newExecutionStack = [...runnerInstance.executionStack, workflowId];

                        const subRunner = new WorkflowRunner({
                            workflow: subWorkflowData.data,
                            config: runnerInstance.nodeConfig,
                            logger: runnerInstance.logger,
                            globalVariables: runnerInstance.globalVariables,
                            formData: data.inputs,
                            isSubRunner: true,
                            executionStack: newExecutionStack, // Truyền stack mới vào
                        });

                        const subExecutionState = await subRunner.run();

                        logger.info(`Sub-workflow ${subWorkflowData.name} finished.`);
                        return subExecutionState;
                    }
                };
            }
        }

        for (const category of configSource.nodeCategories) {
            const foundNode = category.nodes.find(node => node.type === type);
            if (foundNode) return foundNode;
        }

        return null;
    }

    _getProperty(obj, path) {
        if (typeof path !== 'string' || !path) return undefined;
        return path.split('.').reduce((o, i) => (o && typeof o === 'object' && i in o) ? o[i] : undefined, obj);
    }

    _resolveVariables(text, context) {
        if (typeof text !== 'string') return text;
        const singleVarMatch = text.match(/{{\s*([^}]+)\s*}}/);
        if (singleVarMatch && singleVarMatch[0] === text) {
            const value = this._getProperty(context, singleVarMatch[1].trim());
            return value === undefined ? text : value;
        }
        return text.replace(/{{\s*(.*?)\s*}}/g, (match, path) => {
            const value = this._getProperty(context, path.trim());
            if (value === undefined) return match;
            if (typeof value === 'object' && value !== null) return JSON.stringify(value);
            return value;
        });
    }
    
    async run() {
        if (this.isSimulating) {
            this.logger.warn('Workflow is already running.');
            return;
        }
        this.isSimulating = true;

        if (!this.isSubRunner) {
            this.logger.clear();
            this.logger.system(this.i18n.get('runner.start_log'));
        }
        this.executionState = {};

        this.logger.updateVariables(this.globalVariables, this.formData, this.executionState);

        const nodesToRun = this.isServer ? this.nodes : this.builder.nodes;
        nodesToRun.forEach(node => this.logger.nodeState(node.id, 'idle'));

        const connectionsToRun = this.isServer ? this.connections : this.builder.connections;
        const startNodes = nodesToRun.filter(n => !connectionsToRun.some(c => c.to === n.id));

        if (startNodes.length === 0 && nodesToRun.length > 0) {
            this.logger.error(this.i18n.get('runner.no_start_node'));
        } else {
            await Promise.allSettled(startNodes.map(node => this._executeNode(node, [])));
        }

        if (!this.isSubRunner) {
            this.logger.system(this.i18n.get('runner.end_log'));
        }
        this.isSimulating = false;

        if (!this.isServer && this.builder) {
            const runButton = this.builder.container.querySelector('[data-action="run-simulation"]');
            if (runButton) {
                runButton.disabled = false;
                runButton.classList.remove('opacity-50');
            }
            this.builder.dispatchEvent(new CustomEvent('simulation:ended', { detail: { finalState: this.executionState } }));
        }

        if (this.isSubRunner) {
            const hasError = Object.values(this.executionState).some(state => state._status === 'error');
            if (hasError) {
                const firstErrorNodeId = Object.keys(this.executionState).find(nodeId => this.executionState[nodeId]._status === 'error');
                const errorMessage = this.executionState[firstErrorNodeId]?.error || 'An unknown error occurred in a sub-workflow node.';
                throw new Error(`Sub-workflow failed: ${errorMessage}`);
            }
        }

        return this.executionState;
    }

    async _executeNode(node, tryCatchStack) {
        const nodes = this.isServer ? this.nodes : this.builder.nodes;
        const connections = this.isServer ? this.connections : this.builder.connections;
        const globalVariables = this.isServer ? this.globalVariables : this.builder.globalVariables;
        const formData = this.isServer ? this.formData : this.builder.formData;

        const nodeConfig = this._findNodeConfig(node.type);
        if (!nodeConfig || typeof nodeConfig.execute !== 'function') {
            const errorMessage = `Execution logic not found for node type: ${node.type}`;
            this.logger.error(errorMessage);
            this.logger.nodeState(node.id, 'error');
            this.executionState[node.id] = { _status: 'error', error: errorMessage };
            return;
        }
        
        this.executionState[node.id] = { _status: 'running' };
        this.logger.nodeState(node.id, 'running');
        this.logger.updateVariables(globalVariables, formData, this.executionState);

        const resolvedNodeData = JSON.parse(JSON.stringify(node.data));
        const resolutionContext = { global: globalVariables, form: formData, ...this.executionState };
        this._resolveVariablesInObject(resolvedNodeData, resolutionContext);

        const executeNextNodes = async (portName, newTryCatchStack, callingNodeId = node.id) => {
            const nextConnections = connections.filter(c => c.from === callingNodeId && c.fromPort === portName);
            for (const conn of nextConnections) {
                this.logger.animateConnection(conn.id);
                const nextNode = nodes.find(n => n.id === conn.to);
                if (nextNode) await this._executeNode(nextNode, newTryCatchStack);
            }
        };

        try {
            const result = await nodeConfig.execute(resolvedNodeData, this.logger, this);
            let nextPort = (nodeConfig.outputs || ['success'])[0];

            if (node.type === 'sub_workflow') {
                // Đóng gói kết quả của sub-workflow để tránh xung đột trạng thái
                this.executionState[node.id] = { output: result, _status: 'success' };
            } else if (result?.hasOwnProperty('selectedPort')) {
                // Xử lý các node có port đầu ra động (ví dụ: condition)
                this.executionState[node.id] = { ...result.data, _status: 'success' };
                nextPort = result.selectedPort;
            } else {
                // Xử lý node thông thường
                this.executionState[node.id] = { ...result, _status: 'success' };
            }

            this.logger.nodeState(node.id, 'success');
            await executeNextNodes(nextPort, tryCatchStack);

        } catch (error) {
            const errorResult = { _status: 'error', error: error.message, ...error.context };
            this.logger.error(`Error in node ${node.data.title || node.id}: ${error.message}`);
            this.executionState[node.id] = errorResult;
            this.logger.nodeState(node.id, 'error');

            const lastTryCatchNode = tryCatchStack.pop();
            if (lastTryCatchNode) {
                this.logger.info(`Error caught by ${lastTryCatchNode.data.title}`);
                this.executionState.error = { message: error.message, sourceNode: node.id, context: error.context };
                if (!this.isServer) this.builder._setNodeState(lastTryCatchNode, 'error');
                await executeNextNodes('catch', tryCatchStack, lastTryCatchNode.id);
            } else {
                await executeNextNodes('error', tryCatchStack);
            }
        } finally {
            this.logger.updateVariables(globalVariables, formData, this.executionState);
        }
    }

    _resolveVariablesInObject(obj, context) {
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = this._resolveVariables(obj[key], context);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                this._resolveVariablesInObject(obj[key], context);
            }
        }
    }
}

/**
 * Đoạn mã "vạn năng" giúp file chạy được ở cả 2 môi trường.
 */
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = WorkflowRunner;
}