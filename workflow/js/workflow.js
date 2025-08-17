/** * Main class for the Workflow Builder application. 
 */
class WorkflowBuilder extends EventTarget {
    constructor(containerId, config, initialWorkflow = null, initialGlobalVariables = {}) {
        super();
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with id "${containerId}" not found.`);
            return;
        }
        this.config = config;
        this.initialWorkflow = initialWorkflow;
        this.initialGlobalVariables = JSON.parse(JSON.stringify(initialGlobalVariables));
        this.globalVariables = JSON.parse(JSON.stringify(initialGlobalVariables));
        this.formData = {};
        this.formBuilderData = []; // *** NEW: Store Form Builder component structure
        this.executionState = {};
        this.nodes = [];
        this.connections = [];
        this.nodeTypeCounts = {};
        this.panState = { isPanning: false, startX: 0, startY: 0, translateX: 0, translateY: 0, scale: 1 };
        this.activeDrag = { isDraggingNode: false, draggedNodes: [] };
        this.connectionState = { isDrawing: false, startNode: null, startPortName: null, line: null };
        this.selectedNodes = [];
        this.selectedConnection = null;
        this.clipboard = null;
        this.lastMousePosition = { x: 0, y: 0 };
        this.isSimulating = false;
        this.dom = {};
        this.activeVariablePicker = { targetInput: null };
        this.activeVariableContext = null;
        this.treeViewStates = new Map();
        this.selectionBox = { active: false, element: null, startX: 0, startY: 0 };
        
        this.history = [];
        this.historyIndex = -1;
        
        this.curlImportModal = null;
        this.templates = this._getDefaultTemplates();
        this.isFormBuilderOpen = false; 

        this._init();
    }

    _getDefaultTemplates() {
        return {
            nodeContent: `
                <div class="d-flex justify-content-between align-items-start p-3">
                    <div class="d-flex align-items-center gap-2" style="min-width: 0;">
                        <div class="node-status-indicator"></div>
                        <span class="node-icon text-secondary flex-shrink-0">{{icon}}</span>
                        <div>
                            <div class="node-title fw-bold text-dark text-truncate" title="Nhấp đúp để sửa">{{title}}</div>
                            <div class="small text-muted font-monospace mt-n1">{{id}}</div>
                        </div>
                    </div>
                    <button class="node-settings-btn btn btn-light btn-sm p-0 rounded-circle flex-shrink-0" style="width: 24px; height: 24px;">
                        <i class="bi bi-gear-fill"></i>
                    </button>
                </div>`,
            settingsPanel: `
                <div class="p-4">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h3 class="h5 fw-bold text-dark mb-0">Cài đặt (ID: {{id}})</h3>
                        <button data-action="close-settings" class="btn-close"></button>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-semibold" for="settings-title-input">Tiêu đề</label>
                        <input id="settings-title-input" type="text" data-field="title" class="form-control" value="{{title}}">
                    </div>
                    <div data-ref="fields-container"></div>
                </div>`
        };
    }

    _init() {
        this._queryDOMElements();
        this.logger = new Logger(this.dom.consoleOutput);
        this.settingsRenderer = new SettingsRenderer(this);
        
        const formBuilderModalEl = document.getElementById('form-builder-modal');
        if (formBuilderModalEl) {
            this.formBuilder = new FormBuilder(this);
            formBuilderModalEl.addEventListener('show.bs.modal', () => {
                this.isFormBuilderOpen = true;
                this._updateHistoryButtons();
            });
            formBuilderModalEl.addEventListener('hide.bs.modal', () => {
                this.isFormBuilderOpen = false;
                this._updateHistoryButtons();
            });
        }

        this._populatePalette();
        this._setupEventListeners();
        this._updateVariablesPanel();
        
        const modalElement = document.getElementById('curl-import-modal');
        if (modalElement) {
            this.curlImportModal = new bootstrap.Modal(modalElement);
        }

        if (this.initialWorkflow) {
            this.hideStartPage();
            setTimeout(() => this.loadWorkflow(this.initialWorkflow, false), 0);
        } else {
            this.showStartPage();
            this._commitState("Initial State");
        }
        
        this._applyTransform();
        this._hideSettingsPanel();
        this.logger.system("Workflow Builder initialized.");
    }

    // --- PUBLIC API ---

    // *** BẮT ĐẦU THAY ĐỔI: Thêm hàm để quản lý trang bắt đầu và giao diện chính ***
    setMainUIVisibility(visible) {
        this.dom.mainUi?.classList.toggle('hidden', !visible);
    }

    showStartPage() {
        this.dom.startPage?.classList.remove('hidden');
        this.setMainUIVisibility(false);
    }

    hideStartPage() {
        this.dom.startPage?.classList.add('hidden');
        this.setMainUIVisibility(true);
    }
    // *** KẾT THÚC THAY ĐỔI ***

    loadWorkflow(workflowObject, commit = true) { this._importWorkflow(JSON.stringify(workflowObject), commit); }
    getWorkflow() { return this._getCurrentState(); }
    clear() { this._clearCanvas(true); }
    getNode(nodeId) { return this.nodes.find(n => n.id === nodeId); }
    getNodes() { return this.nodes; }
    updateNodeData(nodeId, newData) {
        const node = this.getNode(nodeId);
        if (node) {
            Object.assign(node.data, newData);
            if (node.data.title) {
                const titleEl = node.element.querySelector('.node-title');
                if (titleEl) titleEl.textContent = node.data.title;
            }
            if (this.selectedNodes.some(n => n.id === nodeId)) {
                this._updateSettingsPanel();
            }
            this._commitState(`Updated data for node ${nodeId}`);
            this.dispatchEvent(new CustomEvent('node:data:changed', { detail: { node } }));
        }
    }
    centerOnNode(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return;
        const canvasRect = this.dom.canvasContainer.getBoundingClientRect();
        const nodeWidth = node.element.offsetWidth;
        const nodeHeight = node.element.offsetHeight;
        this.panState.translateX = (canvasRect.width / 2) - (node.x * this.panState.scale) - (nodeWidth / 2 * this.panState.scale);
        this.panState.translateY = (canvasRect.height / 2) - (node.y * this.panState.scale) - (nodeHeight / 2 * this.panState.scale);
        this._applyTransform();
    }
    getConnection(connectionId) { return this.connections.find(c => c.id === connectionId); }
    getConnections() { return this.connections; }
    getGlobalVariable(key) { return this.globalVariables[key]; }
    setGlobalVariable(key, value) {
        this.globalVariables[key] = value;
        this._updateVariablesPanel();
        this.dispatchEvent(new CustomEvent('globalvar:changed', { detail: { key, value } }));
    }
    setFormData(newData) {
        this.formData = newData;
        this._updateVariablesPanel();
    }
    setFormBuilderData(data) {
        this.formBuilderData = JSON.parse(JSON.stringify(data));
    }

    // --- INTERNAL METHODS ---
    _queryDOMElements() {
        const DOMElements = document.querySelectorAll('[data-ref]');
        DOMElements.forEach(el => {
            const key = el.dataset.ref.replace(/-[a-z]/g, g => g[1].toUpperCase());
            this.dom[key] = el;
        });
    }

    _populatePalette() {
        const paletteContent = this.dom.paletteContent;
        paletteContent.innerHTML = '';
        this.config.nodeCategories.forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'palette-category';
            const title = document.createElement('h6');
            title.className = 'text-muted small fw-bold text-uppercase mb-2 mt-3';
            title.textContent = category.name;
            categoryDiv.appendChild(title);
            const gridDiv = document.createElement('div');
            gridDiv.className = 'palette-grid';
            category.nodes.forEach(nodeConfig => {
                const nodeEl = document.createElement('div');
                nodeEl.className = 'palette-node';
                nodeEl.draggable = true;
                nodeEl.dataset.type = nodeConfig.type;
                nodeEl.innerHTML = `<span class="text-secondary">${nodeConfig.icon}</span><span>${nodeConfig.displayName}</span>`;
                nodeEl.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({ type: e.target.dataset.type }));
                });
                gridDiv.appendChild(nodeEl);
            });
            categoryDiv.appendChild(gridDiv);
            paletteContent.appendChild(categoryDiv);
        });
    }

    _setupEventListeners() {
        this.dom.canvasContainer.addEventListener('wheel', (e) => this._handleWheel(e));
        this.dom.canvasContainer.addEventListener('mousedown', (e) => this._handleCanvasMouseDown(e));
        this.dom.canvasContainer.addEventListener('contextmenu', (e) => this._handleCanvasContextMenu(e));
        window.addEventListener('mousemove', (e) => this._handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this._handleMouseUp(e));
        window.addEventListener('keydown', (e) => this._handleKeyDown(e));
        this.dom.canvasContainer.addEventListener('dragover', (e) => e.preventDefault());
        this.dom.canvasContainer.addEventListener('drop', (e) => this._handleDrop(e));
        
        this.dom.settingsPanel.addEventListener('mousedown', (e) => e.stopPropagation());

        document.addEventListener('click', (e) => {
            this._hideAllContextMenus();
            if (!e.target.closest('.variable-picker-popup') && !e.target.closest('.variable-picker-btn')) {
                this._hideVariablePicker();
            }
            if (!e.target.closest('.connector-line')) {
                this._deselectAllConnections();
            }
        });
        this.dom.nodeContextMenu.addEventListener('click', (e) => this._handleContextMenuClick(e));
        this.dom.canvasContextMenu.addEventListener('click', (e) => this._handleContextMenuClick(e));
        this.dom.variableContextMenu.addEventListener('click', (e) => this._handleVariableContextMenuClick(e));
        this.dom.variablePickerPopup.addEventListener('click', (e) => this._handleVariablePick(e));

        this.dom.paletteSearch.addEventListener('input', () => this._handlePaletteSearch());
        
        this.container.querySelector('[data-action="zoom-in"]').addEventListener('click', () => this._zoom(1.2));
        this.container.querySelector('[data-action="zoom-out"]').addEventListener('click', () => this._zoom(1 / 1.2));
        this.container.querySelector('[data-action="reset-view"]').addEventListener('click', () => this._resetView());
        this.container.querySelector('[data-action="run-simulation"]').addEventListener('click', () => this.runSimulation());
        this.container.querySelector('[data-action="export-json"]').addEventListener('click', () => this._exportWorkflow());
        this.container.querySelector('[data-action="import-json"]').addEventListener('click', () => document.getElementById('json-import-input').click());
        document.getElementById('json-import-input').addEventListener('change', (e) => this._handleFileImport(e));
        this.container.querySelector('[data-action="undo"]').addEventListener('click', () => this._undo());
        this.container.querySelector('[data-action="redo"]').addEventListener('click', () => this._redo());

        this.container.querySelector('[data-action="clear-console"]').addEventListener('click', () => this.logger.clear());
        this._setupConsoleResizer();

        this.dom.addGlobalVarForm.addEventListener('submit', (e) => this._handleAddGlobalVariable(e));
    }

    _setupConsoleResizer() {
        const resizer = this.dom.consoleResizer;
        const consolePanel = this.dom.consolePanel;
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            const onMouseMove = (moveEvent) => {
                if (!isResizing) return;
                const newHeight = window.innerHeight - moveEvent.clientY;
                if (newHeight > 50 && newHeight < window.innerHeight - 100) {
                    consolePanel.style.height = `${newHeight}px`;
                }
            };
            const onMouseUp = () => {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }
    
    _applyTransform() {
        this.dom.workflowCanvas.style.transform = `translate(${this.panState.translateX}px, ${this.panState.translateY}px) scale(${this.panState.scale})`;
        this.dom.zoomLevel.textContent = `${Math.round(this.panState.scale * 100)}%`;
        this._updateZoomButtonsState();
    }
    
    _updateZoomButtonsState() {
        const zoomInBtn = this.container.querySelector('[data-action="zoom-in"]');
        const zoomOutBtn = this.container.querySelector('[data-action="zoom-out"]');
        zoomInBtn.disabled = this.panState.scale >= 3;
        zoomOutBtn.disabled = this.panState.scale <= 0.2;
    }

    _zoom(factor, customCenterX, customCenterY) {
        const rect = this.dom.canvasContainer.getBoundingClientRect();
        const centerX = customCenterX !== undefined ? customCenterX : rect.width / 2;
        const centerY = customCenterY !== undefined ? customCenterY : rect.height / 2;
        const newScale = Math.max(0.2, Math.min(3, this.panState.scale * factor));
        const scaleChange = newScale - this.panState.scale;
        this.panState.translateX -= (centerX - this.panState.translateX) * (scaleChange / this.panState.scale);
        this.panState.translateY -= (centerY - this.panState.translateY) * (scaleChange / this.panState.scale);
        this.panState.scale = newScale;
        this._applyTransform();
    }

    _resetView() {
        this.panState.scale = 1;
        const firstNode = this.nodes.find(n => !this.connections.some(c => c.to === n.id)) || this.nodes[0];
        if (firstNode) {
            this.centerOnNode(firstNode.id);
        } else {
            this.panState.translateX = 50;
            this.panState.translateY = 50;
            this._applyTransform();
        }
    }

    _handleWheel(e) {
        e.preventDefault();
        this._hideAllContextMenus();
        const rect = this.dom.canvasContainer.getBoundingClientRect();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        this._zoom(zoomFactor, e.clientX - rect.left, e.clientY - rect.top);
    }

    _handleCanvasMouseDown(e) {
        this._hideAllContextMenus();
        if (e.target.closest('.node')) return;

        if (e.target === this.dom.canvasContainer || e.target === this.dom.workflowCanvas || e.target === this.dom.connectorSvg) {
            if (e.button === 0) { // Left click
                if (e.ctrlKey || e.metaKey) {
                    this.selectionBox.active = true;
                    const rect = this.dom.canvasContainer.getBoundingClientRect();
                    this.selectionBox.startX = e.clientX - rect.left;
                    this.selectionBox.startY = e.clientY - rect.top;
                    this.selectionBox.element = document.createElement('div');
                    this.selectionBox.element.className = 'selection-box';
                    this.dom.canvasContainer.appendChild(this.selectionBox.element);
                } else {
                    this._clearSelection();
                    this.panState.isPanning = true;
                    this.panState.startX = e.clientX;
                    this.panState.startY = e.clientY;
                    this.dom.canvasContainer.style.cursor = 'grabbing';
                }
            }
        }
    }

    _handleMouseMove(e) {
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
        if (this.panState.isPanning) {
            const dx = e.clientX - this.panState.startX;
            const dy = e.clientY - this.panState.startY;
            this.panState.translateX += dx;
            this.panState.translateY += dy;
            this.panState.startX = e.clientX;
            this.panState.startY = e.clientY;
            this._applyTransform();
        } else if (this.activeDrag.isDraggingNode) {
            this.activeDrag.draggedNodes.forEach(dragged => {
                const { node, startX, startY } = dragged;
                const newX = startX + ((e.clientX - this.activeDrag.startMouseX) / this.panState.scale);
                const newY = startY + ((e.clientY - this.activeDrag.startMouseY) / this.panState.scale);
                node.x = newX;
                node.y = newY;
                node.element.style.left = `${newX}px`;
                node.element.style.top = `${newY}px`;
                this._updateConnectionsForNode(node);
            });
        } else if (this.selectionBox.active) {
            const rect = this.dom.canvasContainer.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            const x = Math.min(this.selectionBox.startX, currentX);
            const y = Math.min(this.selectionBox.startY, currentY);
            const width = Math.abs(this.selectionBox.startX - currentX);
            const height = Math.abs(this.selectionBox.startY - currentY);
            Object.assign(this.selectionBox.element.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
        } else if (this.connectionState.isDrawing) {
            const rect = this.dom.workflowCanvas.getBoundingClientRect();
            const endX = (e.clientX - rect.left) / this.panState.scale;
            const endY = (e.clientY - rect.top) / this.panState.scale;
            const startPos = this._getPortPosition(this.connectionState.startNode, this.connectionState.startPortName);
            this._drawConnectorPath(this.connectionState.line, startPos.x, startPos.y, endX, endY);
        }
    }

    _handleMouseUp(e) {
        if (this.panState.isPanning) {
            this.panState.isPanning = false;
            this.dom.canvasContainer.style.cursor = 'grab';
        }
        if (this.activeDrag.isDraggingNode) {
            this.dispatchEvent(new CustomEvent('node:drag:end', { detail: { nodes: this.activeDrag.draggedNodes.map(d => d.node) } }));
            this._commitState("Di chuyển khối");
            this.activeDrag.isDraggingNode = false;
            this.activeDrag.draggedNodes = [];
        }
        if (this.connectionState.isDrawing) {
            if (this.connectionState.line?.parentNode) {
                this.dom.connectorSvg.removeChild(this.connectionState.line);
            }
            this.connectionState.isDrawing = false;
            this.connectionState.line = null;
        }
        if (this.selectionBox.active) {
            const boxRect = this.selectionBox.element.getBoundingClientRect();
            this.nodes.forEach(node => {
                const nodeRect = node.element.getBoundingClientRect();
                if (boxRect.left < nodeRect.right && boxRect.right > nodeRect.left &&
                    boxRect.top < nodeRect.bottom && boxRect.bottom > nodeRect.top) {
                    this._addNodeToSelection(node);
                }
            });
            this.selectionBox.element.remove();
            this.selectionBox.active = false;
            this.selectionBox.element = null;
            this._updateSettingsPanel();
        }
    }

    _handleKeyDown(e) {
        if (this.isFormBuilderOpen) return;
        const activeEl = document.activeElement;
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') return;
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'Z' || e.key === 'z')) { e.preventDefault(); this._redo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this._undo(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); this._copySelectedItems(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); this._pasteSelectedNodes(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { this._deleteSelectedItems(); }
    }

    _handleDrop(e) {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (!data || !data.type) return;
        const rect = this.dom.canvasContainer.getBoundingClientRect();
        const x = (e.clientX - rect.left - this.panState.translateX) / this.panState.scale;
        const y = (e.clientY - rect.top - this.panState.translateY) / this.panState.scale;
        this._clearSelection();
        const newNode = this._createNode(data.type, { x, y });
        this._addNodeToSelection(newNode);
        this._showSettingsPanel();
        this._commitState("Tạo khối");
    }

    _handlePaletteSearch() {
        const searchTerm = this.dom.paletteSearch.value.toLowerCase().trim();
        const categories = this.dom.paletteContent.querySelectorAll('.palette-category');
        categories.forEach(category => {
            let hasVisibleNode = false;
            const nodes = category.querySelectorAll('.palette-node');
            nodes.forEach(node => {
                const isVisible = node.textContent.toLowerCase().includes(searchTerm);
                node.style.display = isVisible ? 'flex' : 'none';
                if (isVisible) hasVisibleNode = true;
            });
            category.style.display = hasVisibleNode ? '' : 'none';
        });
    }

    _createNode(type, position, initialData = null, forcedId = null) {
        const nodeConfig = this._findNodeConfig(type);
        if (!nodeConfig) {
            console.error(`Không tìm thấy cấu hình cho khối loại "${type}".`);
            return null;
        }
        const nodeType = nodeConfig.type;
        const nodeId = forcedId ? forcedId : (() => {
            const index = this.nodeTypeCounts[nodeType] || 0;
            this.nodeTypeCounts[nodeType] = index + 1;
            return `${nodeType}_${index}`;
        })();
        const nodeElement = document.createElement('div');
        nodeElement.id = nodeId;
        nodeElement.className = 'node';
        nodeElement.style.left = `${position.x}px`;
        nodeElement.style.top = `${position.y}px`;
        const nodeData = initialData ? JSON.parse(JSON.stringify(initialData)) : JSON.parse(JSON.stringify(nodeConfig.defaultData || {}));
        nodeData.title = nodeData.title || nodeConfig.title;
        nodeElement.innerHTML = this.templates.nodeContent
            .replace(/{{icon}}/g, nodeConfig.icon || '')
            .replace(/{{title}}/g, nodeData.title)
            .replace(/{{id}}/g, nodeId);
        const inPort = document.createElement('div');
        inPort.className = 'port in';
        inPort.dataset.portType = 'in';
        nodeElement.appendChild(inPort);
        const outputNames = nodeConfig.outputs || ['success'];
        outputNames.forEach((portName, index) => {
            const outPort = document.createElement('div');
            outPort.className = 'port out';
            outPort.dataset.portType = 'out';
            outPort.dataset.portName = portName;
            outPort.style.top = `${(index + 1) * (100 / (outputNames.length + 1))}%`;
            outPort.style.transform = 'translateY(-50%)';
            if (outputNames.length > 1) {
                outPort.innerHTML = `<span class="port-label">${portName}</span>`;
            }
            nodeElement.appendChild(outPort);
        });
        this.dom.workflowCanvas.appendChild(nodeElement);
        const node = { id: nodeId, type, x: position.x, y: position.y, element: nodeElement, data: nodeData };
        this.nodes.push(node);
        this._addNodeEventListeners(node);
        this.dispatchEvent(new CustomEvent('node:added', { detail: { node } }));
        return node;
    }

    _addNodeEventListeners(node) {
        const { element } = node;
        element.addEventListener('mousedown', (e) => this._handleNodeMouseDown(e, node));
        element.addEventListener('contextmenu', (e) => this._handleNodeContextMenu(e, node));
        element.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._clearSelection();
            this._addNodeToSelection(node);
            this._showSettingsPanel();
        });
        const titleEl = element.querySelector('.node-title');
        if (titleEl) {
            titleEl.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this._enableTitleEdit(node, titleEl);
            });
        }
        const settingsBtn = element.querySelector('.node-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._clearSelection();
                this._addNodeToSelection(node);
                this._showSettingsPanel();
            });
        }
        element.querySelectorAll('.port').forEach(port => {
            if (port.dataset.portType === 'out') {
                port.addEventListener('mousedown', (e) => this._handlePortMouseDown(e, node, port));
            } else { // 'in' port
                port.addEventListener('mouseup', (e) => this._handlePortMouseUp(e, node, port));
                port.addEventListener('mousedown', (e) => this._handleInputPortMouseDown(e, node, port));
            }
        });
    }
    
    _enableTitleEdit(node, titleEl) {
        titleEl.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = node.data.title;
        input.className = 'form-control form-control-sm';
        titleEl.parentNode.insertBefore(input, titleEl.nextSibling);
        input.focus();
        input.select();
        const finishEditing = () => {
            const newTitle = input.value.trim();
            if (newTitle) {
                this.updateNodeData(node.id, { title: newTitle });
            }
            input.remove();
            titleEl.style.display = '';
        };
        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finishEditing();
            if (e.key === 'Escape') {
                input.value = node.data.title;
                finishEditing();
            }
        });
    }
    
    _handleNodeMouseDown(e, node) {
        e.stopPropagation();
        if (e.button === 2) return;
        const isAlreadySelected = this.selectedNodes.includes(node) && this.selectedNodes.length === 1;
        if (!isAlreadySelected) {
             const isCtrlPressed = e.ctrlKey || e.metaKey;
             const isSelected = this.selectedNodes.includes(node);
             if (!isCtrlPressed && !isSelected) { this._clearSelection(); this._addNodeToSelection(node); }
             else if (isCtrlPressed && !isSelected) { this._addNodeToSelection(node); }
             else if (isCtrlPressed && isSelected) { this._removeNodeFromSelection(node); }
             this._updateSettingsPanel();
        }
        if (e.target.closest('.port, .node-settings-btn') || e.target.tagName === 'INPUT') return;
        this.activeDrag.isDraggingNode = true;
        this.activeDrag.startMouseX = e.clientX;
        this.activeDrag.startMouseY = e.clientY;
        this.activeDrag.draggedNodes = this.selectedNodes.map(n => ({ node: n, startX: n.x, startY: n.y }));
        this.dispatchEvent(new CustomEvent('node:drag:start', { detail: { nodes: this.activeDrag.draggedNodes.map(d => d.node) } }));
    }
    
    _deleteSelectedItems() {
        if (this.selectedNodes.length > 0) {
            this._deleteSelectedNodes();
        } else if (this.selectedConnection) {
            this._deleteConnection(this.selectedConnection);
        }
    }

    _deleteSelectedNodes() {
        if (this.selectedNodes.length === 0) return;
        const nodesToDelete = [...this.selectedNodes];
        nodesToDelete.forEach(node => {
            const connectionsToRemove = this.connections.filter(c => c.from === node.id || c.to === node.id);
            connectionsToRemove.forEach(c => this._deleteConnection(c, false));
            node.element.remove();
            this.nodes = this.nodes.filter(n => n.id !== node.id);
            this.dispatchEvent(new CustomEvent('node:removed', { detail: { nodeId: node.id } }));
        });
        this._clearSelection();
        this._commitState("Xóa khối");
    }

    _deleteConnection(connToDelete, commit = true) {
        if (!connToDelete) return;
        this.connections = this.connections.filter(c => c.id !== connToDelete.id);
        connToDelete.line.remove();
        if (this.selectedConnection?.id === connToDelete.id) {
            this.selectedConnection = null;
        }
        this.dispatchEvent(new CustomEvent('connection:removed', { detail: { connection: connToDelete } }));
        if (commit) this._commitState("Xóa kết nối");
    }

    _copySelectedItems() {
        if (this.selectedNodes.length > 0) {
            this._copySelectedNodes();
        }
    }

    _copySelectedNodes() {
        if (this.selectedNodes.length === 0) return;
        this.clipboard = {
            type: 'nodes',
            nodes: this.selectedNodes.map(node => ({
                type: node.type, data: JSON.parse(JSON.stringify(node.data)), x: node.x, y: node.y
            }))
        };
        const minX = Math.min(...this.clipboard.nodes.map(n => n.x));
        const minY = Math.min(...this.clipboard.nodes.map(n => n.y));
        this.clipboard.nodes.forEach(n => { n.relX = n.x - minX; n.relY = n.y - minY; });
        this.logger.system(`Đã sao chép ${this.clipboard.nodes.length} khối.`);
    }

    _pasteSelectedNodes() {
        if (!this.clipboard || this.clipboard.type !== 'nodes') return;
        this._clearSelection();
        const rect = this.dom.canvasContainer.getBoundingClientRect();
        const pasteX = (this.lastMousePosition.x - rect.left - this.panState.translateX) / this.panState.scale;
        const pasteY = (this.lastMousePosition.y - rect.top - this.panState.translateY) / this.panState.scale;
        const newNodes = this.clipboard.nodes.map(nodeInfo => 
            this._createNode(nodeInfo.type, { x: pasteX + nodeInfo.relX, y: pasteY + nodeInfo.relY }, nodeInfo.data)
        );
        newNodes.forEach(node => this._addNodeToSelection(node));
        if (newNodes.length === 1) { this._showSettingsPanel(); }
        this._commitState("Dán khối");
    }
    
    _clearSelection() {
        this.selectedNodes.forEach(node => {
            node.element.classList.remove('selected');
            this.dispatchEvent(new CustomEvent('node:deselected', { detail: { node } }));
        });
        this.selectedNodes = [];
        this._deselectAllConnections();
        this._updateSettingsPanel();
    }

    _addNodeToSelection(node) {
        if (!this.selectedNodes.includes(node)) {
            this.selectedNodes.push(node);
            node.element.classList.add('selected');
            this.dispatchEvent(new CustomEvent('node:selected', { detail: { node } }));
            this._updateSettingsPanel();
        }
    }

    _removeNodeFromSelection(node) {
        const index = this.selectedNodes.indexOf(node);
        if (index > -1) {
            this.selectedNodes.splice(index, 1);
            node.element.classList.remove('selected');
            this.dispatchEvent(new CustomEvent('node:deselected', { detail: { node } }));
            this._updateSettingsPanel();
        }
    }
    
    _selectConnection(connToSelect) {
        this._clearSelection();
        this.selectedConnection = connToSelect;
        this.selectedConnection.line.classList.add('selected');
        this.dispatchEvent(new CustomEvent('connection:selected', { detail: { connection: connToSelect } }));
    }

    _deselectAllConnections() {
        if (this.selectedConnection) {
            this.selectedConnection.line.classList.remove('selected');
            this.dispatchEvent(new CustomEvent('connection:deselected', { detail: { connection: this.selectedConnection } }));
            this.selectedConnection = null;
        }
    }

    _showSettingsPanel() { this.dom.settingsPanel.classList.remove('hidden'); }
    _hideSettingsPanel() { this.dom.settingsPanel.classList.add('hidden'); }

    _getProperty(obj, path) {
        if (typeof path !== 'string' || !path) return undefined;
        return path.split('.').reduce((o, i) => (o && typeof o === 'object' && i in o) ? o[i] : undefined, obj);
    }

    _setProperty(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
    }
    
    _updateSettingsPanel() {
        const content = this.dom.settingsPanel;
        if (this.selectedNodes.length !== 1) {
            this._hideSettingsPanel();
            return;
        }

        let activeTabId = null;
        const activeTabButton = content.querySelector('.nav-tabs .nav-link.active');
        if (activeTabButton) {
            activeTabId = activeTabButton.getAttribute('data-bs-target');
        }
        
        const node = this.selectedNodes[0];
        const nodeConfig = this._findNodeConfig(node.type);
        
        const panelTemplate = this.templates.settingsPanel;
        const titleValue = this._getProperty(node.data, 'title') || '';
        content.innerHTML = panelTemplate.replace(/{{id}}/g, node.id).replace('{{title}}', titleValue);

        const titleInput = content.querySelector('#settings-title-input');
        if(titleInput) {
            titleInput.value = titleValue;
            titleInput.addEventListener('input', (e) => {
                const newTitle = e.target.value;
                this._setProperty(node.data, 'title', newTitle);
                 const titleEl = node.element.querySelector('.node-title');
                if (titleEl) titleEl.textContent = newTitle;
                this._commitState("Sửa tiêu đề");
            });
        }
        
        content.querySelector('[data-action="close-settings"]')?.addEventListener('click', () => this._hideSettingsPanel());

        const fieldsContainer = content.querySelector('[data-ref="fields-container"]');
        if (fieldsContainer && nodeConfig.settings) {
            const formElements = this.settingsRenderer.renderAndBind(
                nodeConfig.settings, 
                node.id, 
                node.data,
                nodeConfig
            );
            fieldsContainer.appendChild(formElements);
        }

        if (activeTabId) {
            const newTabButton = content.querySelector(`[data-bs-target="${activeTabId}"]`);
            if (newTabButton) {
                const tab = new bootstrap.Tab(newTabButton);
                tab.show();
            }
        }
    }

    _handleInputPortMouseDown(e, endNode, endPort) {
        e.stopPropagation();
        const connToDetach = this.connections.find(c => c.to === endNode.id);
        if (!connToDetach) return;
        const startNode = this.nodes.find(n => n.id === connToDetach.from);
        if (!startNode) return;
        this._deleteConnection(connToDetach, false);
        this._commitState("Bắt đầu gỡ kết nối");
        connToDetach.line.classList.remove('selected');
        connToDetach.line.classList.add('connector-line-drawing');
        this.connectionState = { isDrawing: true, startNode: startNode, startPortName: connToDetach.fromPort, line: connToDetach.line };
    }

    _handlePortMouseDown(e, node, port) {
        e.stopPropagation();
        if (port.dataset.portType === 'out') {
            this.connectionState = { isDrawing: true, startNode: node, startPortName: port.dataset.portName };
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            line.setAttribute('class', 'connector-line-drawing');
            line.setAttribute('stroke-linejoin', 'round');
            line.setAttribute('stroke-linecap', 'round');
            this.connectionState.line = line;
            this.dom.connectorSvg.appendChild(line);
        }
    }

    _handlePortMouseUp(e, endNode, endPort) {
        e.stopPropagation();
        if (this.connectionState.isDrawing && endPort.dataset.portType === 'in') {
            if (this.connectionState.startNode.id !== endNode.id) {
                this._createConnection(this.connectionState.startNode, this.connectionState.startPortName, endNode);
                this._commitState("Tạo kết nối");
            }
        }
        if (this.connectionState.isDrawing) {
            if (this.connectionState.line?.parentNode) {
                this.dom.connectorSvg.removeChild(this.connectionState.line);
            }
            this.connectionState.isDrawing = false;
            this.connectionState.line = null;
        }
    }

    _createConnection(startNode, startPortName, endNode) {
        const existingInConnection = this.connections.find(c => c.to === endNode.id);
        if (existingInConnection) {
            this._deleteConnection(existingInConnection, false);
        }
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('class', 'connector-line');
        line.dataset.fromPort = startPortName;
        line.setAttribute('stroke-linejoin', 'round');
        line.setAttribute('stroke-linecap', 'round');
        const connection = { id: `conn-${startNode.id}:${startPortName}-${endNode.id}`, from: startNode.id, fromPort: startPortName, to: endNode.id, line };
        line.addEventListener('click', (e) => { e.stopPropagation(); this._selectConnection(connection); });
        this.dom.connectorSvg.appendChild(line);
        this.connections.push(connection);
        this._updateConnectionPath(connection);
        this.dispatchEvent(new CustomEvent('connection:added', { detail: { connection } }));
        return connection;
    }

    _getPortPosition(node, portNameOrType) {
        const portElement = node.element.querySelector(`.port[data-port-name="${portNameOrType}"]`) || node.element.querySelector(`.port[data-port-type="${portNameOrType}"]`);
        if (!portElement) return { x: 0, y: 0 };
        const portRect = portElement.getBoundingClientRect();
        const canvasRect = this.dom.workflowCanvas.getBoundingClientRect();
        return {
            x: (portRect.left + portRect.width / 2 - canvasRect.left) / this.panState.scale,
            y: (portRect.top + portRect.height / 2 - canvasRect.top) / this.panState.scale
        };
    }

    _updateConnectionPath(connection) {
        const startNode = this.nodes.find(n => n.id === connection.from);
        const endNode = this.nodes.find(n => n.id === connection.to);
        if (!startNode || !endNode) return;
        const startPos = this._getPortPosition(startNode, connection.fromPort);
        const endPos = this._getPortPosition(endNode, 'in');
        this._drawConnectorPath(connection.line, startPos.x, startPos.y, endPos.x, endPos.y);
    }
    
    _drawConnectorPath(path, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const sCurveThreshold = 20;
        const baseRadius = 20;
        if (dx < -sCurveThreshold) {
            const offset = 40;
            const midY = y1 + dy / 2;
            const ySign = dy >= 0 ? 1 : -1;
            const radius = Math.min(baseRadius, offset / 2, Math.abs(dy) / 4);
            const d = [`M ${x1} ${y1}`,`L ${x1 + offset - radius} ${y1}`,`Q ${x1 + offset} ${y1} ${x1 + offset} ${y1 + radius * ySign}`,`L ${x1 + offset} ${midY - radius * ySign}`,`Q ${x1 + offset} ${midY} ${x1 + offset - radius} ${midY}`,`L ${x2 - offset + radius} ${midY}`,`Q ${x2 - offset} ${midY} ${x2 - offset} ${midY + radius * ySign}`,`L ${x2 - offset} ${y2 - radius * ySign}`,`Q ${x2 - offset} ${y2} ${x2 - offset + radius} ${y2}`,`L ${x2} ${y2}`].join(' ');
            path.setAttribute('d', d);
            return;
        }
        const effectiveRadius = Math.min(baseRadius, Math.abs(dx) / 2, Math.abs(dy) / 2);
        const midX = x1 + dx / 2;
        const xSign = dx >= 0 ? 1 : -1;
        const ySign = dy >= 0 ? 1 : -1;
        if (effectiveRadius < 5) { 
            path.setAttribute('d', `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
            return;
        }
        const d = [`M ${x1} ${y1}`,`L ${midX - effectiveRadius * xSign} ${y1}`,`Q ${midX} ${y1} ${midX} ${y1 + effectiveRadius * ySign}`,`L ${midX} ${y2 - effectiveRadius * ySign}`,`Q ${midX} ${y2} ${midX + effectiveRadius * xSign} ${y2}`,`L ${x2} ${y2}`].join(' ');
        path.setAttribute('d', d);
    }

    _updateConnectionsForNode(node) {
        this.connections.forEach(conn => {
            if (conn.from === node.id || conn.to === node.id) {
                this._updateConnectionPath(conn);
            }
        });
    }
    
    _handleCanvasContextMenu(e) {
        if (e.target === this.dom.canvasContainer || e.target === this.dom.workflowCanvas) {
            e.preventDefault();
            this._hideAllContextMenus();
            const menu = this.dom.canvasContextMenu;
            menu.querySelector('[data-action="paste"]').classList.toggle('disabled', !this.clipboard);
            this._updateHistoryButtons();
            Object.assign(menu.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px` });
        }
    }

    _handleNodeContextMenu(e, node) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.selectedNodes.includes(node)) {
            this._clearSelection();
            this._addNodeToSelection(node);
        }
        this._hideAllContextMenus();
        const menu = this.dom.nodeContextMenu;
        menu.querySelector('[data-action="paste"]').classList.toggle('disabled', !this.clipboard);
        Object.assign(menu.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px` });
    }

    _hideAllContextMenus() {
        this.dom.nodeContextMenu.style.display = 'none';
        this.dom.canvasContextMenu.style.display = 'none';
        this.dom.variableContextMenu.style.display = 'none';
    }

    _handleContextMenuClick(e) {
        const item = e.target.closest('.context-menu-item');
        if (!item || item.classList.contains('disabled')) return;
        const action = item.dataset.action;
        if (!action) return;
        switch (action) {
            case 'delete': this._deleteSelectedItems(); break;
            case 'copy': this._copySelectedItems(); break;
            case 'paste': this._pasteSelectedNodes(); break;
            case 'undo': this._undo(); break;
            case 'redo': this._redo(); break;
        }
        this._hideAllContextMenus();
    }

    _findNodeConfig(type) {
        for (const category of this.config.nodeCategories) {
            const foundNode = category.nodes.find(node => node.type === type);
            if (foundNode) return foundNode;
        }
        return null;
    }

    _commitState(actionName) {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        const state = this._getCurrentState();
        this.history.push(state);
        this.historyIndex++;
        this.dispatchEvent(new CustomEvent('workflow:changed', { detail: { action: actionName, state } }));
        this._updateHistoryButtons();
    }

    _getCurrentState() {
        return {
            nodes: this.nodes.map(n => ({ 
                id: n.id, type: n.type, x: n.x, y: n.y, data: JSON.parse(JSON.stringify(n.data)) 
            })),
            connections: this.connections.map(c => ({ from: c.from, fromPort: c.fromPort, to: c.to })),
            formBuilder: this.formBuilderData 
        };
    }
    
    _loadState(state) {
        this._clearCanvas(false);
        const idMap = new Map();
        this.nodeTypeCounts = {};
        
        (state.nodes || []).forEach(nodeInfo => {
            const newNode = this._createNode(nodeInfo.type, { x: nodeInfo.x, y: nodeInfo.y }, nodeInfo.data, nodeInfo.id);
            if (newNode) {
                idMap.set(nodeInfo.id, newNode);
                const [type, indexStr] = nodeInfo.id.split(/_(?=[^_]*$)/);
                const index = parseInt(indexStr, 10);
                if (type && !isNaN(index)) {
                    if (this.nodeTypeCounts[type] === undefined || this.nodeTypeCounts[type] <= index) {
                        this.nodeTypeCounts[type] = index + 1;
                    }
                }
            }
        });

        (state.connections || []).forEach(connInfo => {
            const startNode = idMap.get(connInfo.from);
            const endNode = idMap.get(connInfo.to);
            if (startNode && endNode) {
                this._createConnection(startNode, connInfo.fromPort || 'out', endNode);
            }
        });

        if (this.formBuilder && state.formBuilder) {
            this.formBuilder.loadComponents(state.formBuilder);
        } else if (this.formBuilder) {
            this.formBuilder.clearCanvas(false);
        }

        this._clearSelection();
        this.dispatchEvent(new CustomEvent('workflow:loaded', { detail: { workflow: state } }));
    }

    _undo() {
        if (this.historyIndex <= 0) return;
        this.historyIndex--;
        this._loadState(JSON.parse(JSON.stringify(this.history[this.historyIndex])));
        this._updateHistoryButtons();
    }

    _redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.historyIndex++;
        this._loadState(JSON.parse(JSON.stringify(this.history[this.historyIndex])));
        this._updateHistoryButtons();
    }

    _updateHistoryButtons() {
        const undoBtn = this.container.querySelector('[data-action="undo"]');
        const redoBtn = this.container.querySelector('[data-action="redo"]');
        const undoMenuItem = this.dom.canvasContextMenu.querySelector('[data-action="undo"]');
        const redoMenuItem = this.dom.canvasContextMenu.querySelector('[data-action="redo"]');
        const isDisabled = this.isFormBuilderOpen;
        const canUndo = this.historyIndex > 0 && !isDisabled;
        const canRedo = this.historyIndex < this.history.length - 1 && !isDisabled;
        undoBtn.disabled = !canUndo;
        redoBtn.disabled = !canRedo;
        if(undoMenuItem) undoMenuItem.classList.toggle('disabled', !canUndo);
        if(redoMenuItem) redoMenuItem.classList.toggle('disabled', !canRedo);
    }

    _handleAddGlobalVariable(e) {
        e.preventDefault();
        const keyInput = e.target.querySelector('input[name="key"]');
        const valueInput = e.target.querySelector('input[name="value"]');
        const key = keyInput.value.trim();
        let value = valueInput.value.trim();
        if (!key) return;
        try { value = JSON.parse(value); } catch (error) { /* It's just a string */ }
        this.setGlobalVariable(key, value);
        e.target.reset();
        keyInput.focus();
    }
    
    _updateVariablesPanel() {
        if (!this.dom.variablesPanel) return;
        this.dom.variablesPanel.querySelectorAll('details').forEach(d => { this.treeViewStates.set(d.id, d.open); });
        
        const globalContainer = this.dom.globalVariablesContainer;
        globalContainer.innerHTML = '';
        globalContainer.appendChild(this._createTreeView(this.globalVariables, 'global'));
        
        const nodeOutputsContainer = this.dom.nodeOutputsContainer;
        nodeOutputsContainer.innerHTML = '';
        nodeOutputsContainer.appendChild(this._createNodeOutputsTreeView(this.executionState));
    }

    _createNodeOutputsTreeView(executionState) {
        if (!executionState || Object.keys(executionState).length === 0) {
            return Object.assign(document.createElement('span'), { className: 'text-muted fst-italic', textContent: 'Chưa có đầu ra nào' });
        }
        const root = document.createElement('div');
        for (const nodeId in executionState) {
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) continue;
            const nodeConfig = this._findNodeConfig(node.type);
            const nodeOutputData = executionState[nodeId];
            const isRunning = nodeOutputData?._status === 'running';
            const details = document.createElement('details');
            details.id = `tree-details-${nodeId}`;
            details.open = this.treeViewStates.get(details.id) ?? !isRunning;
            const summary = document.createElement('summary');
            summary.className = 'd-flex align-items-center gap-2 p-1 rounded';
            Object.assign(summary.dataset, { key: nodeId, value: JSON.stringify(nodeOutputData), path: nodeId });
            summary.addEventListener('contextmenu', (e) => this._handleVariableContextMenu(e));
            const isErrorObject = !isRunning && typeof nodeOutputData === 'object' && nodeOutputData?.hasOwnProperty('error');
            const togglerSpan = document.createElement('span');
            togglerSpan.className = 'w-4 h-4 d-flex align-items-center justify-content-center flex-shrink-0 me-2';
            if (isRunning) {
                togglerSpan.innerHTML = `<svg class="spinner" style="width: 1em; height: 1em;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" class="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" class="opacity-75"></path></svg>`;
            } else { togglerSpan.classList.add('tree-toggler'); }
            const nodeIconSpan = Object.assign(document.createElement('span'), { className: `flex-shrink-0 ${isErrorObject ? 'text-danger' : 'text-secondary'}`, innerHTML: nodeConfig.icon });
            const titleSpan = Object.assign(document.createElement('span'), { className: 'fw-semibold text-dark text-truncate', textContent: node.data.title });
            const idSpan = Object.assign(document.createElement('span'), { className: 'small text-muted font-monospace ms-auto', textContent: node.id });
            summary.append(togglerSpan, nodeIconSpan, titleSpan, idSpan);
            details.appendChild(summary);
            if (isRunning) {
                details.appendChild(Object.assign(document.createElement('div'), { className: 'ps-5 text-muted fst-italic', textContent: 'Đang chạy...' }));
            } else {
                const contentDiv = Object.assign(document.createElement('div'), { className: 'ps-4' });
                contentDiv.appendChild(this._createTreeView(nodeOutputData, nodeId));
                details.appendChild(contentDiv);
            }
            root.appendChild(details);
        }
        return root;
    }

    _createTreeView(obj, parentPath = '') {
        if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
            return Object.assign(document.createElement('span'), { className: 'text-muted fst-italic ps-3', textContent: 'Không có dữ liệu' });
        }
        const root = document.createElement('div');
        for (const key in obj) {
            if (key === '_status') continue;
            const currentPath = parentPath ? `${parentPath}.${key}` : key;
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
                const details = document.createElement('details');
                details.id = `tree-details-${currentPath.replace(/\./g, '-')}`;
                details.style.paddingLeft = '1.5em';
                details.open = this.treeViewStates.get(details.id) ?? false;
                const summary = document.createElement('summary');
                const isErrorObject = value.hasOwnProperty('error');
                summary.innerHTML = `<span class="tree-toggler me-2"></span><span class="tree-key">${key}</span>: ${isErrorObject ? `<span class="tree-value-error">Error</span>` : Array.isArray(value) ? `Array(${value.length})` : 'Object'}`;
                Object.assign(summary.dataset, { key, value: JSON.stringify(value), path: currentPath });
                summary.addEventListener('contextmenu', (e) => this._handleVariableContextMenu(e));
                details.appendChild(summary);
                details.appendChild(this._createTreeView(value, currentPath));
                root.appendChild(details);
            } else {
                const p = document.createElement('div');
                p.style.paddingLeft = '1.5em';
                let valueClass = 'tree-value-null';
                if (typeof value === 'string') valueClass = 'tree-value-string';
                else if (typeof value === 'number') valueClass = 'tree-value-number';
                else if (typeof value === 'boolean') valueClass = 'tree-value-boolean';
                const formattedValue = typeof value === 'string' ? `"${value}"` : `${value}`;
                p.innerHTML = `<span class="tree-key">${key}</span>: <span class="${valueClass}">${formattedValue}</span>`;
                Object.assign(p.dataset, { key, value: JSON.stringify(value), path: currentPath });
                p.addEventListener('contextmenu', (e) => this._handleVariableContextMenu(e));
                root.appendChild(p);
            }
        }
        return root;
    }

    _createPickerTreeView(obj, prefix) {
        const fragment = document.createDocumentFragment();
        for (const key in obj) {
            if (key === '_status') continue;
            const path = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
                const details = document.createElement('details');
                const summary = document.createElement('summary');
                summary.textContent = key;
                details.append(summary, this._createPickerTreeView(value, path));
                fragment.appendChild(details);
            } else {
                const item = document.createElement('div');
                item.className = 'variable-picker-item';
                item.dataset.path = path;
                item.innerHTML = `<span class="path">${key}</span>`;
                fragment.appendChild(item);
            }
        }
        return fragment;
    }

    _showVariablePicker(targetInput, button) {
        this._hideVariablePicker();
        this.activeVariablePicker.targetInput = targetInput;
        const popup = this.dom.variablePickerPopup;
        popup.innerHTML = '';
        const createSection = (title, data, prefix) => {
            const header = Object.assign(document.createElement('h6'), { className: "small text-uppercase text-muted fw-bold p-1 mt-2", textContent: title });
            popup.appendChild(header);
            popup.appendChild(this._createPickerTreeView(data, prefix));
        };
        createSection('Biến Toàn Cục', this.globalVariables, 'global');
        createSection('Dữ liệu Form', this.formData, 'form');
        createSection('Đầu ra các Khối', this.executionState, '');
        const btnRect = button.getBoundingClientRect();
        popup.style.display = 'block';
        const popupRect = popup.getBoundingClientRect();
        let top = btnRect.bottom + 4;
        if (top + popupRect.height > window.innerHeight) top = btnRect.top - popupRect.height - 4;
        let left = btnRect.left;
        if (left + popupRect.width > window.innerWidth) left = btnRect.right - popupRect.width;
        Object.assign(popup.style, { top: `${top}px`, left: `${left}px` });
    }

    _hideVariablePicker() {
        this.dom.variablePickerPopup.style.display = 'none';
        this.activeVariablePicker.targetInput = null;
    }

    _handleVariablePick(e) {
        const item = e.target.closest('.variable-picker-item');
        if (!item || !this.activeVariablePicker.targetInput) return;
        const path = item.dataset.path;
        const variableString = `{{${path}}}`;
        const input = this.activeVariablePicker.targetInput;
        input.value = variableString;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        this._hideVariablePicker();
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

    async runSimulation() {
        if (this.isSimulating) return;
        this.isSimulating = true;
        this.dispatchEvent(new CustomEvent('simulation:started'));
        const runButton = this.container.querySelector('[data-action="run-simulation"]');
        runButton.disabled = true;
        runButton.classList.add('opacity-50');
        this.logger.clear();
        this.logger.system('--- Bắt đầu Mô phỏng ---');
        this.executionState = {};
        this.treeViewStates.clear();
        this._updateVariablesPanel();
        this.nodes.forEach(node => this._setNodeState(node, 'idle'));
        const startNodes = this.nodes.filter(n => !this.connections.some(c => c.to === n.id));
        if (startNodes.length === 0 && this.nodes.length > 0) {
            this.logger.error('Không tìm thấy khối bắt đầu. Workflow phải có ít nhất một khối không có đầu vào.');
        } else {
            await Promise.allSettled(startNodes.map(node => this._executeNode(node, [])));
        }
        this.logger.system('--- Kết thúc Mô phỏng ---');
        this.isSimulating = false;
        runButton.disabled = false;
        runButton.classList.remove('opacity-50');
        this.dispatchEvent(new CustomEvent('simulation:ended', { detail: { finalState: this.executionState } }));
    }

    async _animateConnection(connection) {
        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        Object.assign(pulse.style, { stroke: window.getComputedStyle(connection.line).stroke, strokeDasharray: `20 ${connection.line.getTotalLength()}` });
        pulse.setAttribute('d', connection.line.getAttribute('d'));
        pulse.setAttribute('class', 'connector-pulse');
        pulse.setAttribute('stroke-linejoin', 'round');
        pulse.setAttribute('stroke-linecap', 'round');
        this.dom.connectorSvg.appendChild(pulse);
        setTimeout(() => { pulse.remove(); }, 600);
    }

    async _executeNode(node, tryCatchStack) {
        const nodeConfig = this._findNodeConfig(node.type);
        this.executionState[node.id] = { _status: 'running' };
        this._updateVariablesPanel();
        this._setNodeState(node, 'running');
        this.dispatchEvent(new CustomEvent('simulation:node:start', { detail: { node } }));
        const resolvedNodeData = JSON.parse(JSON.stringify(node.data));
        const resolutionContext = { global: this.globalVariables, form: this.formData, ...this.executionState };
        const resolveRecursively = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') obj[key] = this._resolveVariables(obj[key], resolutionContext);
                else if (typeof obj[key] === 'object' && obj[key] !== null) resolveRecursively(obj[key]);
            }
        };
        resolveRecursively(resolvedNodeData);
        const executeNextNodes = async (portName, newTryCatchStack, callingNodeId = node.id) => {
            const nextConnections = this.connections.filter(c => c.from === callingNodeId && c.fromPort === portName);
            for (const conn of nextConnections) {
                await this._animateConnection(conn);
                const nextNode = this.nodes.find(n => n.id === conn.to);
                if (nextNode) await this._executeNode(nextNode, newTryCatchStack);
            }
        };
        if (node.type === 'try_catch') {
            this.logger.info(`Bắt đầu khối Try/Catch: ${node.data.title}`);
            this._setNodeState(node, 'success');
            this.executionState[node.id] = { status: 'try_path_taken' };
            this._updateVariablesPanel();
            this.dispatchEvent(new CustomEvent('simulation:node:end', { detail: { node, result: this.executionState[node.id] } }));
            await executeNextNodes('try', [...tryCatchStack, node]);
            return;
        }
        try {
            if (node.type === 'loop') {
                const items = await nodeConfig.execute(resolvedNodeData, this.logger, this);
                const loopConnection = this.connections.find(c => c.from === node.id && c.fromPort === 'loop');
                if (loopConnection) {
                    const loopBodyStartNode = this.nodes.find(n => n.id === loopConnection.to);
                    if (loopBodyStartNode) {
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            this.logger.info(`Vòng lặp ${i + 1}/${items.length}: item = ${JSON.stringify(item)}`);
                            this.executionState[node.id] = { currentItem: item, currentIndex: i, totalItems: items.length, _status: 'running' };
                            this._updateVariablesPanel();
                            await this._animateConnection(loopConnection);
                            await this._executeNode(loopBodyStartNode, [...tryCatchStack]); 
                        }
                    }
                }
                this.logger.success(`Vòng lặp hoàn thành.`);
                this.executionState[node.id] = { allItems: items, count: items.length };
                this._setNodeState(node, 'success');
                this.dispatchEvent(new CustomEvent('simulation:node:end', { detail: { node, result: this.executionState[node.id] } }));
                await executeNextNodes('done', tryCatchStack);
                return;
            }
            const result = await nodeConfig.execute(resolvedNodeData, this.logger, this);
            if (result?.hasOwnProperty('selectedPort')) {
                this.executionState[node.id] = result.data;
                this._setNodeState(node, 'success');
                this.dispatchEvent(new CustomEvent('simulation:node:end', { detail: { node, result: result.data } }));
                await executeNextNodes(result.selectedPort, tryCatchStack);
            } else {
                this.executionState[node.id] = result;
                this._setNodeState(node, 'success');
                this.dispatchEvent(new CustomEvent('simulation:node:end', { detail: { node, result } }));
                await executeNextNodes((nodeConfig.outputs || ['success'])[0], tryCatchStack);
            }
        } catch (error) {
            const errorResult = { error: error.message, ...error.context };
            this.logger.error(`Lỗi thực thi khối ${node.data.title}: ${error.message}`);
            this.executionState[node.id] = errorResult;
            this._setNodeState(node, 'error');
            this.dispatchEvent(new CustomEvent('simulation:node:end', { detail: { node, error: errorResult } }));
            this._updateVariablesPanel();
            const lastTryCatchNode = tryCatchStack.pop();
            if (lastTryCatchNode) {
                this.logger.info(`Đã bắt được lỗi bởi khối Try/Catch: ${lastTryCatchNode.data.title}. Chuyển hướng tới cổng 'catch'.`);
                this.executionState.error = { message: error.message, sourceNode: node.id, context: error.context };
                this._setNodeState(lastTryCatchNode, 'error');
                this._updateVariablesPanel();
                await executeNextNodes('catch', tryCatchStack, lastTryCatchNode.id);
            } else {
                await executeNextNodes('error', tryCatchStack);
            }
        } finally {
            if (node.type !== 'loop') this._updateVariablesPanel();
        }
    }

    _setNodeState(node, state) {
        node.element.classList.remove('running', 'success', 'error');
        if (state !== 'idle') node.element.classList.add(state);
    }

    _clearCanvas(commit = true) {
        this.dom.connectorSvg.innerHTML = '';
        this.nodes.forEach(node => node.element.remove());
        this.nodes = []; this.connections = []; this.nodeTypeCounts = {}; this._clearSelection();
        if (this.formBuilder) { this.formBuilder.clearCanvas(false); }
        if (commit) this._commitState("Xóa canvas");
        this.dispatchEvent(new CustomEvent('workflow:cleared'));
    }

    _exportWorkflow() {
        try {
            const workflowData = this._getCurrentState();
            const jsonString = JSON.stringify(workflowData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'workflow.json';
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (err) { this.logger.error("Xuất file JSON thất bại.", err); }
    }

    _handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try { this._importWorkflow(event.target.result); }
            catch (err) { this.logger.error("Nhập file JSON thất bại. File có thể bị lỗi hoặc không đúng định dạng.", err); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    _importWorkflow(jsonString, commit = true) {
        try {
            const data = JSON.parse(jsonString);
            if (!data.nodes || !data.connections) throw new Error('File JSON không chứa các trường "nodes" và "connections" bắt buộc.');
            this._loadState(data);
            if (commit) { this.history = []; this.historyIndex = -1; this._commitState("Import file"); }
            this._resetView();
        } catch (error) { this.logger.error(`Lỗi khi nhập workflow: ${error.message}`); }
    }

    _handleVariableContextMenu(e) {
        e.preventDefault(); e.stopPropagation(); this._hideAllContextMenus();
        const { key, value, path } = e.currentTarget.dataset;
        if (!key && !path) return;
        this.activeVariableContext = { key, value, path };
        const menu = this.dom.variableContextMenu;
        Object.assign(menu.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px` });
    }
    
    async _handleVariableContextMenuClick(e) {
        const item = e.target.closest('.context-menu-item');
        if (!item || !this.activeVariableContext) return;
        const action = item.dataset.action;
        if (!action) return;
        const { key, value, path } = this.activeVariableContext;
        let textToCopy = '';
        switch (action) {
            case 'copy-value':
                try {
                    const parsed = JSON.parse(value);
                    textToCopy = (typeof parsed === 'object' && parsed !== null) ? JSON.stringify(parsed, null, 2) : String(parsed);
                } catch { textToCopy = value; }
                break;
            case 'copy-key': textToCopy = key; break;
            case 'copy-path': textToCopy = `{{${path}}}`; break;
        }
        if (textToCopy) await this._copyToClipboard(textToCopy);
        this._hideAllContextMenus(); this.activeVariableContext = null;
    }

    async _copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.logger.system(`Đã sao chép: ${text.substring(0, 50)}...`);
        } catch (err) { this.logger.error('Không thể sao chép vào clipboard.', err); }
    }
    
    _handleProcessCurlImport() {
        const curlString = document.getElementById('curl-input-textarea').value;
        if (!curlString || this.selectedNodes.length !== 1) return;
        const node = this.selectedNodes[0];
        if (node.type !== 'http_request') return;
        try {
            const parsedData = this._parseCurlCommand(curlString);
            this.updateNodeData(node.id, {
                url: parsedData.url, method: parsedData.method, headers: parsedData.headers,
                body: { 
                    type: parsedData.body.type,
                    json: parsedData.body.type === 'json' ? parsedData.body.content : '',
                    formUrlEncoded: parsedData.body.type === 'form-urlencoded' ? parsedData.body.content : []
                }
            });
            this.logger.success("Lệnh cURL đã được import thành công.");
            this._commitState("Import from cURL");
            this.curlImportModal.hide();
        } catch (error) { this.logger.error(`Không thể phân tích lệnh cURL: ${error.message}`); }
    }

    _parseCurlCommand(curlString) {
        const result = { url: '', method: 'GET', headers: [], body: { type: 'none', content: null } };
        let singleLineCurl = curlString.replace(/(\r\n|\n|\r|\\| \^)/g, ' ').trim();
        const args = [];
        const regex = /'[^']*'|"[^"]*"|\S+/g;
        let match;
        while(match = regex.exec(singleLineCurl)) { args.push(match[0]); }
        let i = 0;
        while (i < args.length) {
            const arg = args[i]; const nextArg = args[i+1];
            const cleanNextArg = () => nextArg ? nextArg.replace(/^['"]|['"]$/g, '') : '';
            if (arg === 'curl' || arg.startsWith('http')) {
                if (!result.url) result.url = arg.replace(/^['"]|['"]$/g, '');
                i++; continue;
            }
            if (!arg.startsWith('-')) { i++; continue; }
            switch(arg) {
                case '-H': case '--header':
                    const [key, ...valueParts] = cleanNextArg().split(':');
                    if (key && valueParts.length > 0) result.headers.push({ key: key.trim(), value: valueParts.join(':').trim() });
                    i += 2; break;
                case '-X': case '--request': result.method = cleanNextArg().toUpperCase(); i += 2; break;
                case '-d': case '--data': case '--data-raw': case '--data-binary':
                    const bodyContent = cleanNextArg();
                    try {
                        JSON.parse(bodyContent);
                        result.body = { type: 'json', content: bodyContent };
                    } catch(e) {
                        result.body = { type: 'form-urlencoded', content: Array.from(new URLSearchParams(bodyContent)).map(([k, v]) => ({ key: k, value: v })) };
                    }
                    i += 2; break;
                case '-b': case '--cookie':
                    const cookieValue = cleanNextArg();
                    const cookieHeader = result.headers.find(h => h.key.toLowerCase() === 'cookie');
                    if (cookieHeader) cookieHeader.value += '; ' + cookieValue;
                    else result.headers.push({ key: 'Cookie', value: cookieValue });
                    i += 2; break;
                default: if (nextArg && !nextArg.startsWith('-')) i += 2; else i++; break;
            }
        }
        if (result.method === 'GET' && result.body.type !== 'none') result.method = 'POST';
        if (!result.url) throw new Error("Không thể tìm thấy URL hợp lệ.");
        return result;
    }
}