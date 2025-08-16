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

        this.CONTROL_DEFINITIONS = {
            'text': { name: 'Text Input', icon: 'bi-input-cursor-text', props: ['label', 'dataField', 'placeholder', 'helpText', 'variablePicker', 'col', 'visibleWhen'] },
            'number': { name: 'Number Input', icon: 'bi-hash', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'password': { name: 'Password Input', icon: 'bi-key', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'textarea': { name: 'Textarea', icon: 'bi-textarea-resize', props: ['label', 'dataField', 'rows', 'placeholder', 'variablePicker', 'visibleWhen'] },
            'select': { name: 'Select (Dropdown)', icon: 'bi-menu-button-wide', props: ['label', 'dataField', 'options', 'onChange', 'col', 'visibleWhen'] },
            'file-select': { name: 'File Select', icon: 'bi-file-earmark-arrow-up', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'folder-select': { name: 'Folder Select', icon: 'bi-folder-plus', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'group': { name: 'Group', icon: 'bi-collection', props: ['label', 'helpText', 'layoutColumns', 'visibleWhen'], isContainer: true },
            'tabs': { name: 'Tabs', icon: 'bi-segmented-nav', props: ['label', 'helpText', 'tabs'], isContainer: true, hasTabs: true },
            'repeater': { name: 'Repeater', icon: 'bi-plus-slash-minus', props: ['label', 'helpText', 'dataField', 'addButtonText'], isContainer: true },
            'button': { name: 'Button', icon: 'bi-hand-index-thumb', props: ['text', 'action', 'class'] },
            'info': { name: 'Info Text', icon: 'bi-info-circle', props: ['text'] },
        };
        
        this.initialize();
    }
    
    _notifyWorkflowChanged() {
        this.workflow.setFormBuilderData(this.components);
    }

    loadComponents(components) {
        this.components = JSON.parse(JSON.stringify(components || []));
        
        this.nextId = (this.components.reduce((maxId, comp) => {
            const findMaxId = (c, currentMax) => {
                const idNum = parseInt(c.id.split('-')[1], 10);
                let max = Math.max(currentMax, isNaN(idNum) ? 0 : idNum);
                if (c.config.controls) {
                    max = c.config.controls.reduce((m, child) => findMaxId(child, m), max);
                }
                if (c.config.tabs) {
                    max = c.config.tabs.reduce((m, tab) => tab.controls.reduce((m2, child) => findMaxId(child, m2), m), max);
                }
                return max;
            };
            return findMaxId(comp, maxId);
        }, 0)) + 1;

        this.renderCanvas();
        this.selectComponent(null);
        this._notifyWorkflowChanged();
    }


    // --- Helper Functions ---
    findComponent(id, componentArray = this.components) {
        for (const comp of componentArray) {
            if (comp.id === id) return comp;
            if (comp.config.controls) {
                const found = this.findComponent(id, comp.config.controls);
                if (found) return found;
            }
            if (comp.config.tabs) {
                 for (const tab of (comp.config.tabs || [])) {
                    const found = this.findComponent(id, tab.controls);
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
            if (comp.config.controls) {
                const result = this.getComponentPath(id, comp.config.controls);
                if (result) return result;
            }
             if (comp.config.tabs) {
                for (const tab of comp.config.tabs) {
                    const result = this.getComponentPath(id, tab.controls);
                    if (result) return result;
                }
            }
        }
        return null;
    }
    
    // --- Main Functions ---
    initialize() {
        this.renderPalette();
        this.setupDragAndDrop();
        this.clearCanvasBtn.addEventListener('click', () => this.clearCanvas());
        this.previewPane.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
             if (!button) return;
            if (button.dataset.action === 'add-repeater-item' || button.dataset.action === 'remove-repeater-item') {
                 setTimeout(() => this.renderPreview(), 0);
            }
        });
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
        const handleSortableChange = (evt, action) => {
            let activeTabId = null;
            const parentTabsEl = evt.to.closest('.canvas-component[data-id]');
            if (parentTabsEl) {
                const activeNavLink = parentTabsEl.querySelector('.nav-link.active');
                if (activeNavLink) {
                    activeTabId = activeNavLink.getAttribute('href');
                }
            }

            if (action === 'add') {
                const type = evt.item.dataset.type;
                if (!type || !this.CONTROL_DEFINITIONS[type]) { evt.item.remove(); return; }
                const newComponent = this.createComponent(type);
                const parentCol = evt.to.closest('[data-col-index]');
                if (parentCol) newComponent.config.colIndex = parseInt(parentCol.dataset.colIndex, 10);
                evt.item.remove();
                group.splice(evt.newIndex, 0, newComponent);
                this.renderCanvas(activeTabId);
                this.selectComponent(newComponent.id);
            } else if (action === 'update') {
                const movedItem = group.splice(evt.oldIndex, 1)[0];
                group.splice(evt.newIndex, 0, movedItem);
                const parentCol = evt.to.closest('[data-col-index]');
                if (parentCol) movedItem.config.colIndex = parseInt(parentCol.dataset.colIndex, 10);
                this.renderCanvas(activeTabId);
            }
            this._notifyWorkflowChanged();
        };
    
        return new Sortable(containerElement, {
            group: 'builder', animation: 150,
            onAdd: (evt) => handleSortableChange(evt, 'add'),
            onUpdate: (evt) => handleSortableChange(evt, 'update'),
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
    
    renderCanvas(activeTabIdToRestore = null) {
        this.canvas.innerHTML = '';
        if (this.components.length === 0) {
            this.canvas.innerHTML = '<p class="text-muted text-center">Kéo các thành phần từ Hộp công cụ vào đây</p>';
        } else {
            this.components.forEach(comp => this.canvas.appendChild(this.createComponentElement(comp)));
        }

        // *** BẮT ĐẦU SỬA LỖI: Tái khởi tạo Sortable cho canvas chính ***
        this.makeSortable(this.canvas, this.components);
        // *** KẾT THÚC SỬA LỖI ***

        if (activeTabIdToRestore) {
            const newTabButton = this.canvas.querySelector(`a.nav-link[href="${activeTabIdToRestore}"]`);
            if (newTabButton) {
                const tab = new bootstrap.Tab(newTabButton);
                tab.show();
            }
        }

        this.renderPropertiesPanel();
        this.renderPreview();
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
            const totalUnits = cols.reduce((sum, val) => sum + val, 0);
            layoutContainer.style.gridTemplateColumns = cols.map(c => `${(c / totalUnits) * 100}%`).join(' ');

            const childrenByCol = cols.map(() => []);
            (component.config.controls || []).forEach(child => {
                const colIndex = child.config.colIndex || 0;
                if(childrenByCol[colIndex]) childrenByCol[colIndex].push(child); else childrenByCol[0].push(child);
            });
            cols.forEach((_, index) => {
                const columnContent = document.createElement('div');
                columnContent.className = 'component-container component-layout-column';
                columnContent.dataset.colIndex = index;
                childrenByCol[index].forEach(child => columnContent.appendChild(this.createComponentElement(child)));
                this.makeSortable(columnContent, component.config.controls);
                layoutContainer.appendChild(columnContent);
            });
            wrapper.appendChild(layoutContainer);
        } else if (component.type === 'tabs') {
            const tabId = `canvas-tabs-${component.id}`;
            const tabWrapper = document.createElement('div');
            tabWrapper.className = 'mt-3';
            const nav = document.createElement('ul');
            nav.className = 'nav nav-tabs mb-0';
            const content = document.createElement('div');
            content.className = 'tab-content border border-top-0 rounded-bottom';
            (component.config.tabs || []).forEach((tab, index) => {
                const paneId = `#${tabId}-pane-${index}`;
                nav.innerHTML += `<li class="nav-item"><a class="nav-link ${index === 0 ? 'active' : ''}" data-bs-toggle="tab" href="${paneId}">${tab.title}</a></li>`;
                const pane = document.createElement('div');
                pane.className = `tab-pane fade ${index === 0 ? 'show active' : ''}`;
                pane.id = paneId.substring(1);
                const containerDiv = document.createElement('div');
                containerDiv.className = 'component-container p-3';
                containerDiv.dataset.tabIndex = index;
                (tab.controls || []).forEach(child => containerDiv.appendChild(this.createComponentElement(child)));
                this.makeSortable(containerDiv, tab.controls);
                pane.appendChild(containerDiv);
                content.appendChild(pane);
            });
            tabWrapper.append(nav, content);
            wrapper.appendChild(tabWrapper);
        } else if (def.isContainer) {
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
        const formConfigForRenderer = { settings: finalConfig };
        const formContent = this.workflow.settingsRenderer.renderAndBind(finalConfig, 'preview', this.formData, formConfigForRenderer);
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
        def.props.forEach(prop => {
            if (prop === 'tabs' && component.type === 'tabs') {
                this.propertiesPanel.appendChild(this._createTabsPropertyEditor(component));
            } else if (prop === 'layoutColumns' && component.type === 'group') {
                this.propertiesPanel.appendChild(this._createGroupLayoutEditor(component));
            } else {
                this.propertiesPanel.appendChild(this.createPropertyInput(component, prop));
            }
        });
    }

    _createGroupLayoutEditor(component) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3 prop-wrapper group-layout-editor';
        wrapper.innerHTML = `<label class="form-label">Layout (tỉ lệ các cột)</label>`;
        const layoutContainer = document.createElement('div');
        (component.config.layoutColumns || []).forEach((col, index) => {
            const item = document.createElement('div');
            item.className = 'layout-item';
            item.innerHTML = `
                <span class="col-form-label">Cột ${index + 1}:</span>
                <input type="number" class="form-control form-control-sm" value="${col}" min="1" step="0.1">
                <button class="btn btn-sm btn-outline-danger btn-remove-col"><i class="bi bi-trash"></i></button>`;
            item.querySelector('input').addEventListener('input', e => {
                const newValue = parseFloat(e.target.value) || 1;
                component.config.layoutColumns[index] = newValue;
                this.renderCanvas();
                this._notifyWorkflowChanged();
            });
            const removeBtn = item.querySelector('.btn-remove-col');
            if (component.config.layoutColumns.length <= 1) removeBtn.disabled = true;
            removeBtn.addEventListener('click', () => {
                this.removeColumnFromGroup(component, index);
            });
            layoutContainer.appendChild(item);
        });
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
        addBtn.innerHTML = '<i class="bi bi-plus-lg"></i> Thêm Cột';
        addBtn.addEventListener('click', () => {
            component.config.layoutColumns.push(1);
            this.renderCanvas();
            this._notifyWorkflowChanged();
        });
        wrapper.append(layoutContainer, addBtn);
        return wrapper;
    }
    
    _createTabsPropertyEditor(component) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3 prop-wrapper tabs-editor';
        wrapper.innerHTML = `<label class="form-label">Tabs</label>`;
        const tabsContainer = document.createElement('div');
        (component.config.tabs || []).forEach((tab, index) => {
            const tabItem = document.createElement('div');
            tabItem.className = 'tab-item';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm';
            input.value = tab.title;
            input.addEventListener('input', (e) => {
                tab.title = e.target.value;
                this.renderCanvas();
                this._notifyWorkflowChanged();
            });
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger btn-remove-tab';
            removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
            if (component.config.tabs.length <= 1) removeBtn.disabled = true;
            removeBtn.addEventListener('click', () => {
                component.config.tabs.splice(index, 1);
                this.renderCanvas();
                this._notifyWorkflowChanged();
            });
            tabItem.append(input, removeBtn);
            tabsContainer.appendChild(tabItem);
        });
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
        addBtn.innerHTML = '<i class="bi bi-plus-lg"></i> Thêm Tab';
        addBtn.addEventListener('click', () => {
            const newIndex = component.config.tabs.length + 1;
            component.config.tabs.push({ title: `Tab ${newIndex}`, controls: [] });
            this.renderCanvas();
            this._notifyWorkflowChanged();
        });
        wrapper.append(tabsContainer, addBtn);
        return wrapper;
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
        this.selectedComponentId = id;
        document.querySelectorAll('.canvas-component').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
        this.renderPropertiesPanel();
    }

    updateComponentConfig(id, prop, value) {
        const component = this.findComponent(id);
        if (!component) return;
        const activeElement = document.activeElement;
        const selectionStart = activeElement ? activeElement.selectionStart : 0;
        const selectionEnd = activeElement ? activeElement.selectionEnd : 0;
        component.config[prop] = value;
        this.renderCanvas();
        this._notifyWorkflowChanged();
        requestAnimationFrame(() => {
            const newActiveElement = this.propertiesPanel.querySelector(`[data-prop="${prop}"]`);
            if(newActiveElement && document.activeElement !== newActiveElement) {
                newActiveElement.focus();
                try { newActiveElement.setSelectionRange(selectionStart, selectionEnd); } catch(e) {}
            }
        });
    }

    removeColumnFromGroup(groupComponent, colIndexToRemove) {
        const cols = groupComponent.config.layoutColumns;
        if (cols.length <= 1) return;
        const targetColIndex = Math.max(0, colIndexToRemove - 1);
        (groupComponent.config.controls || []).forEach(child => {
            const currentChildCol = child.config.colIndex || 0;
            if (currentChildCol === colIndexToRemove) {
                child.config.colIndex = targetColIndex;
            } else if (currentChildCol > colIndexToRemove) {
                child.config.colIndex = currentChildCol - 1;
            }
        });
        cols.splice(colIndexToRemove, 1);
        this.renderCanvas();
        this._notifyWorkflowChanged();
    }
    
    deleteComponent(id) {
        const path = this.getComponentPath(id);
        if (path) {
            path.parent.splice(path.index, 1);
            if (this.selectedComponentId === id) this.selectedComponentId = null;
            this.renderCanvas();
            this._notifyWorkflowChanged();
        }
    }
    
    clearCanvas(notify = true) {
        const doClear = () => {
            this.components = [];
            this.selectedComponentId = null;
            this.formData = {};
            this.workflow.setFormData(this.formData);
            this.renderCanvas();
            this.makeSortable(this.canvas, this.components);
            if (notify) {
                this._notifyWorkflowChanged();
            }
        };

        if (notify) {
            if (confirm('Sếp có chắc muốn xóa toàn bộ form không?')) {
                doClear();
            }
        } else {
            doClear();
        }
    }
}