/**
 * Headless Workflow Runner (chạy với Object trong code)
 * Cách dùng:
 * 1. Dán object JSON của workflow vào biến `workflowObject`.
 * 2. Chạy script bằng lệnh: node run.js
 */

const path = require('path');
const { getProperty } = require(path.join(__dirname, 'nodes/logic/data_processing.js'));


// --- Logger đơn giản cho Console ---
class ConsoleLogger {
    _log(message, type = 'INFO') {
        const timestamp = new Date().toLocaleTimeString('en-GB');
        let finalMessage = message;
        if (typeof message === 'object') {
            finalMessage = JSON.stringify(message, null, 2);
        }
        console.log(`[${timestamp}][${type}] ${finalMessage}`);
    }
    info(message) { this._log(message, 'INFO'); }
    success(message) { this._log(message, 'SUCCESS'); }
    error(message) { this._log(message, 'ERROR'); }
    system(message) { this._log(message, 'SYSTEM'); }
    clear() { console.clear(); }
}

// --- Bộ máy thực thi Workflow ---
class WorkflowRunner {
    constructor(config, workflowData) {
        this.config = config;
        this.workflow = workflowData;
        this.logger = new ConsoleLogger();
        this.globalVariables = {
            environment: "headless_production",
        };
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
        this.logger.system('--- BẮT ĐẦU THỰC THI WORKFLOW ---');
        const startNodes = this.workflow.nodes.filter(n => !this.workflow.connections.some(c => c.to === n.id));

        if (startNodes.length === 0 && this.workflow.nodes.length > 0) {
            this.logger.error('Lỗi: Không tìm thấy khối bắt đầu. Workflow phải có ít nhất một khối không có đầu vào.');
            return;
        }

        try {
            await Promise.allSettled(startNodes.map(node => this._executeNode(node, [])));
        } catch (e) {
            this.logger.error(`Lỗi nghiêm trọng không bắt được: ${e.message}`);
        }

        this.logger.system('--- KẾT THÚC THỰC THI WORKFLOW ---');
    }

    async _executeNode(node, tryCatchStack) {
        const nodeConfig = this._findNodeConfig(node.type);
        if (!nodeConfig) {
            this.logger.error(`Không tìm thấy cấu hình cho khối loại "${node.type}" (ID: ${node.id})`);
            return;
        }

        this.logger.info(`Đang thực thi khối: "${node.data.title}" (ID: ${node.id})`);

        const resolvedNodeData = JSON.parse(JSON.stringify(node.data));
        const resolutionContext = { global: this.globalVariables, ...this.executionState };

        const resolveRecursively = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    obj[key] = this._resolveVariables(obj[key], resolutionContext);
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    resolveRecursively(obj[key]);
                }
            }
        };
        resolveRecursively(resolvedNodeData);

        const executeNextNodes = async (portName, newTryCatchStack, callingNodeId = node.id) => {
            const nextConnections = this.workflow.connections.filter(c => c.from === callingNodeId && c.fromPort === portName);
            if (nextConnections.length > 0) {
                await Promise.all(nextConnections.map(async (conn) => {
                    const nextNode = this.workflow.nodes.find(n => n.id === conn.to);
                    if (nextNode) {
                        await this._executeNode(nextNode, newTryCatchStack);
                    }
                }));
            }
        };

        if (node.type === 'try_catch') {
            this.logger.info(`Bắt đầu khối Try/Catch: ${node.data.title}`);
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
                            this.logger.info(`Vòng lặp ${i + 1}/${items.length}: item = ${JSON.stringify(item)}`);
                            this.executionState[node.id] = { currentItem: item, currentIndex: i, totalItems: items.length };
                            await this._executeNode(loopBodyStartNode, [...tryCatchStack]);
                        }
                    }
                }
                this.logger.success(`Vòng lặp hoàn thành.`);
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
            this.logger.error(`Lỗi thực thi khối ${node.data.title}: ${error.message}`);
            this.executionState[node.id] = { error: error.message, ...error.context };

            const lastTryCatchNode = tryCatchStack.pop();
            if (lastTryCatchNode) {
                this.logger.info(`Đã bắt được lỗi bởi khối Try/Catch: ${lastTryCatchNode.data.title}. Chuyển hướng tới cổng 'catch'.`);
                this.executionState.error = { message: error.message, sourceNode: node.id, context: error.context };
                await executeNextNodes('catch', tryCatchStack, lastTryCatchNode.id);
            } else {
                await executeNextNodes('error', tryCatchStack);
            }
        }
    }
}

module.exports = WorkflowRunner;