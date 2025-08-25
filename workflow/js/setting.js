/**
 * Renders node settings UI from a configuration object and handles its events.
 */

class SettingsRenderer {
    constructor(workflowInstance) {
        this.workflow = workflowInstance;
        this.dialog = (typeof window !== 'undefined' && window.api && window.api.showOpenDialog);
    }

    renderAndBind(settingsConfig, uniqueId, dataObject, nodeConfig = {}) {
        const container = document.createElement('div');
        const row = document.createElement('div');
        row.className = 'row g-2';
        
        settingsConfig.forEach(control => {
            const controlEl = this._renderControl(control, uniqueId, dataObject, nodeConfig);
            if (controlEl) row.appendChild(controlEl);
        });

        container.appendChild(row);
        this._bindListeners(container, dataObject, nodeConfig, settingsConfig);
        return container;
    }

    _renderControl(control, uniqueId, dataObject, nodeConfig) {
        const actualControl = control.config ? control.config : control;

        if (actualControl.visibleWhen) {
            const value = this.workflow._getProperty(dataObject, actualControl.visibleWhen.dataField);
            if (String(value) !== String(actualControl.visibleWhen.is)) return null;
        }

        const lang = i18n.currentLanguage;
        const nodeLocale = nodeConfig?.locales?.[lang]?.settings || {};

        const colWrapper = document.createElement('div');
        colWrapper.className = actualControl.col ? `col-md-${actualControl.col}` : 'col-12';
        if (control.parentLayout) colWrapper.className = 'layout-item-wrapper';

        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3';

        const labelText = nodeLocale[actualControl.labelKey] || actualControl.label;
        if (labelText) {
            const label = document.createElement('label');
            label.className = 'form-label fw-semibold small';
            label.textContent = labelText;
            wrapper.appendChild(label);
        }

        let element;
        switch (actualControl.type) {
            case 'text': case 'number': case 'password':
                element = this._renderInput(actualControl, uniqueId, dataObject, nodeLocale); break;
            case 'textarea': element = this._renderTextarea(actualControl, uniqueId, dataObject, nodeLocale); break;
            case 'select': element = this._renderSelect(actualControl, uniqueId, dataObject, nodeLocale); break;
            case 'file-select': element = this._renderFileSelect(actualControl, uniqueId, dataObject); break;
            case 'folder-select': element = this._renderFolderSelect(actualControl, uniqueId, dataObject); break;
            case 'tabs': element = this._renderTabs(actualControl, uniqueId, dataObject, nodeLocale, nodeConfig); break;
            case 'repeater': element = this._renderRepeater(actualControl, uniqueId, dataObject, nodeConfig); break;
            case 'group': element = this._renderGroup(actualControl, uniqueId, dataObject, nodeConfig); break;
            case 'condition-builder':
                element = this._renderConditionBuilder(actualControl, uniqueId, dataObject); break;
            case 'json-builder':
                element = this._renderJsonBuilder(actualControl, uniqueId, dataObject); break;
            case 'button':
            case 'output-display':
            case 'info':
                element = this._renderSpecialType(actualControl, nodeLocale); break;
            default: return null;
        }
        
        wrapper.appendChild(element);
        
        const helpText = nodeLocale[actualControl.helpTextKey] || actualControl.helpText;
        if (helpText) {
            const help = document.createElement('div');
            help.className = 'form-text';
            help.innerHTML = helpText; // Use innerHTML to allow for simple formatting
            wrapper.appendChild(help);
        }
        
        colWrapper.appendChild(wrapper);
        return colWrapper;
    }

    _bindListeners(container, dataObject, nodeConfig, settingsConfig) {
        container.querySelectorAll('[data-field]').forEach(input => {
            input.addEventListener('input', (e) => {
                const newValue = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                const oldValue = this.workflow._getProperty(dataObject, input.dataset.field);

                if (oldValue !== newValue) {
                    this.workflow._setProperty(dataObject, input.dataset.field, newValue);
                    const controlConfig = this._findControlConfig(settingsConfig, input.dataset.field);
                    if (controlConfig && controlConfig.onChange === 'rerender') {
                        this.workflow._updateSettingsPanel();
                    }
                    this.workflow._commitState(i18n.get('settings.state_commit.settings_edit'));
                }
            });
        });

        container.querySelectorAll('.variable-picker-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetInputId = e.currentTarget.dataset.targetInput;
                const targetInput = document.getElementById(targetInputId);
                this.workflow._showVariablePicker(targetInput, e.currentTarget);
            });
        });
        
        const setupFileHandler = (action, handler) => {
            container.querySelectorAll(`[data-action="${action}"]`).forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetInput = document.getElementById(e.currentTarget.dataset.targetInput);
                    handler.call(this, targetInput);
                });
            });
        };
        setupFileHandler('select-file', this.handleFileSelect);
        setupFileHandler('select-folder', this.handleFolderSelect);
        
        container.querySelectorAll('[data-action="add-repeater-item"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const dataField = e.currentTarget.dataset.field;
                if (!dataField) return;

                const findRepeaterConfig = (settingsConfig, targetDataField) => {
                    // Hàm đệ quy để duyệt qua cây cấu hình và tìm repeater khớp với đường dẫn.
                    function find(currentControls, path) {
                        for (const control of currentControls) {
                            const config = control.config || control;
                            const configField = config.dataField;

                            // TRƯỜNG HỢP 1: Control là một container không có dataField (ví dụ: Tabs, Group).
                            // Chúng ta cần tìm kiếm sâu hơn vào các control con của nó.
                            if (!configField) {
                                let found = null;
                                // Tìm trong các tab.
                                if (config.tabs) {
                                    for (const tab of config.tabs) {
                                        found = find(tab.controls, path);
                                        if (found) return found;
                                    }
                                }
                                // Tìm trong các control con (của Group).
                                const children = config.controls || config.fields;
                                if (children) {
                                    found = find(children, path);
                                    if (found) return found;
                                }
                                // Chuyển sang control tiếp theo nếu không tìm thấy.
                                continue;
                            }

                            // TRƯỜNG HỢP 2: Tìm thấy repeater khớp chính xác với đường dẫn.
                            // Ví dụ: configField là "headers" và path cũng là "headers".
                            if (configField === path) {
                                return config;
                            }

                            // TRƯỜNG HỢP 3: Tìm thấy một repeater cha.
                            // Ví dụ: configField là "parent" và path là "parent.0.child".
                            // Điều kiện `startsWith` sẽ đúng.
                            if (path.startsWith(configField + '.')) {
                                const children = config.controls || config.fields;
                                if (children) {
                                    // Tạo đường dẫn mới cho repeater con cần tìm.
                                    // Ví dụ: "parent.0.child" -> "child".
                                    const remainingPath = path.substring(configField.length + 1).split('.').slice(1).join('.');
                                    if (remainingPath) {
                                        const found = find(children, remainingPath);
                                        if (found) return found;
                                    }
                                }
                            }
                        }
                        // Không tìm thấy trong lần duyệt này.
                        return null;
                    }

                    return find(settingsConfig, targetDataField);
                };

                const repeaterConfig = findRepeaterConfig(settingsConfig, dataField);
                const repeaterFields = repeaterConfig ? (repeaterConfig.fields || repeaterConfig.controls) : null;
                if (!repeaterConfig || !repeaterFields) {
                    console.error('Could not find repeater config for dataField:', dataField);
                    return;
                }

                const newItem = {};
                repeaterFields.forEach(fieldSource => {
                    const field = fieldSource.config ? fieldSource.config : fieldSource;
                    if(field.dataField) {
                        // For nested repeaters or groups, initialize their data as an empty array/object
                        if (field.isContainer && field.type === 'repeater') {
                            newItem[field.dataField] = [];
                        } else if (field.isContainer && field.type === 'group') {
                            newItem[field.dataField] = {}; // Or handle based on group's structure
                        } else {
                            newItem[field.dataField] = field.defaultValue || '';
                        }
                    }
                });

                const items = this.workflow._getProperty(dataObject, dataField) || [];
                items.push(newItem);
                this.workflow._setProperty(dataObject, dataField, items);
                
                // This call is for the node settings panel
                this.workflow._updateSettingsPanel();
                // This commit is for the history state
                this.workflow._commitState(i18n.get('settings.state_commit.repeater_add'));
            });
        });

        container.querySelectorAll('[data-action="remove-repeater-item"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const dataField = e.currentTarget.dataset.field;
                const index = parseInt(e.currentTarget.dataset.index, 10);
                if (!dataField || isNaN(index)) return;

                const items = this.workflow._getProperty(dataObject, dataField);
                if (Array.isArray(items)) {
                    items.splice(index, 1);
                    this.workflow._updateSettingsPanel();
                    this.workflow._commitState(i18n.get('settings.state_commit.repeater_remove'));
                }
            });
        });

        container.querySelectorAll('[data-action="import-curl"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.workflow.curlImportModal) {
                    document.getElementById('curl-input-textarea').value = '';
                    const processBtn = document.getElementById('process-curl-import-btn');
                    const newProcessBtn = processBtn.cloneNode(true);
                    processBtn.parentNode.replaceChild(newProcessBtn, processBtn);
                    newProcessBtn.addEventListener('click', () => this.workflow._handleProcessCurlImport());
                    this.workflow.curlImportModal.show();
                }
            });
        });
        
        container.querySelectorAll('[data-action="test-data-generation"], [data-action="test-operation"]').forEach(btn => {
            btn.addEventListener('click', (e) => this._handleTestExecution(e));
        });
    }

    _handleTestExecution(e) {
        const node = this.workflow.selectedNodes[0];
        if (!node) return;
        const nodeConfig = this.workflow._findNodeConfig(node.type);
        if (!nodeConfig || !nodeConfig.execute) return;

        const outputContainer = e.target.closest('.row, .custom-layout-grid, .p-3, .prop-wrapper').querySelector('[data-ref="test-output-container"]');
        const action = e.target.closest('[data-action]').dataset.action;
        
        if (outputContainer) {
            outputContainer.textContent = action === 'test-data-generation' ? i18n.get('settings.controls.test_generating') : i18n.get('settings.controls.test_processing');
        }

        const mockLogger = {
            info: (m) => console.log('[TEST INFO]', m),
            success: (m) => console.log('[TEST SUCCESS]', m),
            error: (m) => console.log('[TEST ERROR]', m),
        };

        const resolvedData = JSON.parse(JSON.stringify(node.data));
        const resolutionContext = { global: this.workflow.globalVariables, form: this.workflow.formData, ...this.workflow.executionState };
        
        const resolveRecursively = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                     obj[key] = this.workflow._resolveVariables(obj[key], resolutionContext);
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    resolveRecursively(obj[key]);
                }
            }
        };
        resolveRecursively(resolvedData);

        (async () => {
            try {
                const result = await nodeConfig.execute(resolvedData, mockLogger, this.workflow);
                if (outputContainer) {
                    outputContainer.textContent = JSON.stringify(result, null, 2);
                }
            } catch (error) {
                if (outputContainer) {
                    outputContainer.textContent = i18n.get('settings.controls.test_error', { message: error.message });
                }
                console.error(error);
            }
        })();
    }

     _renderSpecialType(control, nodeLocale) {
        switch (control.type) {
            case 'button':            return this._renderButton(control, nodeLocale);
            case 'output-display':    return this._renderOutputDisplay(control, nodeLocale);
            case 'info':              
                const infoP = document.createElement('p');
                infoP.className = 'text-muted small fst-italic';
                infoP.innerHTML = nodeLocale[control.textKey] || control.text;
                return infoP;
            default: return null;
        }
    }

    _createSafeId(uniqueId, control) {
        const safePart = (control.dataField || `${control.type}-${Math.random().toString(36).slice(2)}`).replace(/[.\[\]]/g, '-');
        return `settings-${uniqueId}-${safePart}`;
    }

    _renderInput(control, uniqueId, dataObject, nodeLocale) {
        const id = this._createSafeId(uniqueId, control);
        const value = this.workflow._getProperty(dataObject, control.dataField) || '';
        const placeholder = nodeLocale[control.placeholderKey] || control.placeholder || '';
        const inputHtml = `<input id="${id}" type="${control.type}" data-field="${control.dataField}" class="form-control form-control-sm" placeholder="${placeholder}" value="${value}">`;
        
        if (control.variablePicker) {
            const group = document.createElement('div');
            group.className = 'input-group input-group-sm';
            group.innerHTML = `${inputHtml}<button class="btn btn-outline-secondary variable-picker-btn" type="button" data-target-input="${id}"><i class="bi bi-braces"></i></button>`;
            return group;
        }
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = inputHtml;
        return tempDiv.firstChild;
    }

    _renderTextarea(control, uniqueId, dataObject, nodeLocale) {
        const id = this._createSafeId(uniqueId, control);
        const value = this.workflow._getProperty(dataObject, control.dataField) || '';
        const placeholder = nodeLocale[control.placeholderKey] || control.placeholder || '';
        const element = document.createElement('textarea');
        element.id = id;
        element.dataset.field = control.dataField;
        element.className = 'form-control form-control-sm';
        if(control.rows) element.rows = control.rows;
        element.placeholder = placeholder;
        element.textContent = value;

        if (control.variablePicker) {
            const group = document.createElement('div');
            group.className = 'input-group input-group-sm';
            group.appendChild(element);
            group.innerHTML += `<button class="btn btn-outline-secondary variable-picker-btn" type="button" data-target-input="${id}"><i class="bi bi-braces"></i></button>`;
            return group;
        }
        return element;
    }

    _renderSelect(control, uniqueId, dataObject, nodeLocale) {
        const select = document.createElement('select');
        select.id = this._createSafeId(uniqueId, control);
        select.dataset.field = control.dataField;
        select.className = 'form-select form-select-sm';
        
        const optionsSource = control.optionsKey ? (nodeLocale[control.optionsKey] || {}) : (control.options || []);

        if (Array.isArray(optionsSource)) {
            optionsSource.forEach(opt => select.add(new Option(opt.text, opt.value)));
        } else if (typeof optionsSource === 'object') {
            Object.entries(optionsSource).forEach(([value, text]) => select.add(new Option(text, value)));
        }

        if (control.optionGroups) {
             control.optionGroups.forEach(groupData => {
                const groupLabel = nodeLocale[groupData.labelKey] || groupData.label;
                const optgroup = document.createElement('optgroup');
                optgroup.label = groupLabel;
                const groupOptions = nodeLocale[groupData.optionsKey] || {};
                Object.entries(groupOptions).forEach(([value, text]) => optgroup.appendChild(new Option(text, value)));
                select.appendChild(optgroup);
            });
        }
        
        select.value = this.workflow._getProperty(dataObject, control.dataField) || '';
        return select;
    }

    _renderFileSelect(control, uniqueId, dataObject) {
        const id = this._createSafeId(uniqueId, control);
        const value = this.workflow._getProperty(dataObject, control.dataField) || '';
        const group = document.createElement('div');
        group.className = 'input-group input-group-sm';
        group.innerHTML = `
            <input id="${id}" type="text" data-field="${control.dataField}" class="form-control" placeholder="${i18n.get('settings.placeholders.no_file_selected')}" value="${value}">
            <button class="btn btn-outline-secondary" type="button" data-action="select-file" data-target-input="${id}" ${!this.dialog ? 'disabled' : ''}>
                <i class="bi bi-file-earmark-text me-1"></i> ${i18n.get('settings.controls.browse')}
            </button>
        `;
        return group;
    }

    _renderFolderSelect(control, uniqueId, dataObject) {
        const id = this._createSafeId(uniqueId, control);
        const value = this.workflow._getProperty(dataObject, control.dataField) || '';
        const group = document.createElement('div');
        group.className = 'input-group input-group-sm';
        group.innerHTML = `
            <input id="${id}" type="text" data-field="${control.dataField}" class="form-control" placeholder="${i18n.get('settings.placeholders.no_folder_selected')}" value="${value}">
            <button class="btn btn-outline-secondary" type="button" data-action="select-folder" data-target-input="${id}" ${!this.dialog ? 'disabled' : ''}>
                <i class="bi bi-folder2-open me-1"></i> ${i18n.get('settings.controls.browse')}
            </button>
        `;
        return group;
    }

    async handleFileSelect(targetInput) {
        const result = await window.api.showOpenDialog({ properties: ['openFile'] });
        if (!result.canceled && result.filePaths.length > 0) {
            targetInput.value = result.filePaths[0];
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async handleFolderSelect(targetInput) {
        const result = await window.api.showOpenDialog({ properties: ['openDirectory'] });
        if (!result.canceled && result.filePaths.length > 0) {
            targetInput.value = result.filePaths[0];
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    _renderTabs(control, uniqueId, dataObject, nodeLocale, nodeConfig) {
        const tabId = `settings-tabs-${uniqueId}`;
        const wrapper = document.createElement('div');
        const nav = document.createElement('ul');
        nav.className = 'nav nav-tabs mb-3';
        nav.setAttribute('role', 'tablist');
        const content = document.createElement('div');
        content.className = 'tab-content';
        control.tabs.forEach((tab, index) => {
            const paneId = `${tabId}-pane-${index}`;
            const activeClass = index === 0 ? 'active' : '';
            const tabTitle = nodeLocale[tab.titleKey] || tab.title;
            nav.innerHTML += `<li class="nav-item" role="presentation"><button class="nav-link ${activeClass}" data-bs-toggle="tab" data-bs-target="#${paneId}" type="button" role="tab">${tabTitle}</button></li>`;
            const pane = document.createElement('div');
            pane.className = `tab-pane fade ${index === 0 ? 'show active' : ''}`;
            pane.id = paneId;
            pane.setAttribute('role', 'tabpanel');
            const row = document.createElement('div');
            row.className = 'row g-2';
            tab.controls.forEach(c => {
                const el = this._renderControl(c, uniqueId, dataObject, nodeConfig);
                if (el) row.appendChild(el);
            });
            pane.appendChild(row);
            content.appendChild(pane);
        });
        wrapper.append(nav, content);
        return wrapper;
    }
    
    _renderGroup(control, uniqueId, dataObject, nodeConfig) {
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'border rounded p-3'; 
        const hasLayout = Array.isArray(control.layoutColumns) && control.layoutColumns.length > 0;
        if (hasLayout) {
            groupWrapper.classList.add('custom-layout-grid');
            groupWrapper.style.gridTemplateColumns = control.layoutColumns.map(c => `${c}fr`).join(' ');
        } else {
            groupWrapper.classList.add('row', 'g-2');
        }
        control.controls.forEach(c => {
            const el = this._renderControl({ ...c, parentLayout: hasLayout }, uniqueId, dataObject, nodeConfig);
            if (el) groupWrapper.appendChild(el);
        });
        return groupWrapper;
    }

    _renderRepeater(control, uniqueId, dataObject, nodeConfig) {
        const wrapper = document.createElement('div');
        const container = document.createElement('div');
        wrapper.appendChild(container);
        const items = this.workflow._getProperty(dataObject, control.dataField) || [];
        const fieldsToRender = control.fields || control.controls || [];
        if (items.length === 0 && fieldsToRender.length === 0 && uniqueId !== 'preview') {
            container.innerHTML = `<p class="text-muted text-center small fst-italic">${i18n.get('settings.controls.no_fields_defined')}</p>`;
        }
        items.forEach((itemData, index) => {
            const itemWrapper = document.createElement('div');
            itemWrapper.className = 'repeater-row d-flex align-items-start gap-2 mb-2 p-2 border rounded';
    
            const fieldsContainer = document.createElement('div');
            fieldsContainer.className = 'row g-2 flex-grow-1';
    
            fieldsToRender.forEach(fieldSource => {
                const fieldConfig = fieldSource.config ? fieldSource.config : fieldSource;
                const fieldPath = `${control.dataField}.${index}.${fieldConfig.dataField}`;
                const el = this._renderControl({ ...fieldConfig, dataField: fieldPath }, uniqueId, dataObject, nodeConfig);
                if (el) fieldsContainer.appendChild(el);
            });
    
            itemWrapper.appendChild(fieldsContainer);
    
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger flex-shrink-0';
            removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
            Object.assign(removeBtn.dataset, { action: 'remove-repeater-item', field: control.dataField, index });
            
            const firstFieldLabel = fieldsContainer.querySelector('.form-label');
            if (firstFieldLabel) {
                const labelStyle = window.getComputedStyle(firstFieldLabel);
                const labelMarginBottom = parseFloat(labelStyle.marginBottom);
                removeBtn.style.marginTop = `${firstFieldLabel.offsetHeight + labelMarginBottom}px`;
            }
    
            itemWrapper.appendChild(removeBtn);
            container.appendChild(itemWrapper);
        });
        const lang = i18n.currentLanguage;
        const buttonText = nodeConfig.locales?.[lang]?.settings?.[control.addButtonTextKey] || control.addButtonText || i18n.get('settings.controls.add_item');
        const addButton = document.createElement('button');
        addButton.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
        addButton.innerHTML = buttonText;
        Object.assign(addButton.dataset, { action: 'add-repeater-item', field: control.dataField });
        wrapper.appendChild(addButton);
        return wrapper;
    }

    _renderConditionBuilder(control, uniqueId, dataObject) {
        const container = document.createElement('div');
        const conditionGroups = this.workflow._getProperty(dataObject, control.dataField) || [];
        const operatorMap = i18n.get('settings.condition_operators');
        const operatorOptions = Object.entries(operatorMap).map(([value, text]) => `<option value="${value}">${text}</option>`).join('');

        conditionGroups.forEach((group, groupIndex) => {
            if (groupIndex > 0) {
                container.innerHTML += `<div class="group-separator">${i18n.get('settings.controls.condition_or')}</div>`;
            }
            const groupDiv = document.createElement('div');
            groupDiv.className = 'condition-group';
            if (conditionGroups.length > 1) {
                const removeGroupBtn = document.createElement('button');
                removeGroupBtn.className = 'btn btn-sm btn-danger rounded-circle remove-group-btn';
                removeGroupBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
                removeGroupBtn.style.cssText = 'width: 24px; height: 24px; line-height: 1;';
                removeGroupBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    conditionGroups.splice(groupIndex, 1);
                    this.workflow._updateSettingsPanel();
                    this.workflow._commitState(i18n.get("settings.state_commit.condition_group_remove"));
                });
                groupDiv.appendChild(removeGroupBtn);
            }
            group.forEach((cond, condIndex) => {
                const row = document.createElement('div');
                row.className = 'condition-row';
                const inputValueId = `${uniqueId}-cond-${groupIndex}-${condIndex}-inputValue`;
                const comparisonValueId = `${uniqueId}-cond-${groupIndex}-${condIndex}-comparisonValue`;
                row.innerHTML = `
                    <div class="input-group input-group-sm">
                        <input type="text" class="form-control" placeholder="${i18n.get('settings.placeholders.input_value')}" value="${cond.inputValue || ''}" data-field="conditionGroups.${groupIndex}.${condIndex}.inputValue" id="${inputValueId}">
                        <button class="btn btn-outline-secondary variable-picker-btn" type="button" data-target-input="${inputValueId}"><i class="bi bi-braces"></i></button>
                    </div>
                    <select class="form-select form-select-sm" data-field="conditionGroups.${groupIndex}.${condIndex}.operator">${operatorOptions}</select>
                    <div class="input-group input-group-sm">
                        <input type="text" class="form-control" placeholder="${i18n.get('settings.placeholders.comparison_value')}" value="${cond.comparisonValue || ''}" data-field="conditionGroups.${groupIndex}.${condIndex}.comparisonValue" id="${comparisonValueId}">
                        <button class="btn btn-outline-secondary variable-picker-btn" type="button" data-target-input="${comparisonValueId}"><i class="bi bi-braces"></i></button>
                    </div>`;
                row.querySelector('select').value = cond.operator;
                const actionBtn = document.createElement('button');
                if (condIndex > 0) {
                    actionBtn.className = 'btn btn-sm btn-outline-danger';
                    actionBtn.innerHTML = '<i class="bi bi-trash"></i>';
                    actionBtn.addEventListener('click', (e) => {
                        e.preventDefault(); group.splice(condIndex, 1);
                        this.workflow._updateSettingsPanel(); this.workflow._commitState(i18n.get("settings.state_commit.condition_remove"));
                    });
                } else {
                    actionBtn.className = 'btn btn-sm btn-outline-primary'; actionBtn.textContent = i18n.get('settings.controls.condition_and');
                    actionBtn.addEventListener('click', (e) => {
                        e.preventDefault(); group.push({ inputValue: '', operator: '==', comparisonValue: '' });
                        this.workflow._updateSettingsPanel(); this.workflow._commitState(i18n.get("settings.state_commit.condition_add"));
                    });
                }
                row.appendChild(actionBtn);
                groupDiv.appendChild(row);
            });
            container.appendChild(groupDiv);
        });
        const addGroupButton = document.createElement('button');
        addGroupButton.className = 'btn btn-sm btn-outline-primary w-100 mt-2';
        addGroupButton.innerHTML = `<i class="bi bi-plus-lg"></i> ${i18n.get('settings.controls.add_rule_group')}`;
        addGroupButton.addEventListener('click', (e) => {
            e.preventDefault();
            conditionGroups.push([{ inputValue: '', operator: '==', comparisonValue: '' }]);
            this.workflow._updateSettingsPanel();
            this.workflow._commitState(i18n.get("settings.state_commit.condition_add"));
        });
        container.appendChild(addGroupButton);
        return container;
    }

    _renderJsonBuilder(control, uniqueId, dataObject) {
        const container = document.createElement('div');
        const items = this.workflow._getProperty(dataObject, control.dataField) || [];
        this._renderJsonBuilderUI(container, items, control.dataField);
        return container;
    }
    
    _renderJsonBuilderUI(container, items, dataPath) {
        container.innerHTML = ''; 
        const node = this.workflow.selectedNodes[0];
        const generateDataNodeConfig = this.workflow._findNodeConfig('generate_data');
        const lang = i18n.currentLanguage;
        const nodeLocale = generateDataNodeConfig.locales?.[lang]?.settings || {};
        const dataTypeOptions = document.createElement('select');
        
        if (generateDataNodeConfig) {
            generateDataNodeConfig.settings.forEach(setting => {
                if (setting.dataField === 'generationType' && setting.optionGroups) {
                    setting.optionGroups.forEach(groupData => {
                        const optgroup = document.createElement('optgroup');
                        optgroup.label = nodeLocale[groupData.labelKey] || groupData.label;
                        const groupOptions = nodeLocale[groupData.optionsKey] || {};
                        Object.entries(groupOptions).forEach(([value, text]) => {
                             if(value && value !== 'structured_json') { 
                                optgroup.appendChild(new Option(text, value));
                            }
                        });
                         if (groupData.labelKey === 'structured_data_group') { // Assuming a key for this group
                            optgroup.appendChild(new Option('Object', 'object'));
                        }
                        dataTypeOptions.appendChild(optgroup);
                    });
                }
            });
        }
        
        items.forEach((item, index) => {
            const currentPath = `${dataPath}.${index}`;
            const itemWrapper = document.createElement('div');
            itemWrapper.className = 'json-builder-item';
            const row = document.createElement('div'); row.className = 'json-builder-row';
            const keyInput = document.createElement('input');
            Object.assign(keyInput, { type: 'text', className: 'form-control form-control-sm', placeholder: i18n.get('settings.controls.key_placeholder'), value: item.key || '' });
            keyInput.addEventListener('input', (e) => {
                this.workflow._setProperty(this.workflow.selectedNodes[0].data, `${currentPath}.key`, e.target.value);
                this.workflow._commitState(i18n.get("settings.state_commit.json_key_edit"));
            });
            const valueSelect = dataTypeOptions.cloneNode(true);
            valueSelect.className = 'form-select form-select-sm';
            valueSelect.value = item.type || 'uuid';
            valueSelect.addEventListener('input', (e) => {
                const newType = e.target.value;
                this.workflow._setProperty(this.workflow.selectedNodes[0].data, `${currentPath}.type`, newType);
                if (newType === 'object' && !item.children) {
                    this.workflow._setProperty(this.workflow.selectedNodes[0].data, `${currentPath}.children`, []);
                }
                this.workflow._updateSettingsPanel(); this.workflow._commitState(i18n.get("settings.state_commit.json_type_edit"));
            });
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger'; removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault(); items.splice(index, 1);
                this.workflow._updateSettingsPanel(); this.workflow._commitState(i18n.get("settings.state_commit.json_field_remove"));
            });
            row.append(keyInput, valueSelect, removeBtn);
            itemWrapper.appendChild(row);
            if (item.type === 'object') {
                const nestedContainer = document.createElement('div');
                nestedContainer.className = 'json-builder-nested';
                item.children = item.children || [];
                this._renderJsonBuilderUI(nestedContainer, item.children, `${currentPath}.children`);
                itemWrapper.appendChild(nestedContainer);
            }
            container.appendChild(itemWrapper);
        });
        const addButton = document.createElement('button');
        addButton.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
        addButton.innerHTML = `<i class="bi bi-plus-lg"></i> ${i18n.get('settings.controls.add_field')}`;
        addButton.addEventListener('click', (e) => {
            e.preventDefault(); items.push({ key: '', type: 'uuid' });
            this.workflow._updateSettingsPanel(); this.workflow._commitState(i18n.get("settings.state_commit.json_field_add"));
        });
        container.appendChild(addButton);
    }

    _renderButton(control, nodeLocale) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn btn-sm ${control.class || 'btn-secondary'}`;
        button.dataset.action = control.action;
        button.innerHTML = nodeLocale[control.textKey] || control.text;
        return button;
    }

    _renderOutputDisplay(control, nodeLocale) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mt-2';
        const labelText = nodeLocale[control.labelKey] || control.label;
        wrapper.innerHTML = `<label class="form-label small text-muted">${labelText}</label><pre data-ref="${control.ref}" class="p-2 bg-light border rounded" style="min-height: 50px; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 0.8rem;"></pre>`;
        return wrapper;
    }

    _findControlConfig(settingsConfig, dataField) {
        if (!settingsConfig) return null;
        for (const control of settingsConfig) {
            if (control.dataField === dataField) return control;
            if (control.tabs) {
                for(const tab of control.tabs) {
                    const found = this._findControlConfig(tab.controls, dataField);
                    if (found) return found;
                }
            }
            if (control.controls || control.fields) {
                const found = this._findControlConfig(control.controls || control.fields, dataField);
                if (found) return found;
            }
        }
        return null;
    }
}