/**
 * Renders node settings UI from a configuration object.
 */
class SettingsRenderer {
    constructor(workflowInstance) {
        this.workflow = workflowInstance;
        try {
            this.dialog = require('@electron/remote').dialog;
        } catch (e) {
            console.error("Không thể tải module @electron/remote. Các nút chọn file/folder sẽ không hoạt động.", e);
            if (this.workflow && this.workflow.logger) {
                this.workflow.logger.error("Lỗi cấu hình: Không thể kích hoạt tính năng chọn file/folder. Vui lòng kiểm tra lại file main.js và đảm bảo đã cài đặt @electron/remote.");
            }
            this.dialog = null;
        }
    }

    render(settingsConfig, uniqueId, dataObject) {
        const container = document.createDocumentFragment();
        const row = document.createElement('div');
        row.className = 'row g-2';
        
        settingsConfig.forEach(control => {
            const controlEl = this._renderControl(control, uniqueId, dataObject);
            if (controlEl) row.appendChild(controlEl);
        });

        container.appendChild(row);
        return container;
    }

    _renderControl(control, uniqueId, dataObject) {
        if (control.visibleWhen) {
            const value = this.workflow._getProperty(dataObject, control.visibleWhen.dataField);
            if (value !== control.visibleWhen.is) return null;
        }

        const colWrapper = document.createElement('div');
        colWrapper.className = control.col ? `col-md-${control.col}` : 'col-12';

        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3';

        if (control.label) {
            const label = document.createElement('label');
            label.className = 'form-label fw-semibold small';
            label.textContent = control.label;
            wrapper.appendChild(label);
        }

        let element;
        switch (control.type) {
            case 'text':
            case 'number':
            case 'password':
                element = this._renderInput(control, uniqueId, dataObject);
                break;
            case 'textarea':
                element = this._renderTextarea(control, uniqueId, dataObject);
                break;
            case 'select':
                element = this._renderSelect(control, uniqueId, dataObject);
                break;
            case 'file-select':
                element = this._renderFileSelect(control, uniqueId, dataObject);
                break;
            case 'folder-select':
                element = this._renderFolderSelect(control, uniqueId, dataObject);
                break;
            case 'tabs':
                 element = this._renderTabs(control, uniqueId, dataObject);
                 break;
            case 'repeater':
                element = this._renderRepeater(control, uniqueId, dataObject);
                break;
            case 'group':
                element = this._renderGroup(control, uniqueId, dataObject);
                break;
            case 'condition-builder':
            case 'json-builder':
            case 'button':
            case 'output-display':
            case 'info':
                element = this._renderSpecialType(control, uniqueId, dataObject);
                break;
            default:
                return null;
        }
        
        wrapper.appendChild(element);
        
        if (control.helpText) {
            const help = document.createElement('div');
            help.className = 'form-text';
            help.textContent = control.helpText;
            wrapper.appendChild(help);
        }
        
        colWrapper.appendChild(wrapper);
        return colWrapper;
    }

     _renderSpecialType(control, uniqueId, dataObject) {
        switch (control.type) {
            case 'condition-builder': return this._renderConditionBuilder(control, uniqueId, dataObject);
            case 'json-builder':      return this._renderJsonBuilder(control, uniqueId, dataObject);
            case 'button':            return this._renderButton(control);
            case 'output-display':    return this._renderOutputDisplay(control);
            case 'info':              
                const infoP = document.createElement('p');
                infoP.className = 'text-muted small fst-italic';
                infoP.innerHTML = control.text;
                return infoP;
            default: return null;
        }
    }

    _createSafeId(uniqueId, control) {
        const safePart = (control.dataField || `${control.type}-${Math.random().toString(36).slice(2)}`).replace(/\./g, '-');
        return `settings-${uniqueId}-${safePart}`;
    }

    _renderInput(control, uniqueId, dataObject) {
        const id = this._createSafeId(uniqueId, control);
        const value = this.workflow._getProperty(dataObject, control.dataField) || '';

        if (control.variablePicker) {
            const group = document.createElement('div');
            group.className = 'input-group input-group-sm';
            group.innerHTML = `
                <input id="${id}" type="${control.type}" data-field="${control.dataField}" class="form-control form-control-sm" placeholder="${control.placeholder || ''}" value="${value}">
                <button class="btn btn-outline-secondary variable-picker-btn" type="button" data-target-input="${id}"><i class="bi bi-braces"></i></button>
            `;
            return group;
        } else {
            const input = document.createElement('input');
            input.id = id;
            input.type = control.type;
            input.dataset.field = control.dataField;
            input.className = 'form-control form-control-sm';
            if (control.placeholder) input.placeholder = control.placeholder;
            input.value = value;
            return input;
        }
    }

    _renderTextarea(control, uniqueId, dataObject) {
            const id = this._createSafeId(uniqueId, control);
            const value = this.workflow._getProperty(dataObject, control.dataField) || '';

            const element = document.createElement('textarea');
            element.id = id;
            element.dataset.field = control.dataField;
            element.className = 'form-control form-control-sm';
            if(control.rows) element.rows = control.rows;
            if(control.placeholder) element.placeholder = control.placeholder;
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

    _renderSelect(control, uniqueId, dataObject) {
        const id = this._createSafeId(uniqueId, control);
        const value = this.workflow._getProperty(dataObject, control.dataField) || '';
        const select = document.createElement('select');
        select.id = id;
        select.dataset.field = control.dataField;
        select.className = 'form-select form-select-sm';

        if (control.optionGroups) {
                control.optionGroups.forEach(group => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.label;
                group.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.text;
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
            });
        } else if (control.options) {
            control.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                select.appendChild(option);
            });
        }
        select.value = value;
        return select;
    }

    _renderFileSelect(control, uniqueId, dataObject) {
        const id = this._createSafeId(uniqueId, control);
        const value = this.workflow._getProperty(dataObject, control.dataField) || '';
        const group = document.createElement('div');
        group.className = 'input-group input-group-sm';
        group.innerHTML = `
            <input id="${id}" type="text" data-field="${control.dataField}" class="form-control" placeholder="Chưa chọn file nào" value="${value}">
            <button class="btn btn-outline-secondary" type="button" data-action="select-file" data-target-input="${id}" ${!this.dialog ? 'disabled' : ''}>
                <i class="bi bi-file-earmark-text me-1"></i> Browse...
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
            <input id="${id}" type="text" data-field="${control.dataField}" class="form-control" placeholder="Chưa chọn thư mục nào" value="${value}">
            <button class="btn btn-outline-secondary" type="button" data-action="select-folder" data-target-input="${id}" ${!this.dialog ? 'disabled' : ''}>
                <i class="bi bi-folder2-open me-1"></i> Browse...
            </button>
        `;
        return group;
    }

    async handleFileSelect(targetInput) {
        if (!this.dialog) return;
        const result = await this.dialog.showOpenDialog({ properties: ['openFile'] });
        if (!result.canceled && result.filePaths.length > 0) {
            targetInput.value = result.filePaths[0];
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async handleFolderSelect(targetInput) {
        if (!this.dialog) return;
        const result = await this.dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (!result.canceled && result.filePaths.length > 0) {
            targetInput.value = result.filePaths[0];
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    _renderTabs(control, uniqueId, dataObject) {
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

            const navItem = document.createElement('li');
            navItem.className = 'nav-item';
            navItem.setAttribute('role', 'presentation');
            navItem.innerHTML = `<button class="nav-link ${activeClass}" data-bs-toggle="tab" data-bs-target="#${paneId}" type="button" role="tab">${tab.title}</button>`;
            nav.appendChild(navItem);

            const pane = document.createElement('div');
            pane.className = `tab-pane fade show ${activeClass}`;
            pane.id = paneId;
            pane.setAttribute('role', 'tabpanel');

            const row = document.createElement('div');
            row.className = 'row g-2';
            tab.controls.forEach(c => {
                const el = this._renderControl(c, uniqueId, dataObject);
                if (el) row.appendChild(el);
            });
            pane.appendChild(row);
            content.appendChild(pane);
        });

        wrapper.appendChild(nav);
        wrapper.appendChild(content);
        return wrapper;
    }
    
    _renderGroup(control, uniqueId, dataObject) {
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'row g-2 border rounded p-3'; 
        control.controls.forEach(c => {
            const el = this._renderControl(c, uniqueId, dataObject);
            if (el) groupWrapper.appendChild(el);
        });
        return groupWrapper;
    }

    _renderRepeater(control, uniqueId, dataObject) {
        const wrapper = document.createElement('div');
        const container = document.createElement('div');
        wrapper.appendChild(container);

        const items = this.workflow._getProperty(dataObject, control.dataField) || [];

        items.forEach((item, index) => {
            const rowWrapper = document.createElement('div');
            rowWrapper.className = 'repeater-row d-grid align-items-center gap-2 mb-2';
            
            rowWrapper.style.gridTemplateColumns = `repeat(${(control.fields || []).length}, 1fr) auto`;

            (control.fields || []).forEach(fieldConfig => {
                const fieldPath = `${control.dataField}.${index}.${fieldConfig.dataField}`;
                // <<< SỬA LỖI: Không bỏ đi 'label' nữa >>>
                const tempControlConfig = { ...fieldConfig, dataField: fieldPath, col: null }; 
                const fieldElement = this._renderControl(tempControlConfig, uniqueId, dataObject);
                
                rowWrapper.appendChild(fieldElement);
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger flex-shrink-0 align-self-center';
            removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
            removeBtn.dataset.action = 'remove-repeater-item';
            removeBtn.dataset.field = control.dataField;
            removeBtn.dataset.index = index;
            rowWrapper.appendChild(removeBtn);

            container.appendChild(rowWrapper);
        });

        const addButton = document.createElement('button');
        addButton.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
        addButton.innerHTML = control.addButtonText || '+ Thêm';
        addButton.dataset.action = 'add-repeater-item';
        addButton.dataset.field = control.dataField;
        wrapper.appendChild(addButton);

        return wrapper;
    }

    _renderConditionBuilder(control, uniqueId, dataObject) {
        const container = document.createElement('div');
        const conditionGroups = this.workflow._getProperty(dataObject, control.dataField) || [];

        conditionGroups.forEach((group, groupIndex) => {
            if (groupIndex > 0) {
                const separator = document.createElement('div');
                separator.className = 'group-separator';
                separator.textContent = 'hoặc';
                container.appendChild(separator);
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
                    this.workflow._commitState("Xóa nhóm điều kiện");
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
                        <input type="text" class="form-control" placeholder="Giá trị" value="${cond.inputValue || ''}" data-field="conditionGroups.${groupIndex}.${condIndex}.inputValue" id="${inputValueId}">
                        <button class="btn btn-outline-secondary variable-picker-btn" type="button" data-target-input="${inputValueId}"><i class="bi bi-braces"></i></button>
                    </div>
                    <select class="form-select form-select-sm" data-field="conditionGroups.${groupIndex}.${condIndex}.operator" value="${cond.operator}">
                        <option value="==">bằng với</option>
                        <option value="!=">không bằng</option>
                        <option value=">">lớn hơn</option>
                        <option value="<">nhỏ hơn</option>
                        <option value=">=">lớn hơn hoặc bằng</option>
                        <option value="<=">nhỏ hơn hoặc bằng</option>
                        <option value="contains">chứa</option>
                        <option value="not_contains">không chứa</option>
                        <option value="is_empty">là rỗng</option>
                        <option value="is_not_empty">không rỗng</option>
                    </select>
                    <div class="input-group input-group-sm">
                        <input type="text" class="form-control" placeholder="Giá trị so sánh" value="${cond.comparisonValue || ''}" data-field="conditionGroups.${groupIndex}.${condIndex}.comparisonValue" id="${comparisonValueId}">
                        <button class="btn btn-outline-secondary variable-picker-btn" type="button" data-target-input="${comparisonValueId}"><i class="bi bi-braces"></i></button>
                    </div>
                `;
                row.querySelector('select').value = cond.operator;

                const actionBtn = document.createElement('button');
                if (condIndex > 0) {
                    actionBtn.className = 'btn btn-sm btn-outline-danger';
                    actionBtn.innerHTML = '<i class="bi bi-trash"></i>';
                    actionBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        group.splice(condIndex, 1);
                        this.workflow._updateSettingsPanel();
                        this.workflow._commitState("Xóa điều kiện");
                    });
                } else {
                    actionBtn.className = 'btn btn-sm btn-outline-primary';
                    actionBtn.innerHTML = 'và';
                    actionBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        group.push({ inputValue: '', operator: '==', comparisonValue: '' });
                        this.workflow._updateSettingsPanel();
                        this.workflow._commitState("Thêm điều kiện");
                    });
                }
                row.appendChild(actionBtn);
                groupDiv.appendChild(row);
            });
            container.appendChild(groupDiv);
        });
        const addGroupButton = document.createElement('button');
        addGroupButton.className = 'btn btn-sm btn-outline-primary w-100 mt-2';
        addGroupButton.innerHTML = '<i class="bi bi-plus-lg"></i> Thêm nhóm quy tắc (hoặc)';
        addGroupButton.dataset.action = 'add-condition-group';
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

        const dataTypeOptions = document.createElement('select');
        const nodeConfig = this.workflow._findNodeConfig('generate_data');
        if (nodeConfig) {
            const tempSelectDiv = document.createElement('div');
            this.workflow.settingsRenderer.render(nodeConfig.settings, 'temp', {}).querySelectorAll('select[data-field="generationType"] optgroup').forEach(optgroup => {
                const newOptgroup = document.createElement('optgroup');
                newOptgroup.label = optgroup.label;
                optgroup.querySelectorAll('option').forEach(opt => {
                    if(opt.value && opt.value !== 'structured_json') { 
                        const newOpt = document.createElement('option');
                        newOpt.value = opt.value;
                        newOpt.textContent = opt.textContent;
                        newOptgroup.appendChild(newOpt);
                    }
                });
                if (newOptgroup.label === 'Dữ liệu có cấu trúc') {
                    const objOpt = document.createElement('option');
                    objOpt.value = 'object';
                    objOpt.textContent = 'Object (Nhóm)';
                    newOptgroup.appendChild(objOpt);
                }
                dataTypeOptions.appendChild(newOptgroup);
            });
        }


        items.forEach((item, index) => {
            const currentPath = `${dataPath}.${index}`;
            const itemWrapper = document.createElement('div');
            itemWrapper.className = 'json-builder-item';
            
            const row = document.createElement('div');
            row.className = 'json-builder-row';

            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.className = 'form-control form-control-sm';
            keyInput.placeholder = 'Key';
            keyInput.value = item.key || '';
            keyInput.addEventListener('input', (e) => {
                this.workflow._setProperty(this.workflow.selectedNodes[0].data, `${currentPath}.key`, e.target.value);
                this.workflow._commitState("Sửa khóa JSON");
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
                this.workflow._updateSettingsPanel();
                this.workflow._commitState("Sửa loại trường JSON");
            });

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-sm btn-outline-danger';
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                items.splice(index, 1);
                this.workflow._updateSettingsPanel();
                this.workflow._commitState("Xóa trường JSON");
            });

            row.appendChild(keyInput);
            row.appendChild(valueSelect);
            row.appendChild(removeBtn);
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
        addButton.innerHTML = '<i class="bi bi-plus-lg"></i> Thêm Trường';
        addButton.addEventListener('click', (e) => {
            e.preventDefault();
            items.push({ key: '', type: 'uuid' });
            this.workflow._updateSettingsPanel();
            this.workflow._commitState("Thêm trường JSON");
        });
        container.appendChild(addButton);
    }

    _renderButton(control) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn btn-sm ${control.class || 'btn-secondary'}`;
        button.dataset.action = control.action;
        button.innerHTML = control.text;
        return button;
    }

    _renderOutputDisplay(control) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mt-2';
        wrapper.innerHTML = `
            <label class="form-label small text-muted">${control.label}</label>
            <pre data-ref="${control.ref}" class="p-2 bg-light border rounded" style="min-height: 50px; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 0.8rem;"></pre>
        `;
        return wrapper;
    }

    _findControlConfig(settingsConfig, dataField) {
        for (const control of settingsConfig) {
            if (control.dataField === dataField) return control;
            if (control.tabs) {
                for(const tab of control.tabs) {
                    const found = this._findControlConfig(tab.controls, dataField);
                    if (found) return found;
                }
            }
                if (control.controls) {
                const found = this._findControlConfig(control.controls, dataField);
                if (found) return found;
            }
        }
        return null;
    }
}