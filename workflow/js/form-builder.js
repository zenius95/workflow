// workflow/js/form-builder.js

class FormBuilder {
    constructor(workflowInstance) {
        this.workflow = workflowInstance; 

        this.palette = document.getElementById('component-palette');
        this.canvas = document.getElementById('canvas');
        this.propertiesPanel = document.getElementById('properties-panel');
        this.clearCanvasBtn = document.getElementById('clear-canvas-btn');
        this.previewPane = document.getElementById('preview-pane');

        this.components = [];
        this.selectedComponentId = null;
        this.nextId = 1;
        this.formData = {};

        this.CONTROL_DEFINITIONS = {
            'text': { name: i18n.get('form_builder.controls.text'), icon: 'bi-input-cursor-text', props: ['label', 'dataField', 'placeholder', 'helpText', 'variablePicker', 'col', 'visibleWhen'] },
            'number': { name: i18n.get('form_builder.controls.number'), icon: 'bi-hash', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'password': { name: i18n.get('form_builder.controls.password'), icon: 'bi-key', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'textarea': { name: i18n.get('form_builder.controls.textarea'), icon: 'bi-textarea-resize', props: ['label', 'dataField', 'rows', 'placeholder', 'variablePicker', 'visibleWhen'] },
            'select': { name: i18n.get('form_builder.controls.select'), icon: 'bi-menu-button-wide', props: ['label', 'dataField', 'options', 'onChange', 'col', 'visibleWhen'] },
            'file-select': { name: i18n.get('form_builder.controls.file-select'), icon: 'bi-file-earmark-arrow-up', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'folder-select': { name: i18n.get('form_builder.controls.folder-select'), icon: 'bi-folder-plus', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'group': { name: i18n.get('form_builder.controls.group'), icon: 'bi-collection', props: ['label', 'helpText', 'visibleWhen'], isContainer: true },
            'tabs': { name: i18n.get('form_builder.controls.tabs'), icon: 'bi-segmented-nav', props: ['label', 'helpText', 'tabs'], isContainer: true, hasTabs: true },
            'repeater': { name: i18n.get('form_builder.controls.repeater'), icon: 'bi-plus-slash-minus', props: ['label', 'helpText', 'dataField', 'addButtonText'], isContainer: true },
            'button': { name: i18n.get('form_builder.controls.button'), icon: 'bi-hand-index-thumb', props: ['text', 'action', 'class'] },
            'info': { name: i18n.get('form_builder.controls.info'), icon: 'bi-info-circle', props: ['text'] },
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
                if (c.config.controls) max = c.config.controls.reduce((m, child) => findMaxId(child, m), max);
                if (c.config.tabs) max = c.config.tabs.reduce((m, tab) => tab.controls.reduce((m2, child) => findMaxId(child, m2), m), max);
                return max;
            };
            return findMaxId(comp, maxId);
        }, 0)) + 1;
        this.renderCanvas();
        this.selectComponent(null);
        this._notifyWorkflowChanged();
    }

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
    
    initialize() {
        this.renderPalette();
        this.setupDragAndDrop();
        this.clearCanvasBtn.addEventListener('click', () => this.clearCanvas());

        // Listener for Repeater buttons
        this.previewPane.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
             if (!button) return;
            if (button.dataset.action === 'add-repeater-item' || button.dataset.action === 'remove-repeater-item') {
                 // The actual data change is handled by settings.js, we just need to re-render and update
                 setTimeout(() => {
                    this.renderPreview();
                    this.workflow.setFormData(this.formData);
                 }, 0);
            }
        });

        // Listener for any data input changes
        this.previewPane.addEventListener('input', (e) => {
            // The listener in setting.js has already updated this.formData object
            // because it runs on the target element before bubbling up to the pane.
            // We just need to tell the main workflow instance that the data has changed
            // so it can update the Variables panel.
            if (e.target.dataset.field) {
                this.workflow.setFormData(this.formData);
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
                if (activeNavLink) activeTabId = activeNavLink.getAttribute('href');
            }
            if (action === 'add') {
                const type = evt.item.dataset.type;
                if (!type || !this.CONTROL_DEFINITIONS[type]) { evt.item.remove(); return; }
                const newComponent = this.createComponent(type);
                evt.item.remove();
                group.splice(evt.newIndex, 0, newComponent);
                this.renderCanvas(activeTabId);
                this.selectComponent(newComponent.id);
            } else if (action === 'update') {
                const movedItem = group.splice(evt.oldIndex, 1)[0];
                group.splice(evt.newIndex, 0, movedItem);
                this.renderCanvas(activeTabId);
            }
            this._notifyWorkflowChanged();
        };
        return new Sortable(containerElement, { group: 'builder', animation: 150, onAdd: (evt) => handleSortableChange(evt, 'add'), onUpdate: (evt) => handleSortableChange(evt, 'update') });
    }

    createComponent(type) {
        const id = `comp-${this.nextId++}`;
        const def = this.CONTROL_DEFINITIONS[type];
        const component = { id, type, config: { type } };
        if (def.props.includes('dataField')) component.config.dataField = `field_${this.nextId}`;
        if (def.props.includes('label')) component.config.label = def.name;
        if (type === 'tabs') component.config.tabs = [{ title: 'Tab 1', controls: [] }];
        if (type === 'repeater') component.config.addButtonText = i18n.get('form_builder.add_item');
        if (def.isContainer) component.config.controls = [];
        return component;
    }
    
    renderCanvas(activeTabIdToRestore = null) {
        this.canvas.innerHTML = '';
        if (this.components.length === 0) {
            this.canvas.innerHTML = `<p class="text-muted text-center">${i18n.get('form_builder.canvas_placeholder')}</p>`;
        } else {
            this.components.forEach(comp => this.canvas.appendChild(this.createComponentElement(comp)));
        }
        this.makeSortable(this.canvas, this.components);
        if (activeTabIdToRestore) {
            const newTabButton = this.canvas.querySelector(`a.nav-link[href="${activeTabIdToRestore}"]`);
            if (newTabButton) new bootstrap.Tab(newTabButton).show();
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
        
        if (component.type === 'tabs') {
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
            this.previewPane.innerHTML = `<p class="text-muted text-center">${i18n.get('form_builder.preview_placeholder')}</p>`;
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
            this.propertiesPanel.innerHTML = `<p class="text-muted p-3">${i18n.get('form_builder.no_component_selected')}</p>`;
            return;
        }
        const def = this.CONTROL_DEFINITIONS[component.type];
        def.props.forEach(prop => {
            if (prop === 'tabs' && component.type === 'tabs') {
                this.propertiesPanel.appendChild(this._createTabsPropertyEditor(component));
            } else {
                this.propertiesPanel.appendChild(this.createPropertyInput(component, prop));
            }
        });
    }

    _createTabsPropertyEditor(component) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3 prop-wrapper tabs-editor';
        wrapper.innerHTML = `<label class="form-label">${i18n.get('form_builder.props.tabs')}</label>`;
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
        addBtn.innerHTML = `<i class="bi bi-plus-lg"></i> ${i18n.get('form_builder.add_tab')}`;
        addBtn.addEventListener('click', () => {
            component.config.tabs.push({ title: `Tab ${component.config.tabs.length + 1}`, controls: [] });
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
        const propName = i18n.get(`form_builder.props.${prop}`);
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
            this.updateComponentConfig(component.id, e.target.dataset.prop, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
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
            if (notify) this._notifyWorkflowChanged();
        };

        if (notify) {
            if (confirm(i18n.get('form_builder.confirm_clear_canvas'))) doClear();
        } else {
            doClear();
        }
    }
}