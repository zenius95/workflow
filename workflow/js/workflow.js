/** * Main class for the Workflow Builder application. 
 */
class WorkflowBuilder {
    constructor(containerId, config, initialWorkflow = null, initialGlobalVariables = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with id "${containerId}" not found.`);
            return;
        }
        this.config = config;
        this.initialWorkflow = initialWorkflow;
        this.initialGlobalVariables = JSON.parse(JSON.stringify(initialGlobalVariables)); // Store initial state
        this.globalVariables = JSON.parse(JSON.stringify(initialGlobalVariables));
        this.executionState = {}; // Stores outputs of nodes during simulation
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
        this.activeVariableContext = null; // For the variable context menu
        this.treeViewStates = new Map(); // To preserve open/close state
        this.selectionBox = { active: false, element: null, startX: 0, startY: 0 };
        
        this.history = [];
        this.historyIndex = -1;
        
        this.curlImportModal = null;
        this.templates = this._getDefaultTemplates();

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
        this._populatePalette();
        this._setupEventListeners();
        this._updateVariablesPanel();
        
        const modalElement = document.getElementById('curl-import-modal');
        if (modalElement) {
            this.curlImportModal = new bootstrap.Modal(modalElement);
            document.getElementById('process-curl-import-btn').addEventListener('click', () => this._handleProcessCurlImport());
        }

        if (this.initialWorkflow) {
            setTimeout(() => this._importWorkflow(JSON.stringify(this.initialWorkflow), false), 0);
        } else {
            // Start with a clean slate
            this._commitState("Initial State");
        }
        
        this._applyTransform();
        this._hideSettingsPanel();
        this.logger.system("Workflow Builder initialized.");
    }

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
                
                const iconSpan = document.createElement('span');
                iconSpan.className = 'text-secondary';
                iconSpan.innerHTML = nodeConfig.icon;
                nodeEl.appendChild(iconSpan);

                const textSpan = document.createElement('span');
                textSpan.textContent = nodeConfig.displayName;
                nodeEl.appendChild(textSpan);

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
            const canvasRect = this.dom.canvasContainer.getBoundingClientRect();
            const nodeWidth = firstNode.element.offsetWidth;
            const nodeHeight = firstNode.element.offsetHeight;

            this.panState.translateX = (canvasRect.width / 2) - firstNode.x - (nodeWidth / 2);
            this.panState.translateY = (canvasRect.height / 2) - firstNode.y - (nodeHeight / 2);
        } else {
            this.panState.translateX = 50;
            this.panState.translateY = 50;
        }

        this._applyTransform();
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
                    // Start selection box
                    this.selectionBox.active = true;
                    const rect = this.dom.canvasContainer.getBoundingClientRect();
                    this.selectionBox.startX = e.clientX - rect.left;
                    this.selectionBox.startY = e.clientY - rect.top;
                    this.selectionBox.element = document.createElement('div');
                    this.selectionBox.element.className = 'selection-box';
                    this.dom.canvasContainer.appendChild(this.selectionBox.element);
                } else {
                    // Start panning
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
            const canvasRect = this.dom.canvasContainer.getBoundingClientRect();
            this.activeDrag.draggedNodes.forEach(dragged => {
                const { node, startX, startY, mouseOffsetX, mouseOffsetY } = dragged;
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
            this.selectionBox.element.style.left = `${x}px`;
            this.selectionBox.element.style.top = `${y}px`;
            this.selectionBox.element.style.width = `${width}px`;
            this.selectionBox.element.style.height = `${height}px`;
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
        const activeEl = document.activeElement;
        if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') return;

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
            e.preventDefault(); this._redo(); return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault(); this._undo(); return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            e.preventDefault(); this._copySelectedNodes(); return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            e.preventDefault(); this._pasteSelectedNodes(); return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            this._deleteSelectedItems();
        }
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
        this._showSettingsPanel(); // *** MỚI: Tự động mở setting ***
        this._commitState("Tạo khối");
    }

    _handlePaletteSearch() {
        const searchTerm = this.dom.paletteSearch.value.toLowerCase().trim();
        const categories = this.dom.paletteContent.querySelectorAll('.palette-category');
        categories.forEach(category => {
            let hasVisibleNode = false;
            const nodes = category.querySelectorAll('.palette-node');
            nodes.forEach(node => {
                const nodeDisplayName = node.textContent.toLowerCase();
                if (nodeDisplayName.includes(searchTerm)) {
                    node.style.display = 'flex';
                    hasVisibleNode = true;
                } else {
                    node.style.display = 'none';
                }
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

        const outputNames = nodeConfig.outputs || ['success']; // Default to 'success' if not specified
        const totalOutputs = outputNames.length;
        outputNames.forEach((portName, index) => {
            const outPort = document.createElement('div');
            outPort.className = 'port out';
            outPort.dataset.portType = 'out';
            outPort.dataset.portName = portName;
            
            const topPercentage = (index + 1) * (100 / (totalOutputs + 1));
            outPort.style.top = `${topPercentage}%`;
            outPort.style.transform = 'translateY(-50%)';

            if (totalOutputs > 1) {
                const label = document.createElement('span');
                label.className = 'port-label';
                label.textContent = portName;
                outPort.appendChild(label);
            }
            nodeElement.appendChild(outPort);
        });

        this.dom.workflowCanvas.appendChild(nodeElement);
        const node = { id: nodeId, type, x: position.x, y: position.y, element: nodeElement, data: nodeData };
        
        this.nodes.push(node);
        this._addNodeEventListeners(node);
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
                e.stopPropagation(); // Prevent opening settings panel when editing title
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
                this._setProperty(node.data, 'title', newTitle);
                titleEl.textContent = newTitle;
                this._commitState("Sửa tiêu đề");
            }
            input.remove();
            titleEl.style.display = '';
        };

        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finishEditing();
            if (e.key === 'Escape') {
                input.value = node.data.title; // Revert
                finishEditing();
            }
        });
    }
    
    _handleNodeMouseDown(e, node) {
        e.stopPropagation();
        if (e.button === 2) return;
        
        // *** MỚI: Logic xử lý chuyển đổi setting panel ***
        const settingsWereVisible = !this.dom.settingsPanel.classList.contains('hidden');
        const isAlreadySelected = this.selectedNodes.includes(node) && this.selectedNodes.length === 1;

        if (isAlreadySelected) {
            // If the node is already selected and settings are open, do nothing special yet,
            // but still prepare for dragging.
        } else {
             const isCtrlPressed = e.ctrlKey || e.metaKey;
             const isSelected = this.selectedNodes.includes(node);

             if (!isCtrlPressed && !isSelected) {
                 this._clearSelection();
                 this._addNodeToSelection(node);
             } else if (isCtrlPressed && !isSelected) {
                 this._addNodeToSelection(node);
             } else if (isCtrlPressed && isSelected) {
                 this._removeNodeFromSelection(node);
             }
             
             this._updateSettingsPanel();

             // If settings were open before, and we now have a single new node selected, show its settings.
             if (settingsWereVisible && this.selectedNodes.length === 1) {
                 this._showSettingsPanel();
             }
        }
        // *** KẾT THÚC THAY ĐỔI ***
        
        if (e.target.closest('.port, .node-settings-btn') || e.target.tagName === 'INPUT') return;

        this.activeDrag.isDraggingNode = true;
        this.activeDrag.startMouseX = e.clientX;
        this.activeDrag.startMouseY = e.clientY;
        this.activeDrag.draggedNodes = this.selectedNodes.map(n => ({
            node: n,
            startX: n.x,
            startY: n.y
        }));
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
        this.selectedNodes.forEach(node => {
            const connectionsToRemove = this.connections.filter(c => c.from === node.id || c.to === node.id);
            connectionsToRemove.forEach(c => this._deleteConnection(c, false));
            node.element.remove();
            this.nodes = this.nodes.filter(n => n.id !== node.id);
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
        if (commit) this._commitState("Xóa kết nối");
    }

    _copySelectedNodes() {
        if (this.selectedNodes.length === 0) return;
        this.clipboard = {
            type: 'nodes',
            nodes: this.selectedNodes.map(node => ({
                type: node.type,
                data: JSON.parse(JSON.stringify(node.data)),
                x: node.x,
                y: node.y
            }))
        };
        const minX = Math.min(...this.clipboard.nodes.map(n => n.x));
        const minY = Math.min(...this.clipboard.nodes.map(n => n.y));
        this.clipboard.nodes.forEach(n => {
            n.relX = n.x - minX;
            n.relY = n.y - minY;
        });
        this.logger.system("Copied nodes:", this.clipboard.nodes.length);
    }

    _pasteSelectedNodes() {
        if (!this.clipboard || this.clipboard.type !== 'nodes') return;
        this._clearSelection();
        const rect = this.dom.canvasContainer.getBoundingClientRect();
        const pasteX = (this.lastMousePosition.x - rect.left - this.panState.translateX) / this.panState.scale;
        const pasteY = (this.lastMousePosition.y - rect.top - this.panState.translateY) / this.panState.scale;

        const newNodes = [];
        this.clipboard.nodes.forEach(nodeInfo => {
            const newNode = this._createNode(
                nodeInfo.type, 
                { x: pasteX + nodeInfo.relX, y: pasteY + nodeInfo.relY },
                nodeInfo.data
            );
            newNodes.push(newNode);
        });
        
        newNodes.forEach(node => this._addNodeToSelection(node));
        
        // *** MỚI: Tự động mở setting nếu chỉ paste 1 node ***
        if (newNodes.length === 1) {
            this._showSettingsPanel();
        }
        
        this._commitState("Dán khối");
    }
    
    _clearSelection() {
        this.selectedNodes.forEach(node => node.element.classList.remove('selected'));
        this.selectedNodes = [];
        this._deselectAllConnections();
        this._updateSettingsPanel();
    }

    _addNodeToSelection(node) {
        if (!this.selectedNodes.includes(node)) {
            this.selectedNodes.push(node);
            node.element.classList.add('selected');
            this._updateSettingsPanel();
        }
    }

    _removeNodeFromSelection(node) {
        const index = this.selectedNodes.indexOf(node);
        if (index > -1) {
            this.selectedNodes.splice(index, 1);
            node.element.classList.remove('selected');
            this._updateSettingsPanel();
        }
    }
    
    _selectConnection(connToSelect) {
        this._clearSelection();
        this.selectedConnection = connToSelect;
        this.selectedConnection.line.classList.add('selected');
    }

    _deselectAllConnections() {
        if (this.selectedConnection) {
            this.selectedConnection.line.classList.remove('selected');
            this.selectedConnection = null;
        }
    }

    _showSettingsPanel() { this.dom.settingsPanel.classList.remove('hidden'); }
    _hideSettingsPanel() { this.dom.settingsPanel.classList.add('hidden'); }

    _getProperty(obj, path) {
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
        const panelHTML = panelTemplate
            .replace(/{{id}}/g, node.id)
            .replace('{{title}}', titleValue);
        content.innerHTML = panelHTML;

        const titleInput = content.querySelector('#settings-title-input');
        if(titleInput) titleInput.value = titleValue;

        const fieldsContainer = content.querySelector('[data-ref="fields-container"]');
        if (fieldsContainer && nodeConfig.settings) {
            const formElements = this.settingsRenderer.render(nodeConfig.settings, node.id, node.data);
            fieldsContainer.appendChild(formElements);
        }

        this._bindSettingsPanelListeners(content, node, nodeConfig);

        if (activeTabId) {
            const newTabButton = content.querySelector(`[data-bs-target="${activeTabId}"]`);
            if (newTabButton) {
                const tab = new bootstrap.Tab(newTabButton);
                tab.show();
            }
        }
    }

    _bindSettingsPanelListeners(container, node, nodeConfig) {
        container.querySelectorAll('[data-field]').forEach(input => {
            const fieldName = input.dataset.field;
            
            input.addEventListener('input', (e) => {
                const newValue = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                this._setProperty(node.data, fieldName, newValue);
                
                if (fieldName === 'title') {
                    const titleEl = node.element.querySelector('.node-title');
                    if (titleEl) titleEl.textContent = newValue;
                }
                
                const controlConfig = this.settingsRenderer._findControlConfig(nodeConfig.settings, fieldName);
                if (controlConfig && controlConfig.onChange === 'rerender') {
                    this._updateSettingsPanel();
                }
                this._commitState("Sửa cài đặt");
            });
        });

        container.querySelector('[data-action="close-settings"]')?.addEventListener('click', () => this._hideSettingsPanel());
        
        container.querySelectorAll('.variable-picker-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetInputId = e.currentTarget.dataset.targetInput;
                const targetInput = document.getElementById(targetInputId);
                this._showVariablePicker(targetInput, e.currentTarget);
            });
        });

        container.querySelectorAll('[data-action="select-file"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetInputId = e.currentTarget.dataset.targetInput;
                const targetInput = document.getElementById(targetInputId);
                this.settingsRenderer.handleFileSelect(targetInput);
            });
        });
        container.querySelectorAll('[data-action="select-folder"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetInputId = e.currentTarget.dataset.targetInput;
                const targetInput = document.getElementById(targetInputId);
                this.settingsRenderer.handleFolderSelect(targetInput);
            });
        });

        container.querySelectorAll('[data-action="add-condition-group"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                e.preventDefault();
                const conditionGroups = this._getProperty(this.selectedNodes[0].data, 'conditionGroups');
                conditionGroups.push([{ inputValue: '', operator: '==', comparisonValue: '' }]);
                this._updateSettingsPanel();
                this._commitState("Thêm nhóm điều kiện");
            });
        });

        container.querySelectorAll('[data-action="test-operation"]').forEach(btn => {
            btn.addEventListener('click', () => this._handleTestOperationClick());
        });

        container.querySelectorAll('[data-action="test-data-generation"]').forEach(btn => {
            btn.addEventListener('click', () => this._handleTestDataGenerationClick());
        });
        
        container.querySelectorAll('[data-action="import-curl"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.curlImportModal) {
                    document.getElementById('curl-input-textarea').value = ''; // Clear previous input
                    this.curlImportModal.show();
                }
            });
        });
    }

    async _handleTestOperationClick() {
        const node = this.selectedNodes[0];
        const outputContainer = this.dom.settingsPanel.querySelector('[data-ref="test-output-container"]');
        if (!node || !outputContainer) return;

        try {
            const resolvedData = JSON.parse(JSON.stringify(node.data));
            const executionContext = { global: this.globalVariables, ...this.executionState };
            
            const resolveRecursively = (obj) => {
                for (const key in obj) {
                    if (typeof obj[key] === 'string') obj[key] = this._resolveVariables(obj[key], executionContext);
                    else if (typeof obj[key] === 'object' && obj[key] !== null) resolveRecursively(obj[key]);
                }
            };
            resolveRecursively(resolvedData);

            const { input, operation, params } = resolvedData;
            
            if (!operation) throw new Error("Chưa chọn thao tác.");
            const [operationType, operationKey] = operation.split('.');
            const opConfig = DATA_OPERATIONS[operationType]?.[operationKey];
            if (!opConfig?.execute) throw new Error(`Thao tác không hợp lệ: ${operation}`);

            let processedInput = input;
            if (operationType !== 'json' && typeof input === 'string') {
                try { processedInput = JSON.parse(input); } catch (e) { /* It's just a string */ }
            }

            const result = opConfig.execute(processedInput, params);
            
            outputContainer.classList.remove('text-danger');
            outputContainer.classList.add('text-success');
            if (typeof result === 'object') {
                outputContainer.textContent = JSON.stringify(result, null, 2);
            } else {
                outputContainer.textContent = result;
            }

        } catch (error) {
            outputContainer.classList.remove('text-success');
            outputContainer.classList.add('text-danger');
            outputContainer.textContent = `Lỗi: ${error.message}`;
        }
    }

    async _handleTestDataGenerationClick() {
        const node = this.selectedNodes[0];
        const settingsPanel = this.dom.settingsPanel;
        const outputContainer = settingsPanel.querySelector('[data-ref="test-output-container"]');
        const testBtn = settingsPanel.querySelector('[data-action="test-data-generation"]');
        if (!node || !outputContainer || !testBtn) return;

        const originalBtnContent = testBtn.innerHTML;
        testBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Đang test...';
        testBtn.disabled = true;

        try {
            const nodeConfig = this._findNodeConfig(node.type);
            const result = await nodeConfig.execute(node.data, null, this);

            outputContainer.classList.remove('text-danger');
            outputContainer.classList.add('text-success');
            if (typeof result.result === 'object') {
                outputContainer.textContent = JSON.stringify(result.result, null, 2);
            } else {
                outputContainer.textContent = result.result;
            }
        } catch (error) {
            outputContainer.classList.remove('text-success');
            outputContainer.classList.add('text-danger');
            outputContainer.textContent = `Lỗi: ${error.message}`;
        } finally {
            testBtn.innerHTML = originalBtnContent;
            testBtn.disabled = false;
        }
    }

    _handleInputPortMouseDown(e, endNode, endPort) {
        e.stopPropagation();
        const connToDetach = this.connections.find(c => c.to === endNode.id);
        if (!connToDetach) return;

        const startNode = this.nodes.find(n => n.id === connToDetach.from);
        if (!startNode) return;

        this.connections = this.connections.filter(c => c.id !== connToDetach.id);
        
        this._commitState("Bắt đầu gỡ kết nối");

        connToDetach.line.classList.remove('selected');
        connToDetach.line.classList.add('connector-line-drawing');
        
        this.connectionState = {
            isDrawing: true,
            startNode: startNode,
            startPortName: connToDetach.fromPort,
            line: connToDetach.line,
        };
    }

    _handlePortMouseDown(e, node, port) {
        e.stopPropagation();
        if (port.dataset.portType === 'out') {
            this.connectionState = { isDrawing: true, startNode: node, startPortName: port.dataset.portName };
            this.connectionState.line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this.connectionState.line.setAttribute('class', 'connector-line-drawing');
            this.connectionState.line.setAttribute('stroke-linejoin', 'round');
            this.connectionState.line.setAttribute('stroke-linecap', 'round');
            this.dom.connectorSvg.appendChild(this.connectionState.line);
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
        
        const connection = { 
            id: `conn-${startNode.id}:${startPortName}-${endNode.id}`, 
            from: startNode.id, 
            fromPort: startPortName,
            to: endNode.id, 
            line 
        };
        
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            this._selectConnection(connection);
        });

        this.dom.connectorSvg.appendChild(line);
        this.connections.push(connection);
        this._updateConnectionPath(connection);
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
        const baseRadius = 20; // A consistent base radius for all corners

        if (dx < -sCurveThreshold) {
            // --- LOGIC for backward connections with rounded corners ---
            const offset = 40; // How far the line goes out horizontally
            const midY = y1 + dy / 2;
            const ySign = dy >= 0 ? 1 : -1;
            
            // Calculate radius based on available space in the S-shape segments
            // It's limited by half the horizontal offset and a quarter of the vertical distance
            const radius = Math.min(baseRadius, offset / 2, Math.abs(dy) / 4);

            const d = [
                `M ${x1} ${y1}`,
                // 1. Line out from the start node
                `L ${x1 + offset - radius} ${y1}`,
                // 2. Top-right corner
                `Q ${x1 + offset} ${y1} ${x1 + offset} ${y1 + radius * ySign}`,
                // 3. Vertical line towards the middle
                `L ${x1 + offset} ${midY - radius * ySign}`,
                // 4. Middle-right corner (turning left)
                `Q ${x1 + offset} ${midY} ${x1 + offset - radius} ${midY}`,
                // 5. Horizontal line going backwards
                `L ${x2 - offset + radius} ${midY}`,
                // 6. Middle-left corner (turning down/up)
                `Q ${x2 - offset} ${midY} ${x2 - offset} ${midY + radius * ySign}`,
                // 7. Vertical line to the end-node's y-level
                `L ${x2 - offset} ${y2 - radius * ySign}`,
                // 8. Bottom-left corner
                `Q ${x2 - offset} ${y2} ${x2 - offset + radius} ${y2}`,
                // 9. Final line into the end node
                `L ${x2} ${y2}`
            ].join(' ');

            path.setAttribute('d', d);
            return;
        }

        // --- LOGIC FOR FORWARD-FACING, ROUNDED-CORNER CONNECTORS ---
        const effectiveRadius = Math.min(baseRadius, Math.abs(dx) / 2, Math.abs(dy) / 2);
        const midX = x1 + dx / 2;
        const xSign = dx >= 0 ? 1 : -1;
        const ySign = dy >= 0 ? 1 : -1;

        // If there's not enough space for a curve, draw a simple right-angle line.
        if (effectiveRadius < 5) { 
            path.setAttribute('d', `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
            return;
        }
        
        const d = [
            `M ${x1} ${y1}`,
            `L ${midX - effectiveRadius * xSign} ${y1}`,
            `Q ${midX} ${y1} ${midX} ${y1 + effectiveRadius * ySign}`,
            `L ${midX} ${y2 - effectiveRadius * ySign}`,
            `Q ${midX} ${y2} ${midX + effectiveRadius * xSign} ${y2}`,
            `L ${x2} ${y2}`
        ].join(' ');
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
            
            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
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
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
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
            case 'delete': 
                this._deleteSelectedItems();
                break;
            case 'copy': this._copySelectedNodes(); break;
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
        this._updateHistoryButtons();
    }

    _getCurrentState() {
        return {
            nodes: this.nodes.map(n => ({ 
                id: n.id, 
                type: n.type, 
                x: n.x, 
                y: n.y, 
                data: JSON.parse(JSON.stringify(n.data)) 
            })),
            connections: this.connections.map(c => ({ from: c.from, fromPort: c.fromPort, to: c.to }))
        };
    }
    
    _loadState(state) {
        this._clearCanvas(false);
        const idMap = new Map();

        this.nodeTypeCounts = {};

        state.nodes.forEach(nodeInfo => {
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

        state.connections.forEach(connInfo => {
            const startNode = idMap.get(connInfo.from);
            const endNode = idMap.get(connInfo.to);
            if (startNode && endNode) {
                const fromPort = connInfo.fromPort || 'out';
                this._createConnection(startNode, fromPort, endNode);
            }
        });
        this._clearSelection();
    }

    _undo() {
        if (this.historyIndex <= 0) return;
        this.historyIndex--;
        const stateToLoad = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        this._loadState(stateToLoad);
        this._updateHistoryButtons();
    }

    _redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.historyIndex++;
        const stateToLoad = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        this._loadState(stateToLoad);
        this._updateHistoryButtons();
    }

    _updateHistoryButtons() {
        const undoBtn = this.container.querySelector('[data-action="undo"]');
        const redoBtn = this.container.querySelector('[data-action="redo"]');
        const undoMenuItem = this.dom.canvasContextMenu.querySelector('[data-action="undo"]');
        const redoMenuItem = this.dom.canvasContextMenu.querySelector('[data-action="redo"]');

        const canUndo = this.historyIndex > 0;
        const canRedo = this.historyIndex < this.history.length - 1;

        undoBtn.disabled = !canUndo;
        redoBtn.disabled = !canRedo;
        
        if(undoMenuItem) undoMenuItem.classList.toggle('disabled', !canUndo);
        if(redoMenuItem) redoMenuItem.classList.toggle('disabled', !canRedo);
    }

    _handleAddGlobalVariable(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const key = formData.get('key').trim();
        let value = formData.get('value').trim();

        if (!key) return;

        try { value = JSON.parse(value); } catch (error) { /* It's just a string */ }

        this.globalVariables[key] = value;
        this._updateVariablesPanel();
        e.target.reset();
    }
    
    _updateVariablesPanel() {
        if (this.dom.variablesPanel) {
            this.dom.variablesPanel.querySelectorAll('details').forEach(d => {
                this.treeViewStates.set(d.id, d.open);
            });
        }

        this.dom.globalVariablesContainer.innerHTML = '';
        this.dom.globalVariablesContainer.appendChild(this._createTreeView(this.globalVariables, 'global'));

        this.dom.nodeOutputsContainer.innerHTML = '';
        this.dom.nodeOutputsContainer.appendChild(this._createNodeOutputsTreeView(this.executionState));
    }

    _createNodeOutputsTreeView(executionState) {
        if (executionState === null || typeof executionState !== 'object' || Object.keys(executionState).length === 0) {
            const emptyEl = document.createElement('span');
            emptyEl.className = 'text-muted fst-italic';
            emptyEl.textContent = 'Chưa có đầu ra nào';
            return emptyEl;
        }

        const root = document.createElement('div');
        for (const nodeId in executionState) {
            const node = this.nodes.find(n => n.id === nodeId);
            if (!node) continue;

            const nodeConfig = this._findNodeConfig(node.type);
            const nodeOutputData = executionState[nodeId];
            const isRunning = nodeOutputData && nodeOutputData._status === 'running';

            const details = document.createElement('details');
            details.id = `tree-details-${nodeId}`;
            if (this.treeViewStates.has(details.id)) {
                details.open = this.treeViewStates.get(details.id);
            } else if (!isRunning) { // Default to open if not running and no state saved
                details.open = true;
            }

            const summary = document.createElement('summary');
            summary.className = 'd-flex align-items-center gap-2 p-1 rounded';
            summary.dataset.key = nodeId;
            summary.dataset.value = JSON.stringify(nodeOutputData);
            summary.dataset.path = nodeId;
            summary.addEventListener('contextmenu', (e) => this._handleVariableContextMenu(e));
            
            const isErrorObject = !isRunning && nodeOutputData && typeof nodeOutputData === 'object' && nodeOutputData.hasOwnProperty('error');
            
            const togglerSpan = document.createElement('span');
            togglerSpan.className = 'w-4 h-4 d-flex align-items-center justify-content-center flex-shrink-0 me-2';
            
            if (isRunning) {
                togglerSpan.innerHTML = `<svg class="spinner" style="width: 1em; height: 1em;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>`;
            } else {
                togglerSpan.classList.add('tree-toggler');
            }

            const nodeIconSpan = document.createElement('span');
            nodeIconSpan.className = `flex-shrink-0 ${isErrorObject ? 'text-danger' : 'text-secondary'}`;
            nodeIconSpan.innerHTML = nodeConfig.icon;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'fw-semibold text-dark text-truncate';
            titleSpan.textContent = node.data.title;

            const idSpan = document.createElement('span');
            idSpan.className = 'small text-muted font-monospace ms-auto';
            idSpan.textContent = node.id;

            summary.appendChild(togglerSpan);
            summary.appendChild(nodeIconSpan);
            summary.appendChild(titleSpan);
            summary.appendChild(idSpan);
            
            details.appendChild(summary);

            if (isRunning) {
                const runningText = document.createElement('div');
                runningText.className = 'ps-5 text-muted fst-italic';
                runningText.textContent = 'Đang chạy...';
                details.appendChild(runningText);
            } else {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'ps-4';
                contentDiv.appendChild(this._createTreeView(nodeOutputData, nodeId));
                details.appendChild(contentDiv);
            }

            root.appendChild(details);
        }
        return root;
    }

    _createTreeView(obj, parentPath = '') {
        if (obj === null || typeof obj !== 'object' || Object.keys(obj).length === 0) {
            const emptyEl = document.createElement('span');
            emptyEl.className = 'text-muted fst-italic ps-3';
            emptyEl.textContent = 'Không có dữ liệu';
            return emptyEl;
        }

        const root = document.createElement('div');
        
        for (const key in obj) {
            if (key === '_status') continue; // Hide internal status key
            
            const currentPath = parentPath ? `${parentPath}.${key}` : key;
            const detailsId = `tree-details-${currentPath.replace(/\./g, '-')}`;
            const value = obj[key];

            if (typeof value === 'object' && value !== null) {
                const details = document.createElement('details');
                details.id = detailsId;
                details.style.paddingLeft = '1.5em';
                if (this.treeViewStates.has(detailsId)) {
                    details.open = this.treeViewStates.get(detailsId);
                }

                const summary = document.createElement('summary');
                const isErrorObject = value.hasOwnProperty('error');
                summary.innerHTML = `<span class="tree-toggler me-2"></span><span class="tree-key">${key}</span>: ${isErrorObject ? `<span class="tree-value-error">Error</span>` : Array.isArray(value) ? `Array(${value.length})` : 'Object'}`;
                
                summary.dataset.key = key;
                summary.dataset.value = JSON.stringify(value);
                summary.dataset.path = currentPath;
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
                
                p.dataset.key = key;
                p.dataset.value = JSON.stringify(value);
                p.dataset.path = currentPath;
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
                details.appendChild(summary);
                details.appendChild(this._createPickerTreeView(value, path));
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

        const globalsHeader = document.createElement('h6');
        globalsHeader.className = "small text-uppercase text-muted fw-bold p-1";
        globalsHeader.textContent = 'Biến Toàn Cục';
        popup.appendChild(globalsHeader);
        popup.appendChild(this._createPickerTreeView(this.globalVariables, 'global'));

        const nodesHeader = document.createElement('h6');
        nodesHeader.className = "small text-uppercase text-muted fw-bold p-1 mt-2";
        nodesHeader.textContent = 'Đầu ra các Khối';
        popup.appendChild(nodesHeader);
        popup.appendChild(this._createPickerTreeView(this.executionState, ''));
        
        const btnRect = button.getBoundingClientRect();
        popup.style.display = 'block';
        const popupRect = popup.getBoundingClientRect();

        let top = btnRect.bottom + 4;
        if (top + popupRect.height > window.innerHeight) top = btnRect.top - popupRect.height - 4;
        let left = btnRect.left;
        if (left + popupRect.width > window.innerWidth) left = btnRect.right - popupRect.width;

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
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

        // First, resolve the entire string if it's ONLY a variable
        const singleVarMatch = text.match(/{{\s*([^}]+)\s*}}/);
        if (singleVarMatch && singleVarMatch[0] === text) {
            const value = this._getProperty(context, singleVarMatch[1].trim());
            return value === undefined ? text : value;
        }

        // Otherwise, replace all occurrences of variables in the string
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
        const runButton = this.container.querySelector('[data-action="run-simulation"]');
        runButton.disabled = true;
        runButton.classList.add('opacity-50');

        this.logger.clear();
        this.logger.system('--- Bắt đầu Mô phỏng ---');
        
        // Reset states
        this.executionState = {};
        this.treeViewStates.clear(); // Clear open/close states for a fresh view
        this._updateVariablesPanel();
        this.nodes.forEach(node => this._setNodeState(node, 'idle'));

        const startNodes = this.nodes.filter(n => !this.connections.some(c => c.to === n.id));
        if (startNodes.length === 0 && this.nodes.length > 0) {
                this.logger.error('Không tìm thấy khối bắt đầu. Workflow phải có ít nhất một khối không có đầu vào.');
        } else {
            await Promise.allSettled(startNodes.map(node => this._executeNode(node, []))); // Start with an empty try-catch stack
        }
        
        this.logger.system('--- Kết thúc Mô phỏng ---');
        
        this.isSimulating = false;
        runButton.disabled = false;
        runButton.classList.remove('opacity-50');
    }

    async _animateConnection(connection) {
        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pulse.setAttribute('d', connection.line.getAttribute('d'));
        pulse.setAttribute('class', 'connector-pulse');
        pulse.style.stroke = window.getComputedStyle(connection.line).stroke;
        pulse.setAttribute('stroke-linejoin', 'round');
        pulse.setAttribute('stroke-linecap', 'round');
        
        const length = connection.line.getTotalLength();
        pulse.style.strokeDasharray = `20 ${length}`;

        this.dom.connectorSvg.appendChild(pulse);
        
        setTimeout(() => { pulse.remove(); }, 600);
    }

    async _executeNode(node, tryCatchStack) {
        const nodeConfig = this._findNodeConfig(node.type);
        this.executionState[node.id] = { _status: 'running' };
        this._updateVariablesPanel();
        this._setNodeState(node, 'running');
        
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
            const nextConnections = this.connections.filter(c => c.from === callingNodeId && c.fromPort === portName);
            if (nextConnections.length > 0) {
                await Promise.all(nextConnections.map(async (conn) => {
                    await this._animateConnection(conn);
                    const nextNode = this.nodes.find(n => n.id === conn.to);
                    if (nextNode) {
                        await this._executeNode(nextNode, newTryCatchStack);
                    }
                }));
            }
        };
        
        // Special handling for Try/Catch node
        if (node.type === 'try_catch') {
            this.logger.info(`Bắt đầu khối Try/Catch: ${node.data.title}`);
            this._setNodeState(node, 'success');
            this.executionState[node.id] = { status: 'try_path_taken' };
            this._updateVariablesPanel();
            await executeNextNodes('try', [...tryCatchStack, node]);
            return;
        }

        try {
            // Special handling for Loop node
            if (node.type === 'loop') {
                const items = await nodeConfig.execute(resolvedNodeData, this.logger, this);
                const loopConnection = this.connections.find(c => c.from === node.id && c.fromPort === 'loop');
                
                if (loopConnection) {
                    const loopBodyStartNode = this.nodes.find(n => n.id === loopConnection.to);
                    if (loopBodyStartNode) {
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            this.logger.info(`Vòng lặp ${i + 1}/${items.length}: item = ${JSON.stringify(item)}`);
                            
                            this.executionState[node.id] = {
                                currentItem: item,
                                currentIndex: i,
                                totalItems: items.length,
                                _status: 'running'
                            };
                            this._updateVariablesPanel();
                            
                            await this._animateConnection(loopConnection);
                            await this._executeNode(loopBodyStartNode, [...tryCatchStack]); 
                        }
                    }
                }

                this.logger.success(`Vòng lặp hoàn thành.`);
                this.executionState[node.id] = { allItems: items, count: items.length };
                this._setNodeState(node, 'success');
                await executeNextNodes('done', tryCatchStack);
                return; // End execution for loop node
            }

            // Standard execution for all other nodes
            const result = await nodeConfig.execute(resolvedNodeData, this.logger, this);
            
            if (result && typeof result === 'object' && result.hasOwnProperty('selectedPort')) {
                this.executionState[node.id] = result.data;
                this._setNodeState(node, 'success');
                await executeNextNodes(result.selectedPort, tryCatchStack);
            } else {
                this.executionState[node.id] = result;
                this._setNodeState(node, 'success');
                const successPortName = (nodeConfig.outputs || ['success'])[0];
                await executeNextNodes(successPortName, tryCatchStack);
            }
        } catch (error) {
            this.logger.error(`Lỗi thực thi khối ${node.data.title}: ${error.message}`);
            this.executionState[node.id] = { error: error.message, ...error.context };
            this._setNodeState(node, 'error');
            this._updateVariablesPanel();

            const lastTryCatchNode = tryCatchStack.pop();

            if (lastTryCatchNode) {
                this.logger.info(`Đã bắt được lỗi bởi khối Try/Catch: ${lastTryCatchNode.data.title}. Chuyển hướng tới cổng 'catch'.`);
                this.executionState.error = {
                    message: error.message,
                    sourceNode: node.id,
                    context: error.context
                };
                this._setNodeState(lastTryCatchNode, 'error');
                this._updateVariablesPanel();
                
                await executeNextNodes('catch', tryCatchStack, lastTryCatchNode.id);
            } else {
                await executeNextNodes('error', tryCatchStack);
            }
        } finally {
            // Update panel unless it's a loop node which updates internally
            if (node.type !== 'loop') {
                    this._updateVariablesPanel();
            }
        }
    }


    _setNodeState(node, state) {
        node.element.classList.remove('running', 'success', 'error');
        if (state !== 'idle') {
            node.element.classList.add(state);
        }
    }

    _clearCanvas(commit = true) {
        this.dom.connectorSvg.innerHTML = '';
        this.nodes.forEach(node => node.element.remove());
        this.nodes = [];
        this.connections = [];
        this.nodeTypeCounts = {};
        this._clearSelection();
        if (commit) this._commitState("Xóa canvas");
    }

    _exportWorkflow() {
        try {
            const workflowData = this._getCurrentState();
            const jsonString = JSON.stringify(workflowData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'workflow.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            this.logger.error("Xuất file JSON thất bại.", err);
        }
    }

    _handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonContent = event.target.result;
                this._importWorkflow(jsonContent);
            } catch (err) {
                this.logger.error("Nhập file JSON thất bại. File có thể bị lỗi hoặc không đúng định dạng.", err);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    _importWorkflow(jsonString, commit = true) {
        const data = JSON.parse(jsonString);
        if (!data.nodes || !data.connections) {
            throw new Error('File JSON không hợp lệ. Thiếu thuộc tính "nodes" hoặc "connections".');
        }
        this._loadState(data);
        if (commit) {
            this.history = [];
            this.historyIndex = -1;
            this._commitState("Import file");
        }
        this._resetView();
    }

    _handleVariableContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        this._hideAllContextMenus();

        const target = e.currentTarget;
        const key = target.dataset.key;
        const value = target.dataset.value; // This is a JSON string
        const path = target.dataset.path;

        if (!key && !path) return;

        // Store this context for the click handler
        this.activeVariableContext = { key, value, path };

        const menu = this.dom.variableContextMenu;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
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
                    const parsedValue = JSON.parse(value);
                    if (typeof parsedValue === 'object' && parsedValue !== null) {
                        textToCopy = JSON.stringify(parsedValue, null, 2);
                    } else {
                        textToCopy = String(parsedValue);
                    }
                } catch {
                    textToCopy = value; // Fallback for non-JSON string
                }
                break;
            case 'copy-key':
                textToCopy = key;
                break;
            case 'copy-path':
                textToCopy = `{{${path}}}`;
                break;
        }

        if (textToCopy) {
            await this._copyToClipboard(textToCopy);
        }
        this._hideAllContextMenus();
        this.activeVariableContext = null;
    }

    async _copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.logger.system(`Đã sao chép: ${text.substring(0, 50)}...`);
        } catch (err) {
            this.logger.system('Clipboard API không thành công, sử dụng phương pháp dự phòng (execCommand).', err);
            const textArea = document.createElement("textarea");
            textArea.value = text;
            
            textArea.style.position = "fixed";
            textArea.style.top = "-9999px";
            textArea.style.left = "-9999px";
            textArea.setAttribute("readonly", "");

            document.body.appendChild(textArea);
            textArea.select();

            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    this.logger.system(`Đã sao chép (dự phòng): ${text.substring(0, 50)}...`);
                } else {
                    this.logger.error('Lỗi: Sao chép bằng phương pháp dự phòng thất bại.');
                }
            } catch (execErr) {
                this.logger.error('Lỗi: Không thể sao chép vào clipboard.', execErr);
            }

            document.body.removeChild(textArea);
        }
    }
    
    _handleProcessCurlImport() {
        const curlString = document.getElementById('curl-input-textarea').value;
        if (!curlString || this.selectedNodes.length !== 1) return;

        const node = this.selectedNodes[0];
        if (node.type !== 'http_request') return;

        try {
            const parsedData = this._parseCurlCommand(curlString);

            // Update node data
            this._setProperty(node.data, 'url', parsedData.url);
            this._setProperty(node.data, 'method', parsedData.method);
            this._setProperty(node.data, 'headers', parsedData.headers);
            
            // Reset body before setting new values
            this._setProperty(node.data, 'body', { type: 'none', json: '', formUrlEncoded: [] });
            this._setProperty(node.data, 'body.type', parsedData.body.type);
            if (parsedData.body.type === 'json') {
                this._setProperty(node.data, 'body.json', parsedData.body.content);
            } else if (parsedData.body.type === 'form-urlencoded') {
                this._setProperty(node.data, 'body.formUrlEncoded', parsedData.body.content);
            }

            this.logger.success("Lệnh cURL đã được import thành công.");
            this._updateSettingsPanel();
            this._commitState("Import from cURL");
            this.curlImportModal.hide();
        } catch (error) {
            this.logger.error(`Không thể phân tích lệnh cURL: ${error.message}`);
        }
    }

    _parseCurlCommand(curlString) {
        const result = {
            url: '',
            method: 'GET',
            headers: [],
            body: { type: 'none', content: null }
        };

        let singleLineCurl = curlString.replace(/(\r\n|\n|\r|\\| \^)/g, ' ').trim();

        const args = [];
        const regex = /'[^']*'|"[^"]*"|\S+/g;
        let match;
        while(match = regex.exec(singleLineCurl)) {
            args.push(match[0]);
        }
        
        let i = 0;
        while (i < args.length) {
            const arg = args[i];
            const nextArg = args[i+1];
            const cleanNextArg = () => nextArg ? nextArg.replace(/^['"]|['"]$/g, '') : '';

            if (arg === 'curl') {
                i++;
                continue;
            }

            if (!arg.startsWith('-')) {
                if (!result.url) {
                    result.url = arg.replace(/^['"]|['"]$/g, '');
                }
                i++;
                continue;
            }

            switch(arg) {
                case '-H':
                case '--header':
                    const headerString = cleanNextArg();
                    const separatorIndex = headerString.indexOf(':');
                    if (separatorIndex !== -1) {
                         const key = headerString.substring(0, separatorIndex).trim();
                         const value = headerString.substring(separatorIndex + 1).trim();
                         result.headers.push({ key, value });
                    }
                    i += 2;
                    break;
                case '-X':
                case '--request':
                    result.method = cleanNextArg().toUpperCase();
                    i += 2;
                    break;
                case '-d':
                case '--data':
                case '--data-raw':
                case '--data-binary':
                    const bodyContent = cleanNextArg();
                    try {
                        JSON.parse(bodyContent);
                        result.body.type = 'json';
                        result.body.content = bodyContent;
                    } catch(e) {
                        result.body.type = 'form-urlencoded';
                        const params = new URLSearchParams(bodyContent);
                        const formArray = [];
                        for (const [key, value] of params.entries()) {
                            formArray.push({ key, value });
                        }
                        result.body.content = formArray;
                    }
                    i += 2;
                    break;
                case '-b':
                case '--cookie':
                    const cookieValue = cleanNextArg();
                    const existingCookieHeader = result.headers.find(h => h.key.toLowerCase() === 'cookie');
                    if (existingCookieHeader) {
                        existingCookieHeader.value += '; ' + cookieValue;
                    } else {
                        result.headers.push({ key: 'Cookie', value: cookieValue });
                    }
                    i += 2;
                    break;
                default:
                    if (nextArg && !nextArg.startsWith('-')) {
                        i += 2;
                    } else {
                        i++;
                    }
                    break;
            }
        }

        if (result.method === 'GET' && result.body.type !== 'none') {
            result.method = 'POST';
        }

        if (!result.url) {
            throw new Error("Không thể tìm thấy URL hợp lệ trong lệnh.");
        }

        return result;
    }
}