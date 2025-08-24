class WorkflowRunner {
    /**
     * Hàm khởi tạo "thông minh".
     * @param {object} config - Có thể là một đối tượng WorkflowBuilder (client)
     * hoặc một object chứa { workflow, config, logger } (server).
     */
    constructor(config) {
        this.isSimulating = false;
        this.executionState = {};
        
    
        // 2. Ràng buộc 'this' cho hàm run để đảm bảo ngữ cảnh luôn đúng
        this.run = this.run.bind(this);
        // --- KẾT THÚC SỬA LỖI ---
        
        // Kiểm tra xem chúng ta đang ở môi trường client (với builder đầy đủ)
        // hay môi trường server (với object cấu hình).
        // Kiểm tra xem chúng ta đang ở môi trường client (với builder đầy đủ)
        // hay môi trường server (với object cấu hình).
        if (config && config.constructor.name === 'WorkflowBuilder') {
            // MÔI TRƯỜNG CLIENT: Gán builder và lấy i18n từ window.
            this.builder = config;
            this.logger = config.logger;
            this.isServer = false;
            this.isSubRunner = false;
            
            // --- BẮT ĐẦU GIẢI PHÁP ---
            // Ở môi trường Client, lấy i18n từ window do app.js cung cấp.
            if (typeof window !== 'undefined' && window.i18n) {
                this.i18n = window.i18n;
            } else {
                console.error("Runner failed to find i18n on window object.");
                this.i18n = { get: (key) => key }; // Fallback
            }
            // --- KẾT THÚC GIẢI PHÁP ---

        } else {
            // MÔI TRƯỜNG SERVER: Tự thiết lập và require i18n.
            this.builder = null;
            this.workflow = config.workflow || { nodes: [], connections: [] };
            this.nodeConfig = config.config;
            this.logger = config.logger;
            this.isServer = true;
            this.isSubRunner = config.isSubRunner || false; // Đọc dấu hiệu

            // --- BẮT ĐẦU GIẢI PHÁP ---
            // Ở môi trường Server, dùng require như một ứng dụng Node.js bình thường.
            try {
                this.i18n = require('./i18n.js');
                const fs = require('fs'); // Need fs to read translation file
                const path = require('path'); // Need path to resolve translation file path

                const lang = 'en'; // Default language for server-side runner
                const localePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
                const translations = JSON.parse(fs.readFileSync(localePath, 'utf8'));
                
                this.i18n.init(lang, translations); // Use init method
            } catch (e) {
                console.error("Runner failed to load i18n on server", e);
                this.i18n = { get: (key) => key }; // Fallback
            }
            // --- KẾT THÚC GIẢI PHÁP ---
            
            this.nodes = this.workflow.nodes || [];
            this.connections = this.workflow.connections || [];
            this.globalVariables = { server_start_time: new Date().toISOString(), ...(config.globalVariables || {}) };
            this.formData = config.formData || {};
        }
    }
    
    // Các phương thức tiện ích, giờ là một phần của Runner
    _findNodeConfig(type) {
        const configSource = this.isServer ? this.nodeConfig : this.builder.config;
        for (const category of configSource.nodeCategories) {
            const foundNode = category.nodes.find(node => node.type === type);
            if (foundNode) return foundNode;
        }
        // Thêm cấu hình cho sub_workflow trực tiếp ở đây để đảm bảo nó luôn tồn tại
        if (type === 'sub_workflow') {
            return this.builder._findNodeConfig(type);
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
        
        if (!this.isSubRunner) { // Only clear logger if it's the top-level runner
            this.logger.clear();
        }
        this.logger.system(this.i18n.get('runner.start_log'));
        this.executionState = {};
        // No longer directly update builder's executionState here.
        // The frontend will update its state based on IPC events.
        
        // Initial update of variables panel
        this.logger.updateVariables(this.globalVariables, this.formData, this.executionState);

        // Set all nodes to idle state initially
        const nodesToRun = this.isServer ? this.nodes : this.builder.nodes;
        nodesToRun.forEach(node => this.logger.nodeState(node.id, 'idle'));

        const connectionsToRun = this.isServer ? this.connections : this.builder.connections;
        const startNodes = nodesToRun.filter(n => !connectionsToRun.some(c => c.to === n.id));

        if (startNodes.length === 0 && nodesToRun.length > 0) {
            this.logger.error(this.i18n.get('runner.no_start_node'));
        } else {
            await Promise.allSettled(startNodes.map(node => this._executeNode(node, [])));
        }

        this.logger.system(this.i18n.get('runner.end_log'));
        this.isSimulating = false;

        if (!this.isServer && this.builder) {
            const runButton = this.builder.container.querySelector('[data-action="run-simulation"]');
            if (runButton) {
                runButton.disabled = false;
                runButton.classList.remove('opacity-50');
            }
            this.builder.dispatchEvent(new CustomEvent('simulation:ended', { detail: { finalState: this.executionState } }));
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
            return;
        }

        this.executionState[node.id] = { _status: 'running' };
        this.logger.nodeState(node.id, 'running');
        this.logger.updateVariables(globalVariables, formData, this.executionState); // Update variables panel

        const resolvedNodeData = JSON.parse(JSON.stringify(node.data));
        const resolutionContext = { global: globalVariables, form: formData, ...this.executionState };
        this._resolveVariablesInObject(resolvedNodeData, resolutionContext);

        const executeNextNodes = async (portName, newTryCatchStack, callingNodeId = node.id) => {
            const nextConnections = connections.filter(c => c.from === callingNodeId && c.fromPort === portName);
            for (const conn of nextConnections) {
                this.logger.animateConnection(conn.id); // Animate connection
                const nextNode = nodes.find(n => n.id === conn.to);
                if (nextNode) await this._executeNode(nextNode, newTryCatchStack);
            }
        };

        try {
            const result = await nodeConfig.execute(resolvedNodeData, this.logger, this.isServer ? this : this.builder);
            
            if (result?.hasOwnProperty('selectedPort')) {
                this.executionState[node.id] = result.data;
                await executeNextNodes(result.selectedPort, tryCatchStack);
            } else {
                this.executionState[node.id] = result;
                await executeNextNodes((nodeConfig.outputs || ['success'])[0], tryCatchStack);
            }
            this.logger.nodeState(node.id, 'success');
        } catch (error) {
            const errorResult = { error: error.message, ...error.context };
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
            this.logger.updateVariables(globalVariables, formData, this.executionState); // Final update of variables panel
            this.logger.nodeState(node.id, 'idle'); // Reset node state after execution
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