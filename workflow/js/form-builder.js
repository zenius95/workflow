document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('form-builder-modal')) return;

    // --- DOM Elements ---
    const palette = document.getElementById('component-palette');
    const canvas = document.getElementById('canvas');
    const propertiesPanel = document.getElementById('properties-panel');
    const generateBtn = document.getElementById('generate-btn');
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    const outputModal = new bootstrap.Modal(document.getElementById('output-modal'));
    const outputCode = document.getElementById('output-code');
    const copyCodeBtn = document.getElementById('copy-code-btn');

    // --- State ---
    let components = [];
    let selectedComponentId = null;
    let nextId = 1;

    // --- Definitions ---
    const CONTROL_DEFINITIONS = {
        'text': { name: 'Text Input', icon: 'bi-input-cursor-text', props: ['label', 'dataField', 'placeholder', 'helpText', 'variablePicker', 'col', 'visibleWhen'] },
        'number': { name: 'Number Input', icon: 'bi-hash', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
        'password': { name: 'Password Input', icon: 'bi-key', props: ['label', 'dataField', 'placeholder', 'col', 'visibleWhen'] },
        'textarea': { name: 'Textarea', icon: 'bi-textarea-resize', props: ['label', 'dataField', 'rows', 'placeholder', 'variablePicker', 'visibleWhen'] },
        'select': { name: 'Select (Dropdown)', icon: 'bi-menu-button-wide', props: ['label', 'dataField', 'options', 'onChange', 'col', 'visibleWhen'] },
        'group': { name: 'Group', icon: 'bi-collection', props: ['visibleWhen'], isContainer: true },
        'tabs': { name: 'Tabs', icon: 'bi-segmented-nav', props: [], isContainer: true, hasTabs: true },
        'repeater': { name: 'Repeater', icon: 'bi-plus-slash-minus', props: ['dataField', 'addButtonText'], isContainer: true, hasFields: true },
        'button': { name: 'Button', icon: 'bi-hand-index-thumb', props: ['text', 'action', 'class'] },
        'info': { name: 'Info Text', icon: 'bi-info-circle', props: ['text'] },
    };

    // --- Helper Functions ---

    function findComponent(id, componentArray = components) {
        for (const comp of componentArray) {
            if (comp.id === id) return comp;
            if (CONTROL_DEFINITIONS[comp.type].isContainer) {
                const found = findComponent(id, comp.config.controls || []);
                if (found) return found;
            }
            if (CONTROL_DEFINITIONS[comp.type].hasTabs) {
                 for (const tab of comp.config.tabs) {
                    const found = findComponent(id, tab.controls || []);
                    if (found) return found;
                }
            }
        }
        return null;
    }

    function getComponentPath(id, componentArray = components) {
        for (let i = 0; i < componentArray.length; i++) {
            const comp = componentArray[i];
            if (comp.id === id) return { parent: componentArray, index: i };
            if (CONTROL_DEFINITIONS[comp.type].isContainer) {
                const result = getComponentPath(id, comp.config.controls);
                if (result) return result;
            }
            if (CONTROL_DEFINITIONS[comp.type].hasTabs) {
                for (const tab of comp.config.tabs) {
                    const result = getComponentPath(id, tab.controls);
                    if (result) return result;
                }
            }
        }
        return null;
    }

    function getAllFields(excludeId, componentArray = components) {
        let fields = [];
        componentArray.forEach(comp => {
            if (comp.id !== excludeId && comp.config.dataField) {
                fields.push({ text: `${comp.config.label || comp.type} (${comp.config.dataField})`, value: comp.config.dataField });
            }
            if (CONTROL_DEFINITIONS[comp.type].isContainer) {
                fields = fields.concat(getAllFields(excludeId, comp.config.controls || []));
            }
            if (CONTROL_DEFINITIONS[comp.type].hasTabs) {
                (comp.config.tabs || []).forEach(tab => fields = fields.concat(getAllFields(excludeId, tab.controls || [])));
            }
        });
        return fields;
    }

    // --- Main Functions ---

    function initialize() {
        renderPalette();
        setupDragAndDrop();
        generateBtn.addEventListener('click', generateOutput);
        clearCanvasBtn.addEventListener('click', clearCanvas);
        copyCodeBtn.addEventListener('click', copyOutputToClipboard);
        renderCanvas();
    }

    function renderPalette() {
        palette.innerHTML = '';
        Object.entries(CONTROL_DEFINITIONS).forEach(([type, def]) => {
            const item = document.createElement('div');
            item.className = 'palette-item p-2 mb-2 rounded d-flex align-items-center gap-2';
            item.dataset.type = type;
            item.innerHTML = `<i class="bi ${def.icon}"></i> <span>${def.name}</span>`;
            palette.appendChild(item);
        });
    }

    function setupDragAndDrop() {
        new Sortable(palette, { group: { name: 'builder', pull: 'clone', put: false }, sort: false });
        makeSortable(canvas, components);
    }

    function makeSortable(containerElement, group) {
        new Sortable(containerElement, {
            group: 'builder', animation: 150,
            onAdd: (evt) => {
                const type = evt.item.dataset.type;
                const newComponent = createComponent(type);
                evt.item.remove();
                group.splice(evt.newIndex, 0, newComponent);
                renderCanvas();
                selectComponent(newComponent.id);
            },
            onUpdate: (evt) => {
                const movedItem = group.splice(evt.oldIndex, 1)[0];
                group.splice(evt.newIndex, 0, movedItem);
                renderCanvas();
            }
        });
    }

    function createComponent(type) {
        const id = `comp-${nextId++}`;
        const def = CONTROL_DEFINITIONS[type];
        const component = { id, type, config: { type } };
        if (def.props.includes('dataField')) component.config.dataField = `field_${nextId}`;
        if (def.props.includes('label')) component.config.label = def.name;
        if (type === 'tabs') component.config.tabs = [{ title: 'Tab 1', active: true, controls: [] }];
        if (type === 'repeater') component.config.fields = [{ type: 'text', dataField: 'key' }];
        if (def.isContainer) component.config.controls = component.config.controls || [];
        return component;
    }
    
    // --- Rendering Functions ---

    function renderCanvas() {
        canvas.innerHTML = '';
        if (components.length === 0) {
            canvas.innerHTML = '<p class="text-muted text-center">Kéo các thành phần từ Hộp công cụ vào đây</p>';
        } else {
            components.forEach(comp => canvas.appendChild(createComponentElement(comp)));
        }
        renderPropertiesPanel();
    }

    function createComponentElement(component) {
        const def = CONTROL_DEFINITIONS[component.type];
        const wrapper = document.createElement('div');
        wrapper.className = 'canvas-component p-3 mb-2 rounded';
        wrapper.dataset.id = component.id;
        if (component.id === selectedComponentId) wrapper.classList.add('selected');
        
        wrapper.innerHTML = `<div class="d-flex justify-content-between align-items-start"><div class="pe-4"><div class="component-label"><i class="bi ${def.icon} me-2"></i>${component.config.label || def.name}</div><div class="component-type">${component.config.dataField || `ID: ${component.id}`}</div></div><div class="component-actions btn-group"><button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button></div></div>`;
        
        if (def.isContainer && component.config.controls) {
            const containerDiv = document.createElement('div');
            containerDiv.className = 'component-container mt-3 p-3 border rounded bg-body-secondary';
            component.config.controls.forEach(child => containerDiv.appendChild(createComponentElement(child)));
            makeSortable(containerDiv, component.config.controls);
            wrapper.appendChild(containerDiv);
        }

        if (def.hasTabs) {
            const tabContainer = document.createElement('div');
            tabContainer.className = 'mt-3';
            const nav = document.createElement('ul');
            nav.className = 'nav nav-tabs';
            const tabContent = document.createElement('div');
            tabContent.className = 'tab-content border border-top-0 p-3';
            (component.config.tabs || []).forEach((tab, index) => {
                const isActive = index === 0;
                nav.innerHTML += `<li class="nav-item"><button class="nav-link ${isActive ? 'active' : ''}">${tab.title}</button></li>`;
                const pane = document.createElement('div');
                pane.className = `tab-pane fade ${isActive ? 'show active' : ''}`;
                (tab.controls || []).forEach(child => pane.appendChild(createComponentElement(child)));
                makeSortable(pane, tab.controls);
                tabContent.appendChild(pane);
            });
            tabContainer.appendChild(nav);
            tabContainer.appendChild(tabContent);
            wrapper.appendChild(tabContainer);
        }

        wrapper.addEventListener('click', e => {
            e.stopPropagation();
            if (e.target.closest('.btn-delete')) deleteComponent(component.id);
            else selectComponent(component.id);
        });
        return wrapper;
    }
    
    function renderPropertiesPanel() {
        propertiesPanel.innerHTML = '';
        const component = findComponent(selectedComponentId);
        if (!component) {
            propertiesPanel.innerHTML = '<p class="text-muted p-3">Chưa có thành phần nào được chọn.</p>';
            return;
        }

        const def = CONTROL_DEFINITIONS[component.type];
        def.props.forEach(prop => propertiesPanel.appendChild(createPropertyInput(component, prop)));
    }
    
    function createPropertyInput(component, prop) {
        const value = component.config[prop];
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3 prop-wrapper';
        const propName = prop.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        
        let inputHtml = '';
        if (prop === 'visibleWhen') {
            const vw = value || {};
            const allFields = getAllFields(component.id);
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
        
        const vwBuilder = wrapper.querySelector('.visible-when-builder');
        if (vwBuilder) {
            const enabledSwitch = vwBuilder.querySelector('.form-check-input');
            const controls = vwBuilder.querySelector('.vw-controls');
            enabledSwitch.addEventListener('change', () => {
                controls.classList.toggle('d-none', !enabledSwitch.checked);
                updateComponentConfig(component.id, 'visibleWhen', enabledSwitch.checked ? { dataField: '', is: '' } : undefined);
                renderPropertiesPanel();
            });
            controls.querySelectorAll('input, select').forEach(input => input.addEventListener('input', () => {
                const newVw = { dataField: controls.querySelector('[data-vw-prop="dataField"]').value, is: controls.querySelector('[data-vw-prop="is"]').value };
                updateComponentConfig(component.id, 'visibleWhen', newVw);
            }));
        }
        
        const optionsBuilder = wrapper.querySelector('.options-builder');
        if (optionsBuilder) {
            wrapper.querySelector('.btn-add-option').addEventListener('click', () => {
                updateComponentConfig(component.id, 'options', [...(component.config.options || []), { text: '', value: '' }]);
                renderPropertiesPanel();
            });
            optionsBuilder.addEventListener('click', e => {
                 if(e.target.classList.contains('btn-remove-option')) {
                    const index = parseInt(e.target.parentElement.dataset.index, 10);
                    const currentOptions = component.config.options || [];
                    currentOptions.splice(index, 1);
                    updateComponentConfig(component.id, 'options', currentOptions);
                    renderPropertiesPanel();
                 }
            });
            optionsBuilder.querySelectorAll('input').forEach(input => input.addEventListener('input', e => {
                 const index = parseInt(e.target.parentElement.dataset.index, 10);
                 const prop = e.target.dataset.optProp;
                 const currentOptions = [...(component.config.options || [])];
                 currentOptions[index][prop] = e.target.value;
                 updateComponentConfig(component.id, 'options', currentOptions);
            }));
        }

        wrapper.querySelectorAll('[data-prop]').forEach(input => input.addEventListener('input', e => {
            updateComponentConfig(component.id, e.target.dataset.prop, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
        }));
        return wrapper;
    }
    
    // --- State Update and Action Functions ---

    function selectComponent(id) {
        if (selectedComponentId === id) return;
        selectedComponentId = id;
        document.querySelectorAll('.canvas-component').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
        renderPropertiesPanel();
    }

    function updateComponentConfig(id, prop, value) {
        const component = findComponent(id);
        if (!component) return;

        try {
            if (prop === 'options' && typeof value === 'string' && value.trim().startsWith('[')) {
                component.config[prop] = JSON.parse(value);
            } else if (['col', 'rows'].includes(prop) && value !== '') {
                component.config[prop] = parseInt(value, 10);
            } else if (value === '' || value === false) {
                 delete component.config[prop];
            } else {
                component.config[prop] = value;
            }
        } catch (e) { /* Ignore JSON errors */ }
        
        const componentElement = canvas.querySelector(`.canvas-component[data-id="${id}"]`);
        if (componentElement) {
            const def = CONTROL_DEFINITIONS[component.type];
            const labelEl = componentElement.querySelector('.component-label');
            const typeEl = componentElement.querySelector('.component-type');
            if (labelEl) labelEl.innerHTML = `<i class="bi ${def.icon} me-2"></i>${component.config.label || def.name}`;
            if (typeEl) typeEl.textContent = component.config.dataField || `ID: ${component.id}`;
        }
    }
    
    function deleteComponent(id) {
        const path = getComponentPath(id);
        if (path) {
            path.parent.splice(path.index, 1);
            if (selectedComponentId === id) selectedComponentId = null;
            renderCanvas();
        }
    }
    
    function clearCanvas() {
        if (confirm('Sếp có chắc muốn xóa toàn bộ form không?')) {
            components = [];
            selectedComponentId = null;
            renderCanvas();
            makeSortable(canvas, components);
        }
    }

    function generateOutput() {
        if (components.length === 0) return alert('Chưa có thành phần nào trên vùng làm việc!');
        const finalConfig = components.map(c => c.config);
        outputCode.textContent = JSON.stringify(finalConfig, null, 4);
        outputModal.show();
    }
    
    function copyOutputToClipboard() {
        navigator.clipboard.writeText(outputCode.textContent).then(() => {
            copyCodeBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i> Đã copy!';
            setTimeout(() => copyCodeBtn.innerHTML = '<i class="bi bi-clipboard me-1"></i> Copy Code', 2000);
        });
    }

    initialize();
});