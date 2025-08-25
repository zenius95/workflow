class WorkflowRunner {
    /**
     * Hàm khởi tạo "thông minh".
     * @param {object} config - Có thể là một đối tượng WorkflowBuilder (client)
     */
    constructor(config) {
        this.isSimulating = false;
        this.executionState = {};

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
            // MÔI TRƯỜNG SERVER
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
        
        // --- BẮT ĐẦU SỬA LỖI VÀ HOÀN THIỆN LOGIC SUB-WORKFLOW ---
        if (type === 'sub_workflow') {
            // Môi trường Client: Dùng trực tiếp phương thức của builder
            if (!this.isServer && this.builder) {
                return this.builder._findNodeConfig(type);
            }
            // Môi trường Server: Cung cấp logic execute hoàn chỉnh
            else if (this.isServer) {
                const db = require('./database.js'); // Tải module DB

                return {
                    type: 'sub_workflow',
                    execute: async (data, logger, runnerInstance) => {
                        const { workflowId } = data;
                        if (!workflowId) {
                            throw new Error("Sub Workflow node is missing 'workflowId'.");
                        }

                        logger.info(`Fetching sub-workflow with ID: ${workflowId}`);
                        const subWorkflowData = await db.getWorkflowById(workflowId);

                        if (!subWorkflowData) {
                            throw new Error(`Sub-workflow with ID '${workflowId}' not found.`);
                        }

                        logger.info(`Starting execution of sub-workflow: ${subWorkflowData.name}`);

                        // Tạo một runner mới cho sub-workflow
                                                const subRunner = new WorkflowRunner({
                            workflow: subWorkflowData.data,
                            config: runnerInstance.nodeConfig,
                            logger: runnerInstance.logger,
                            globalVariables: runnerInstance.globalVariables,
                            formData: data.inputs, // Truyền dữ liệu của node cha làm đầu vào cho sub-workflow
                            isSubRunner: true, // Đánh dấu đây là một sub-runner
                        });

                        // Chạy sub-workflow và đợi kết quả
                        const subExecutionState = await subRunner.run();

                        logger.info(`Sub-workflow ${subWorkflowData.name} finished.`);
                        // Trả về toàn bộ state của sub-workflow làm kết quả của node này
                        return subExecutionState;
                    }
                };
            }
        }
        // --- KẾT THÚC SỬA LỖI ---

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
    
    // Phương thức RUN chính
    async run() {
        if (this.isSimulating) {
            this.logger.warn('Workflow is already running.');
            return;
        }
        this.isSimulating = true;

        if (!this.isSubRunner) {
            this.logger.clear();
        }
        if (!this.isSubRunner) {
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

        // Check if any node in the execution state has an error
        const hasError = Object.values(this.executionState).some(state => state._status === 'error');
        if (hasError) {
            const firstErrorNodeId = Object.keys(this.executionState).find(nodeId => this.executionState[nodeId]._status === 'error');
            const errorMessage = this.executionState[firstErrorNodeId]?.error || 'An unknown error occurred in a sub-workflow node.';
            throw new Error(`Sub-workflow failed: ${errorMessage}`);
        }

        return this.executionState;
    }

    // Phương thức thực thi một node
    async _executeNode(node, tryCatchStack) {
        const nodes = this.isServer ? this.nodes : this.builder.nodes;
        const connections = this.isServer ? this.connections : this.builder.connections;
        const globalVariables = this.isServer ? this.globalVariables : this.builder.globalVariables;
        const formData = this.isServer ? this.formData : this.builder.formData;

        const nodeConfig = this._findNodeConfig(node.type);
        if (!nodeConfig || typeof nodeConfig.execute !== 'function') {
            this.logger.error(`Execution logic not found for node type: ${node.type}`);
            this.logger.nodeState(node.id, 'error');
            this.executionState[node.id] = { _status: 'error', error: `Execution logic not found for node type: ${node.type}` };
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
            // Truyền `this` (runner instance) vào hàm execute
            const result = await nodeConfig.execute(resolvedNodeData, this.logger, this);

            if (result?.hasOwnProperty('selectedPort')) {
                this.executionState[node.id] = { ...result.data, _status: 'success' };
                await executeNextNodes(result.selectedPort, tryCatchStack);
            } else {
                this.executionState[node.id] = { ...result, _status: 'success' };
                await executeNextNodes((nodeConfig.outputs || ['success'])[0], tryCatchStack);
            }
            this.logger.nodeState(node.id, 'success');
        } catch (error) {
            const errorResult = { _status: 'error', error: error.message, ...error.context };
            this.logger.error(`Error in node ${node.data.title}: ${error.message}`);
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