class FormBuilder {
    constructor(workflowInstance) {
        this.workflow = workflowInstance; 

        // --- DOM Elements ---
        this.palette = document.getElementById('component-palette');
        this.canvas = document.getElementById('canvas');
        this.propertiesPanel = document.getElementById('properties-panel');
        this.generateBtn = document.getElementById('generate-btn');
        this.clearCanvasBtn = document.getElementById('clear-canvas-btn');
        this.outputModal = new bootstrap.Modal(document.getElementById('output-modal'));
        this.outputCode = document.getElementById('output-code');
        this.copyCodeBtn = document.getElementById('copy-code-btn');
        this.previewPane = document.getElementById('preview-pane');

        // --- State ---
        this.components = [];
        this.selectedComponentId = null;
        this.nextId = 1;
        this.formData = {}; 

        // --- Definitions ---
        this.CONTROL_DEFINITIONS = {
            'text': { name: 'Text Input', icon: 'bi-input-cursor-text', props: ['label', 'dataField', 'placeholder', 'helpText', 'variablePicker', 'col', 'visibleWhen'] },
            'number': { name: 'Number Input', icon: 'bi-hash', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'password': { name: 'Password Input', icon: 'bi-key', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
            'textarea': { name: 'Textarea', icon: 'bi-textarea-resize', props: ['label', 'dataField', 'rows', 'placeholder', 'variablePicker', 'visibleWhen'] },
            'select': { name: 'Select (Dropdown)', icon: 'bi-menu-button-wide', props: ['label', 'dataField', 'options', 'onChange', 'col', 'visibleWhen'] },
            // <<< THÊM MỚI 2 DÒNG DƯỚI >>>
            'file-select': { name: 'File Select', icon: 'bi-file-earmark-arrow-up', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'folder-select': { name: 'Folder Select', icon: 'bi-folder-plus', props: ['label', 'dataField', 'helpText', 'col', 'visibleWhen'] },
            'group': { name: 'Group', icon: 'bi-collection', props: ['label', 'helpText', 'visibleWhen'], isContainer: true },
            'tabs': { name: 'Tabs', icon: 'bi-segmented-nav', props: ['label', 'helpText', 'tabs'], isContainer: true, hasTabs: true },
            'repeater': { name: 'Repeater', icon: 'bi-plus-slash-minus', props: ['label', 'helpText', 'dataField', 'addButtonText', 'fields'], isContainer: true, hasFields: true },
            'button': { name: 'Button', icon: 'bi-hand-index-thumb', props: ['text', 'action', 'class'] },
            'info': { name: 'Info Text', icon: 'bi-info-circle', props: ['text'] },
        };
        
        this.initialize();
    }

    // ... (Phần còn lại của file không có thay đổi quan trọng) ...
    // --- Helper Functions ---
    findComponent(id, componentArray = this.components) {
        for (const comp of componentArray) {
            if (comp.id === id) return comp;
            if (this.CONTROL_DEFINITIONS[comp.type].isContainer) {
                const found = this.findComponent(id, comp.config.controls || []);
                if (found) return found;
            }
            if (this.CONTROL_DEFINITIONS[comp.type].hasTabs) {
                 for (const tab of comp.config.tabs) {
                    const found = this.findComponent(id, tab.controls || []);
                    if (found) return found;
                }
            }
        }
        return null;
    }
    
    findComponentByDataField(dataField, componentArray = this.components.map(c => c.config)) {
        for (const config of componentArray) {
            if (config.dataField === dataField) return config;
            if (config.controls) {
                const found = this.findComponentByDataField(dataField, config.controls);
                if (found) return found;
            }
            if (config.tabs) {
                for (const tab of config.tabs) {
                    const found = this.findComponentByDataField(dataField, tab.controls);
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
        this.generateBtn.addEventListener('click', () => this.generateOutput());
        this.clearCanvasBtn.addEventListener('click', () => this.clearCanvas());
        this.copyCodeBtn.addEventListener('click', () => this.copyOutputToClipboard());

        this.previewPane.addEventListener('input', (e) => {
            const target = e.target;
            const fieldPath = target.dataset.field;
            if (fieldPath) {
                const value = target.type === 'checkbox' ? target.checked : target.value;
                this.workflow._setProperty(this.formData, fieldPath, value);
                this.workflow.setFormData(this.formData);
            }
        });
        
        this.previewPane.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const action = button.dataset.action;
            const dataField = button.dataset.field;
            const index = parseInt(button.dataset.index, 10);

            if (action === 'add-repeater-item') {
                const componentConfig = this.findComponentByDataField(dataField);
                if (componentConfig) {
                    let items = this.workflow._getProperty(this.formData, dataField);
                    if (!Array.isArray(items)) {
                        items = [];
                        this.workflow._setProperty(this.formData, dataField, items);
                    }
                    const newItem = {};
                    (componentConfig.fields || []).forEach(field => {
                        this.workflow._setProperty(newItem, field.dataField, field.defaultValue || '');
                    });
                    items.push(newItem);
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
        new Sortable(containerElement, {
            group: 'builder', animation: 150,
            onAdd: (evt) => {
                const type = evt.item.dataset.type;
                if (!type || !this.CONTROL_DEFINITIONS[type]) {
                    evt.item.remove();
                    return;
                }
                const newComponent = this.createComponent(type);
                evt.item.remove();
                group.splice(evt.newIndex, 0, newComponent);
                this.renderCanvas();
                this.selectComponent(newComponent.id);
            },
            onUpdate: (evt) => {
                const movedItem = group.splice(evt.oldIndex, 1)[0];
                group.splice(evt.newIndex, 0, movedItem);
                this.renderCanvas();
            }
        });
    }

    createComponent(type) {
        const id = `comp-${this.nextId++}`;
        const def = this.CONTROL_DEFINITIONS[type];
        const component = { id, type, config: { type } };
        if (def.props.includes('dataField')) {
            component.config.dataField = `field_${this.nextId}`;
        }
        if (def.props.includes('label')) component.config.label = def.name;
        if (type === 'tabs') {
            component.config.tabs = [{ title: 'Tab 1', controls: [] }];
            component.config.activeTabIndex = 0;
        }
        if (type === 'repeater') {
            component.config.addButtonText = "+ Thêm mục";
            component.config.fields = [{ type: 'text', dataField: 'key', placeholder: 'Key', label: 'Key' }];
        }
        if (def.isContainer) component.config.controls = component.config.controls || [];
        return component;
    }
    
    // --- Rendering Functions ---
    renderCanvas() {
        this.canvas.innerHTML = '';
        if (this.components.length === 0) {
            this.canvas.innerHTML = '<p class="text-muted text-center">Kéo các thành phần từ Hộp công cụ vào đây</p>';
        } else {
            this.components.forEach(comp => this.canvas.appendChild(this.createComponentElement(comp)));
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
        
        wrapper.innerHTML = `<div class="d-flex justify-content-between align-items-start"><div class="pe-4"><div class="component-label"><i class="bi ${def.icon} me-2"></i>${component.config.label || def.name}</div><div class="component-type">${component.config.dataField || `ID: ${component.id}`}</div></div><div class="component-actions btn-group"><button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button></div></div>`;
        
        if (def.isContainer && !def.hasTabs && component.config.controls) {
            const containerDiv = document.createElement('div');
            containerDiv.className = 'component-container mt-3 p-3 border rounded bg-body-secondary';
            component.config.controls.forEach(child => containerDiv.appendChild(this.createComponentElement(child)));
            this.makeSortable(containerDiv, component.config.controls);
            wrapper.appendChild(containerDiv);
        }

        if (def.hasTabs) {
            const tabContainer = document.createElement('div');
            tabContainer.className = 'mt-3';
            const nav = document.createElement('ul');
            nav.className = 'nav nav-tabs';
            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content';
            
            (component.config.tabs || []).forEach((tab, index) => {
                const isActive = index === (component.config.activeTabIndex || 0);
                
                const navItem = document.createElement('li');
                navItem.className = 'nav-item';
                const navLink = document.createElement('button');
                navLink.className = `nav-link ${isActive ? 'active' : ''}`;
                navLink.textContent = tab.title;

                const pane = document.createElement('div');
                pane.className = `tab-pane fade component-container border border-top-0 rounded-bottom bg-body-secondary p-3 ${isActive ? 'show active' : ''}`;
                pane.style.minHeight = '50px';

                navLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); 
                    this.updateComponentConfig(component.id, 'activeTabIndex', index);
                });
                
                navItem.appendChild(navLink);
                nav.appendChild(navItem);
                
                (tab.controls || []).forEach(child => pane.appendChild(this.createComponentElement(child)));
                this.makeSortable(pane, tab.controls);
                tabContent.appendChild(pane);
            });

            tabContainer.appendChild(nav);
            tabContainer.appendChild(tabContent);
            wrapper.appendChild(tabContainer);
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
             tabTriggerEl.addEventListener('click', event => {
                event.preventDefault();
                tab.show();
             });
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
        
        if (prop === 'fields') {
            const fieldTypes = `<option value="text">Text</option><option value="number">Number</option><option value="password">Password</option>`;
            let fieldsHtml = (value || []).map((field, i) => `
                <div class="repeater-field-row" data-index="${i}">
                    <input type="text" class="form-control form-control-sm" placeholder="Label" data-field-prop="label" value="${field.label || ''}">
                    <input type="text" class="form-control form-control-sm" placeholder="Data Field" data-field-prop="dataField" value="${field.dataField || ''}">
                    <select class="form-select form-select-sm" data-field-prop="type">${fieldTypes.replace(`value="${field.type}"`, `value="${field.type}" selected`)}</select>
                    <input type="text" class="form-control form-control-sm" placeholder="Placeholder" data-field-prop="placeholder" value="${field.placeholder || ''}">
                    <button class="btn btn-outline-danger btn-sm btn-remove-field" type="button">✖</button>
                </div>`).join('');
            inputHtml = `
                <div class="fields-builder">
                    <div class="repeater-field-header">
                        <label>Label</label>
                        <label>Data Field</label>
                        <label>Type</label>
                        <label>Placeholder</label>
                    </div>
                    ${fieldsHtml}
                </div>
                <button class="btn btn-sm btn-outline-primary w-100 mt-1 btn-add-field">+ Thêm Field</button>`;
        } else if (prop === 'tabs') {
            let tabsHtml = (value || []).map((tab, i) => `
                <div class="input-group input-group-sm mb-1" data-index="${i}">
                    <input type="text" class="form-control" placeholder="Tab Title" data-tab-prop="title" value="${tab.title || ''}">
                    <button class="btn btn-outline-danger btn-sm btn-remove-tab" type="button">✖</button>
                </div>`).join('');
            inputHtml = `<div class="tabs-builder">${tabsHtml}</div><button class="btn btn-sm btn-outline-primary w-100 mt-1 btn-add-tab">+ Thêm Tab</button>`;
        } else if (prop === 'visibleWhen') {
            const vw = value || {};
            const allFields = this.getAllFields(component.id);
            const optionsHtml = allFields.map(f => `<option value="${f.value}" ${f.value === vw.dataField ? 'selected' : ''}>${f.text}</option>`).join('');
            inputHtml = `<div class="visible-when-builder p-2 border rounded bg-white"><div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="vw-enabled-${component.id}" ${value ? 'checked' : ''}><label class="form-check-label" for="vw-enabled-${component.id}">Bật điều kiện hiển thị</label></div><div class="vw-controls ${value ? '' : 'd-none'}"><label class="form-label small">Khi trường</label><select class="form-select form-select-sm mb-1" data-vw-prop="dataField"><option value="">-- Chọn trường --</option>${optionsHtml}</select><label class="form-label small">có giá trị</label><input type="text" class="form-control form-control-sm" data-vw-prop="is" value="${vw.is || ''}" placeholder="ví dụ: bearer"></div></div>`;
        } else if (prop === 'options') {
            let optionsHtml = (value || []).map((opt, i) => `<div class="input-group input-group-sm mb-1" data-index="${i}"><input type="text" class="form-control" placeholder="Text" data-opt-prop="text" value="${opt.text || ''}"><input type="text" class="form-control" placeholder="Value" data-opt-prop="value" value="${opt.value || ''}"><button class="btn btn-outline-danger btn-sm btn-remove-option" type="button">✖</button></div>`).join('');
            inputHtml = `<div class="options-builder">${optionsHtml}</div><button class="btn btn-sm btn-outline-primary w-100 mt-1 btn-add-option">+ Thêm lựa chọn</button>`;
        } else {
             const type = (prop === 'col' || prop === 'rows') ? 'number' : 'text';
             const isCheck = (prop === 'variablePicker' || prop === 'onChange');
             if(isCheck) inputHtml = `<div class="form-check"><input class="form-check-input" type="checkbox" data-prop="${prop}" ${value ? 'checked' : ''}></div>`;
             else inputHtml = `<input type="${type}" class="form-control form-control-sm" data-prop="${prop}" value="${value || ''}">`;
        }
        
        wrapper.innerHTML = `<label class="form-label">${propName}</label>${inputHtml}`;
        
        const fieldsBuilder = wrapper.querySelector('.fields-builder');
        if (fieldsBuilder) {
            wrapper.querySelector('.btn-add-field').addEventListener('click', () => {
                const newFields = [...(component.config.fields || []), { type: 'text', dataField: '', placeholder: '', label: '' }];
                this.updateComponentConfig(component.id, 'fields', newFields);
                this.renderPropertiesPanel();
            });
            fieldsBuilder.addEventListener('click', e => {
                 if(e.target.classList.contains('btn-remove-field')) {
                    const index = parseInt(e.target.closest('.repeater-field-row').dataset.index, 10);
                    const currentFields = component.config.fields || [];
                    currentFields.splice(index, 1);
                    this.updateComponentConfig(component.id, 'fields', currentFields);
                    this.renderPropertiesPanel();
                 }
            });
            fieldsBuilder.querySelectorAll('input, select').forEach(input => input.addEventListener('input', e => {
                 const index = parseInt(e.target.closest('.repeater-field-row').dataset.index, 10);
                 const prop = e.target.dataset.fieldProp;
                 const currentFields = [...(component.config.fields || [])];
                 currentFields[index][prop] = e.target.value;
                 this.updateComponentConfig(component.id, 'fields', currentFields);
            }));
        }

        const tabsBuilder = wrapper.querySelector('.tabs-builder');
        if (tabsBuilder) {
            wrapper.querySelector('.btn-add-tab').addEventListener('click', () => {
                const newTabs = [...(component.config.tabs || []), { title: `Tab ${component.config.tabs.length + 1}`, controls: [] }];
                this.updateComponentConfig(component.id, 'tabs', newTabs);
                this.renderPropertiesPanel();
            });
            tabsBuilder.addEventListener('click', e => {
                 if(e.target.classList.contains('btn-remove-tab')) {
                    const index = parseInt(e.target.parentElement.dataset.index, 10);
                    const currentTabs = component.config.tabs || [];
                    currentTabs.splice(index, 1);
                    this.updateComponentConfig(component.id, 'tabs', currentTabs);
                    this.renderPropertiesPanel();
                 }
            });
            tabsBuilder.querySelectorAll('input').forEach(input => input.addEventListener('input', e => {
                 const index = parseInt(e.target.parentElement.dataset.index, 10);
                 const prop = e.target.dataset.tabProp;
                 const currentTabs = [...(component.config.tabs || [])];
                 currentTabs[index][prop] = e.target.value;
                 this.updateComponentConfig(component.id, 'tabs', currentTabs);
            }));
        }
        
        const vwBuilder = wrapper.querySelector('.visible-when-builder');
        if (vwBuilder) {
            const enabledSwitch = vwBuilder.querySelector('.form-check-input');
            const controls = vwBuilder.querySelector('.vw-controls');
            enabledSwitch.addEventListener('change', () => {
                controls.classList.toggle('d-none', !enabledSwitch.checked);
                this.updateComponentConfig(component.id, 'visibleWhen', enabledSwitch.checked ? { dataField: '', is: '' } : undefined);
                this.renderPropertiesPanel();
            });
            controls.querySelectorAll('input, select').forEach(input => input.addEventListener('input', () => {
                const newVw = { dataField: controls.querySelector('[data-vw-prop="dataField"]').value, is: controls.querySelector('[data-vw-prop="is"]').value };
                this.updateComponentConfig(component.id, 'visibleWhen', newVw);
            }));
        }
        
        const optionsBuilder = wrapper.querySelector('.options-builder');
        if (optionsBuilder) {
            wrapper.querySelector('.btn-add-option').addEventListener('click', () => {
                this.updateComponentConfig(component.id, 'options', [...(component.config.options || []), { text: '', value: '' }]);
                this.renderPropertiesPanel();
            });
            optionsBuilder.addEventListener('click', e => {
                 if(e.target.classList.contains('btn-remove-option')) {
                    const index = parseInt(e.target.parentElement.dataset.index, 10);
                    const currentOptions = component.config.options || [];
                    currentOptions.splice(index, 1);
                    this.updateComponentConfig(component.id, 'options', currentOptions);
                    this.renderPropertiesPanel();
                 }
            });
            optionsBuilder.querySelectorAll('input').forEach(input => input.addEventListener('input', e => {
                 const index = parseInt(e.target.parentElement.dataset.index, 10);
                 const prop = e.target.dataset.optProp;
                 const currentOptions = [...(component.config.options || [])];
                 currentTabs[index][prop] = e.target.value;
                 this.updateComponentConfig(component.id, 'options', currentOptions);
            }));
        }

        wrapper.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('input', e => {
            this.updateComponentConfig(component.id, e.target.dataset.prop, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
        }));
        return wrapper;
    }
    
    // --- State Update and Action Functions ---
    selectComponent(id) {
        if (this.selectedComponentId === id) return;
        this.selectedComponentId = id;
        document.querySelectorAll('.canvas-component').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
        this.renderPropertiesPanel();
    }

    updateComponentConfig(id, prop, value) {
        const component = this.findComponent(id);
        if (!component) return;

        try {
            if (prop === 'options' && typeof value === 'string' && value.trim().startsWith('[')) {
                component.config[prop] = JSON.parse(value);
            } else if (['col', 'rows', 'activeTabIndex'].includes(prop) && value !== '') {
                component.config[prop] = parseInt(value, 10);
            } else if (value === '' || value === false) {
                 delete component.config[prop];
            } else {
                component.config[prop] = value;
            }
        } catch (e) { /* Ignore JSON errors */ }
        
        const componentElement = this.canvas.querySelector(`.canvas-component[data-id="${id}"]`);
        if (componentElement) {
            const def = this.CONTROL_DEFINITIONS[component.type];
            const labelEl = componentElement.querySelector('.component-label');
            const typeEl = componentElement.querySelector('.component-type');
            if (labelEl) labelEl.innerHTML = `<i class="bi ${def.icon} me-2"></i>${component.config.label || def.name}`;
            if (typeEl) typeEl.textContent = component.config.dataField || `ID: ${id}`;
        }
        this.renderCanvas();
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

    generateOutput() {
        if (this.components.length === 0) return alert('Chưa có thành phần nào trên vùng làm việc!');
        const finalConfig = this.components.map(c => c.config);
        this.outputCode.textContent = JSON.stringify(finalConfig, null, 4);
        this.outputModal.show();
    }
    
    copyOutputToClipboard() {
        navigator.clipboard.writeText(this.outputCode.textContent).then(() => {
            this.copyCodeBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Đã copy!';
            setTimeout(() => this.copyCodeBtn.innerHTML = '<i class="bi bi-clipboard me-1"></i> Copy Code', 2000);
        });
    }
}