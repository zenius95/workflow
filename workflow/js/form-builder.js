class FormBuilder {
    constructor(workflowInstance) {
        this.workflow = workflowInstance; 

        // --- DOM Elements ---
        this.palette = document.getElementById('component-palette');
        this.canvas = document.getElementById('canvas');
        this.propertiesPanel = document.getElementById('properties-panel');
        this.clearCanvasBtn = document.getElementById('clear-canvas-btn');
        this.previewPane = document.getElementById('preview-pane');

        // --- State ---
        this.components = [];
        this.selectedComponentId = null;
        this.nextId = 1;
        this.formData = {};
        this.activeResize = null;

        this.CONTROL_DEFINITIONS = {
            'text': { name: 'Text Input', icon: 'bi-input-cursor-text', props: ['label', 'dataField', 'placeholder', 'helpText', 'variablePicker', 'col', 'visibleWhen'] },
            'number': { name: 'Number Input', icon: 'bi-hash', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'password': { name: 'Password Input', icon: 'bi-key', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'textarea': { name: 'Textarea', icon: 'bi-textarea-resize', props: ['label', 'dataField', 'rows', 'placeholder', 'variablePicker', 'visibleWhen'] },
            'select': { name: 'Select (Dropdown)', icon: 'bi-menu-button-wide', props: ['label', 'dataField', 'options', 'onChange', 'col', 'visibleWhen'] },
            'file-select': { name: 'File Select', icon: 'bi-file-earmark-arrow-up', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'folder-select': { name: 'Folder Select', icon: 'bi-folder-plus', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'group': { name: 'Group', icon: 'bi-collection', props: ['label', 'helpText', 'visibleWhen'], isContainer: true },
            'tabs': { name: 'Tabs', icon: 'bi-segmented-nav', props: ['label', 'helpText', 'tabs'], isContainer: true, hasTabs: true },
            'repeater': { name: 'Repeater', icon: 'bi-plus-slash-minus', props: ['label', 'helpText', 'dataField', 'addButtonText'], isContainer: true },
            'button': { name: 'Button', icon: 'bi-hand-index-thumb', props: ['text', 'action', 'class'] },
            'info': { name: 'Info Text', icon: 'bi-info-circle', props: ['text'] },
        };
        
        this.initialize();
    }

    // --- Helper Functions ---
    findComponent(id, componentArray = this.components) {
        for (const comp of componentArray) {
            if (comp.id === id) return comp;
            if (this.CONTROL_DEFINITIONS[comp.type].isContainer) {
                const found = this.findComponent(id, comp.config.controls || []);
                if (found) return found;
            }
            if (this.CONTROL_DEFINITIONS[comp.type].hasTabs) {
                 for (const tab of (comp.config.tabs || [])) {
                    const found = this.findComponent(id, tab.controls || []);
                    if (found) return found;
                }
            }
        }
        return null;
    }
    
    findComponentByDataField(componentArray = this.components, dataField) {
        for (const comp of componentArray) {
            if (comp.config && comp.config.dataField === dataField) return comp;
            if (comp.config && comp.config.controls) {
                const found = this.findComponentByDataField(comp.config.controls, dataField);
                if (found) return found;
            }
            if (comp.config && comp.config.tabs) {
                for (const tab of comp.config.tabs) {
                    const found = this.findComponentByDataField(tab.controls, dataField);
                    if (found) return found;
                }
            }
        }
        return null;
    }

    getComponentPath(id, componentArray = this.components) {
        for (let i = 0; i < componentArray.length; i++) {
            const comp = componentArray[i];
            if (comp.id === id) return { parent: componentArray, index: i };
            if (this.CONTROL_DEFINITIONS[comp.type].isContainer) {
                const result = this.getComponentPath(id, comp.config.controls);
                if (result) return result;
            }
             if (this.CONTROL_DEFINITIONS[comp.type].hasTabs) {
                for (const tab of comp.config.tabs) {
                    const result = this.getComponentPath(id, tab.controls);
                    if (result) return result;
                }
            }
        }
        return null;
    }
    
    getAllFields(excludeId, componentArray = this.components) {
        let fields = [];
        componentArray.forEach(comp => {
            if (comp.id !== excludeId && comp.config.dataField) {
                fields.push({ text: `${comp.config.label || comp.type} (${comp.config.dataField})`, value: comp.config.dataField });
            }
            if (this.CONTROL_DEFINITIONS[comp.type].isContainer) {
                fields = fields.concat(this.getAllFields(excludeId, comp.config.controls || []));
            }
            if (this.CONTROL_DEFINITIONS[comp.type].hasTabs) {
                (comp.config.tabs || []).forEach(tab => fields = fields.concat(this.getAllFields(excludeId, tab.controls || [])));
            }
        });
        return fields;
    }

    // --- Main Functions ---
    initialize() {
        this.renderPalette();
        this.setupDragAndDrop();
        this.clearCanvasBtn.addEventListener('click', () => this.clearCanvas());

        this.previewPane.addEventListener('input', (e) => {
            const target = e.target;
            const fieldPath = target.dataset.field;
            if (fieldPath) {
                const value = target.type === 'checkbox' ? target.checked : target.value;
                this.workflow._setProperty(this.formData, fieldPath, value);
                this.workflow.setFormData(this.formData);
                if (this.CONTROL_DEFINITIONS[target.type]?.onChange === 'rerender') {
                    this.renderPreview();
                }
            }
        });
        
        this.previewPane.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const action = button.dataset.action;
            const dataField = button.dataset.field;
            const index = parseInt(button.dataset.index, 10);
            if (action === 'add-repeater-item') {
                const component = this.findComponentByDataField(this.components, dataField);
                if (component) {
                    const componentConfig = component.config;
                    let items = this.workflow._getProperty(this.formData, dataField) || [];
                    const newItem = {};
                    const fieldsSource = componentConfig.controls || [];
                    fieldsSource.forEach(fieldSource => {
                        const field = fieldSource.config ? fieldSource.config : fieldSource;
                        if (field.dataField) newItem[field.dataField] = field.defaultValue || '';
                    });
                    items.push(newItem);
                    this.workflow._setProperty(this.formData, dataField, items);
                    this.workflow.setFormData(this.formData);
                    this.renderPreview();
                }
            } else if (action === 'remove-repeater-item') {
                 let items = this.workflow._getProperty(this.formData, dataField);
                 if (Array.isArray(items) && index >= 0) {
                     items.splice(index, 1);
                     this.workflow.setFormData(this.formData);
                     this.renderPreview();
                 }
            }
        });

        document.addEventListener('mousemove', this.handleColumnResizeMove.bind(this));
        document.addEventListener('mouseup', this.handleColumnResizeEnd.bind(this));

        this.renderCanvas();
    }

    renderPalette() {
        this.palette.innerHTML = '';
        Object.entries(this.CONTROL_DEFINITIONS).forEach(([type, def]) => {
            const item = document.createElement('div');
            item.className = 'palette-item p-2 mb-2 rounded d-flex align-items-center gap-2';
            item.dataset.type = type;
            item.innerHTML = `<i class="bi ${def.icon}"></i> <span>${def.name}</span>`;
            this.palette.appendChild(item);
        });
    }

    setupDragAndDrop() {
        new Sortable(this.palette, { group: { name: 'builder', pull: 'clone', put: false }, sort: false });
        this.makeSortable(this.canvas, this.components);
    }

    makeSortable(containerElement, group) {
        return new Sortable(containerElement, {
            group: 'builder', animation: 150,
            onAdd: (evt) => {
                const type = evt.item.dataset.type;
                if (!type || !this.CONTROL_DEFINITIONS[type]) {
                    evt.item.remove(); return;
                }
                const newComponent = this.createComponent(type);

                // If added to a group column, assign the column index
                const parentCol = evt.to.closest('[data-col-index]');
                if(parentCol) {
                    newComponent.config.colIndex = parseInt(parentCol.dataset.colIndex, 10);
                }

                evt.item.remove();
                group.push(newComponent);
                this.renderCanvas();
                this.selectComponent(newComponent.id);
            },
            onUpdate: (evt) => {
                const movedItem = group.splice(evt.oldIndex, 1)[0];
                group.splice(evt.newIndex, 0, movedItem);
                
                const parentCol = evt.to.closest('[data-col-index]');
                if(parentCol) {
                    movedItem.config.colIndex = parseInt(parentCol.dataset.colIndex, 10);
                }

                this.renderCanvas();
            }
        });
    }

    createComponent(type) {
        const id = `comp-${this.nextId++}`;
        const def = this.CONTROL_DEFINITIONS[type];
        const component = { id, type, config: { type } };
        if (def.props.includes('dataField')) component.config.dataField = `field_${this.nextId}`;
        if (def.props.includes('label')) component.config.label = def.name;
        if (type === 'tabs') component.config.tabs = [{ title: 'Tab 1', controls: [] }];
        if (type === 'group') component.config.layoutColumns = [1, 1]; 
        if (type === 'repeater') component.config.addButtonText = "+ Thêm mục";
        if (def.isContainer) component.config.controls = [];
        return component;
    }
    
    renderCanvas() {
        this.canvas.innerHTML = '';
        if (this.components.length === 0) {
            this.canvas.innerHTML = '<p class="text-muted text-center">Kéo các thành phần từ Hộp công cụ vào đây</p>';
        } else {
            this.components.forEach(comp => this.canvas.appendChild(this.createComponentElement(comp)));
        }
        this.renderPropertiesPanel();
        this.renderPreview();
        this.workflow._commitState("Form Builder Changed");
    }

    createComponentElement(component) {
        const def = this.CONTROL_DEFINITIONS[component.type];
        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-component p-3 mb-2 rounded';
        wrapper.dataset.id = component.id;
        if (component.id === this.selectedComponentId) wrapper.classList.add('selected');
        
        const header = `<div class="d-flex justify-content-between align-items-start"><div class="pe-4"><div class="component-label"><i class="bi ${def.icon} me-2"></i>${component.config.label || def.name}</div><div class="component-type">${component.config.dataField || `ID: ${component.id}`}</div></div><div class="component-actions btn-group"><button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button></div></div>`;
        wrapper.innerHTML = header;
        
        if (component.type === 'group') {
            const layoutContainer = document.createElement('div');
            layoutContainer.className = 'component-layout-container mt-3';
            const cols = component.config.layoutColumns || [1];
            layoutContainer.style.gridTemplateColumns = cols.map(c => `${c}fr`).join(' ');

            const childrenByCol = cols.map(() => []);
            (component.config.controls || []).forEach(child => {
                const colIndex = child.config.colIndex || 0;
                if(childrenByCol[colIndex]) childrenByCol[colIndex].push(child);
                else childrenByCol[0].push(child);
            });

            cols.forEach((_, index) => {
                const columnWrapper = document.createElement('div');
                columnWrapper.className = 'component-layout-column';
                const columnContent = document.createElement('div');
                columnContent.className = 'component-container';
                columnContent.dataset.colIndex = index;

                childrenByCol[index].forEach(child => columnContent.appendChild(this.createComponentElement(child)));
                
                this.makeSortable(columnContent, childrenByCol[index]);
                
                columnWrapper.appendChild(columnContent);
                layoutContainer.appendChild(columnWrapper);

                if (index < cols.length - 1) {
                    const resizeHandle = document.createElement('div');
                    resizeHandle.className = 'resize-handle';
                    resizeHandle.addEventListener('mousedown', (e) => this.handleColumnResizeStart(e, component, index));
                    layoutContainer.appendChild(resizeHandle);
                }
            });

            const colActions = document.createElement('div');
            colActions.className = 'layout-actions';
            colActions.innerHTML = `<button class="btn btn-sm btn-light btn-add-col" title="Thêm cột"><i class="bi bi-plus-lg"></i></button><button class="btn btn-sm btn-light btn-remove-col" title="Xóa cột cuối"><i class="bi bi-dash-lg"></i></button>`;
            colActions.querySelector('.btn-add-col').addEventListener('click', () => this.addColumnToGroup(component));
            colActions.querySelector('.btn-remove-col').addEventListener('click', () => this.removeColumnFromGroup(component));

            wrapper.appendChild(layoutContainer);
            wrapper.appendChild(colActions);
        } else if (def.isContainer && !def.hasTabs) {
            const containerDiv = document.createElement('div');
            containerDiv.className = 'component-container mt-3 p-3 border rounded bg-body-secondary';
            (component.config.controls || []).forEach(child => containerDiv.appendChild(this.createComponentElement(child)));
            this.makeSortable(containerDiv, component.config.controls);
            wrapper.appendChild(containerDiv);
        }

        wrapper.addEventListener('click', e => {
            e.stopPropagation();
            if (e.target.closest('.btn-delete')) this.deleteComponent(component.id);
            else this.selectComponent(component.id);
        });
        return wrapper;
    }

    renderPreview() {
        this.previewPane.innerHTML = '';
        if (this.components.length === 0) {
            this.previewPane.innerHTML = '<p class="text-muted text-center">Chưa có gì để xem trước</p>';
            return;
        }
        const finalConfig = this.components.map(c => c.config);
        const formContent = this.workflow.settingsRenderer.render(finalConfig, 'preview', this.formData);
        
        const tabTriggers = formContent.querySelectorAll('[data-bs-toggle="tab"]');
        tabTriggers.forEach(tabTriggerEl => {
             const tab = new bootstrap.Tab(tabTriggerEl);
             tabTriggerEl.addEventListener('click', event => { event.preventDefault(); tab.show(); });
        });
        this.previewPane.appendChild(formContent);
    }
    
    renderPropertiesPanel() {
        this.propertiesPanel.innerHTML = '';
        const component = this.findComponent(this.selectedComponentId);
        if (!component) {
            this.propertiesPanel.innerHTML = '<p class="text-muted p-3">Chưa có thành phần nào được chọn.</p>';
            return;
        }
        const def = this.CONTROL_DEFINITIONS[component.type];
        def.props.forEach(prop => this.propertiesPanel.appendChild(this.createPropertyInput(component, prop)));
    }
    
    createPropertyInput(component, prop) {
        const value = component.config[prop];
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3 prop-wrapper';
        const propName = prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        let inputHtml = '';

        const isCheck = ['variablePicker', 'onChange'].includes(prop);
        const type = ['col', 'rows'].includes(prop) ? 'number' : 'text';

        if(isCheck) {
            inputHtml = `<div class="form-check"><input class="form-check-input" type="checkbox" data-prop="${prop}" ${value ? 'checked' : ''}></div>`;
        } else {
            inputHtml = `<input type="${type}" class="form-control form-control-sm" data-prop="${prop}" value="${value || ''}">`;
        }
        
        wrapper.innerHTML = `<label class="form-label">${propName}</label>${inputHtml}`;
        wrapper.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('input', e => {
            const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            this.updateComponentConfig(component.id, e.target.dataset.prop, val);
        }));
        return wrapper;
    }
    
    selectComponent(id) {
        if (this.selectedComponentId === id) return;
        this.selectedComponentId = id;
        document.querySelectorAll('.canvas-component').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
        this.renderPropertiesPanel();
    }

    updateComponentConfig(id, prop, value) {
        const component = this.findComponent(id);
        if (!component) return;

        const activeElement = document.activeElement;
        const selectionStart = activeElement.selectionStart;
        const selectionEnd = activeElement.selectionEnd;

        component.config[prop] = value;
        
        this.renderPreview();

        requestAnimationFrame(() => {
            const newActiveElement = this.propertiesPanel.querySelector(`[data-prop="${prop}"]`);
            if(newActiveElement) {
                newActiveElement.focus();
                try {
                    newActiveElement.setSelectionRange(selectionStart, selectionEnd);
                } catch(e) {}
            }
        });
    }

    addColumnToGroup(groupComponent) {
        groupComponent.config.layoutColumns.push(1);
        this.renderCanvas();
    }

    removeColumnFromGroup(groupComponent) {
        const cols = groupComponent.config.layoutColumns;
        if (cols.length <= 1) return; 
        
        const lastColIndex = cols.length - 1;
        const targetColIndex = lastColIndex - 1;

        (groupComponent.config.controls || []).forEach(child => {
            if (child.config.colIndex === lastColIndex) {
                child.config.colIndex = targetColIndex;
            }
        });

        cols.pop();
        this.renderCanvas();
    }

    handleColumnResizeStart(e, component, columnIndex) {
        e.preventDefault();
        this.activeResize = {
            componentId: component.id,
            columnIndex,
            startX: e.clientX,
            containerWidth: e.target.closest('.component-layout-container').offsetWidth
        };
    }

    handleColumnResizeMove(e) {
        if (!this.activeResize) return;
        const { componentId, startX, containerWidth, columnIndex } = this.activeResize;
        
        const component = this.findComponent(componentId);
        if (!component) return;
        
        const dx = e.clientX - startX;
        const ratios = component.config.layoutColumns;
        const currentSum = ratios[columnIndex] + ratios[columnIndex + 1];
        
        // Convert pixel delta to ratio delta
        const ratioDelta = (dx / containerWidth) * currentSum;

        let newLeftRatio = ratios[columnIndex] + ratioDelta;
        let newRightRatio = ratios[columnIndex + 1] - ratioDelta;
        
        // Prevent collapsing
        if (newLeftRatio / currentSum < 0.1 || newRightRatio / currentSum < 0.1) {
            return;
        }

        ratios[columnIndex] = newLeftRatio;
        ratios[columnIndex+1] = newRightRatio;
        
        // Re-render canvas for visual feedback
        this.renderCanvas();
        this.activeResize.startX = e.clientX; // Update startX for next move event
    }

    handleColumnResizeEnd() {
        if (!this.activeResize) return;
        this.activeResize = null;
        this.renderCanvas(); // Final render
    }
    
    deleteComponent(id) {
        const path = this.getComponentPath(id);
        if (path) {
            path.parent.splice(path.index, 1);
            if (this.selectedComponentId === id) this.selectedComponentId = null;
            this.renderCanvas();
        }
    }
    
    clearCanvas() {
        if (confirm('Sếp có chắc muốn xóa toàn bộ form không?')) {
            this.components = [];
            this.selectedComponentId = null;
            this.renderCanvas();
            this.makeSortable(this.canvas, this.components);
        }
    }
}