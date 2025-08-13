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
            this.workflow.logger.error("Lỗi cấu hình: Không thể kích hoạt tính năng chọn file/folder. Vui lòng kiểm tra lại file main.js và đảm bảo đã cài đặt @electron/remote.");
            this.dialog = null;
        }
    }

    render(settingsConfig, nodeId, nodeData) {
        const container = document.createDocumentFragment();
        const row = document.createElement('div');
        row.className = 'row g-2'; // Add gutter spacing for columns
        
        settingsConfig.forEach(control => {
            const controlEl = this._renderControl(control, nodeId, nodeData);
            if (controlEl) row.appendChild(controlEl);
        });

        container.appendChild(row);
        return container;
    }

    _renderControl(control, nodeId, nodeData) {
        if (control.visibleWhen) {
            const value = this.workflow._getProperty(nodeData, control.visibleWhen.dataField);
            if (value !== control.visibleWhen.is) return null;
        }

        const colWrapper = document.createElement('div');
        colWrapper.className = control.col ? `col-md-${control.col}` : 'col-12';

        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3';

        let element;
        switch (control.type) {
            case 'text':
            case 'number':
            case 'password':
                element = this._renderInput(control, nodeId);
                break;
            case 'textarea':
                element = this._renderTextarea(control, nodeId);
                break;
            case 'select':
                element = this._renderSelect(control, nodeId);
                break;
            case 'file-select':
                element = this._renderFileSelect(control, nodeId);
                break;
            case 'folder-select':
                element = this._renderFolderSelect(control, nodeId);
                break;
            case 'tabs':
                return this._renderTabs(control, nodeId, nodeData);
            case 'repeater':
            case 'condition-builder':
            case 'json-builder':
            case 'group':
            case 'button':
            case 'output-display':
            case 'info':
                const fullWidthElement = this._renderSpecialType(control, nodeId, nodeData);
                if(fullWidthElement) wrapper.appendChild(fullWidthElement);
                colWrapper.appendChild(wrapper);
                return colWrapper;
            default:
                return null;
        }
        
        if (control.label) {
            const label = document.createElement('label');
            label.className = 'form-label fw-semibold small';
            label.htmlFor = element.id;
            label.textContent = control.label;
            wrapper.appendChild(label);
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

     _renderSpecialType(control, nodeId, nodeData) {
        switch (control.type) {
            case 'tabs':              return this._renderTabs(control, nodeId, nodeData);
            case 'repeater':          return this._renderRepeater(control, nodeId, nodeData);
            case 'condition-builder': return this._renderConditionBuilder(control, nodeId, nodeData);
            case 'json-builder':      return this._renderJsonBuilder(control, nodeId, nodeData);
            case 'group':             return this._renderGroup(control, nodeId, nodeData);
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

    _renderInput(control, nodeId) {
        const id = `settings-${nodeId}-${control.dataField.replace(/\./g, '-')}`;
        const value = this.workflow._getProperty(this.workflow.selectedNodes[0].data, control.dataField) || '';

        if (control.variablePicker) {
            const group = document.createElement('div');
            group.className = 'input-group input-group-sm';
            group.innerHTML = `
                <input id="${id}" type="${control.type}" data-field="${control.dataField}" class="form-control" placeholder="${control.placeholder || ''}" value="${value}">
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

    _renderTextarea(control, nodeId) {
            const id = `settings-${nodeId}-${control.dataField.replace(/\./g, '-')}`;
            const value = this.workflow._getProperty(this.workflow.selectedNodes[0].data, control.dataField) || '';

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

    _renderSelect(control, nodeId) {
        const id = `settings-${nodeId}-${control.dataField.replace(/\./g, '-')}`;
        const value = this.workflow._getProperty(this.workflow.selectedNodes[0].data, control.dataField) || '';
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
        } else {
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

    _renderFileSelect(control, nodeId) {
        const id = `settings-${nodeId}-${control.dataField.replace(/\./g, '-')}`;
        const value = this.workflow._getProperty(this.workflow.selectedNodes[0].data, control.dataField) || '';
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

    _renderFolderSelect(control, nodeId) {
        const id = `settings-${nodeId}-${control.dataField.replace(/\./g, '-')}`;
        const value = this.workflow._getProperty(this.workflow.selectedNodes[0].data, control.dataField) || '';
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

    _renderTabs(control, nodeId, nodeData) {
        const colWrapper = document.createElement('div');
        colWrapper.className = control.col ? `col-md-${control.col}` : 'col-12';

        const tabId = `settings-tabs-${nodeId}`;
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3';

        const nav = document.createElement('ul');
        nav.className = 'nav nav-tabs mb-3';
        nav.setAttribute('role', 'tablist');

        const content = document.createElement('div');
        content.className = 'tab-content';

        control.tabs.forEach((tab, index) => {
            const paneId = `${tabId}-pane-${index}`;
            const activeClass = tab.active ? 'active' : '';

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
                const el = this._renderControl(c, nodeId, nodeData);
                if (el) row.appendChild(el);
            });
            pane.appendChild(row);
            content.appendChild(pane);
        });

        wrapper.appendChild(nav);
        wrapper.appendChild(content);
        colWrapper.appendChild(wrapper);
        return colWrapper;
    }
    
    _renderGroup(control, nodeId, nodeData) {
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'row g-2'; 
        control.controls.forEach(c => {
            const el = this._renderControl(c, nodeId, nodeData);
            if (el) groupWrapper.appendChild(el);
        });
        return groupWrapper;
    }

    _renderRepeater(control, nodeId, nodeData) {
        const wrapper = document.createElement('div');
        const container = document.createElement('div');
        wrapper.appendChild(container);

        const renderRows = () => {
            container.innerHTML = '';
            const items = this.workflow._getProperty(nodeData, control.dataField) || [];

            items.forEach((item, index) => {
                const rowWrapper = document.createElement('div');
                rowWrapper.className = 'repeater-row d-grid align-items-center gap-2 mb-2';
                
                rowWrapper.style.gridTemplateColumns = `repeat(${control.fields.length}, 1fr) auto`;

                control.fields.forEach(fieldConfig => {
                    const fieldPath = `${control.dataField}.${index}.${fieldConfig.dataField}`;
                    const tempControlConfig = { ...fieldConfig, dataField: fieldPath, label: null, col: null }; 
                    const fieldElement = this._renderControl(tempControlConfig, nodeId, nodeData);
                    
                    const innerContent = fieldElement.firstElementChild;
                    
                    const inputElement = innerContent.querySelector('input, select, textarea');
                    if (inputElement && fieldConfig.placeholder) {
                        inputElement.placeholder = fieldConfig.placeholder;
                    }
                    
                    rowWrapper.appendChild(innerContent);
                });

                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn btn-sm btn-outline-danger flex-shrink-0 align-self-center';
                removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    items.splice(index, 1);
                    this.workflow._updateSettingsPanel(); 
                    this.workflow._commitState(`Xóa mục trong repeater: ${control.dataField}`);
                });
                rowWrapper.appendChild(removeBtn);

                container.appendChild(rowWrapper);
            });
        };

        renderRows();

        const addButton = document.createElement('button');
        addButton.className = 'btn btn-sm btn-outline-secondary w-100 mt-2';
        addButton.innerHTML = control.addButtonText || '+ Thêm';
        wrapper.appendChild(addButton);

        addButton.addEventListener('click', (e) => {
            e.preventDefault();
            const items = this.workflow._getProperty(nodeData, control.dataField);
            if (items) {
                const newItem = {};
                control.fields.forEach(field => {
                    this.workflow._setProperty(newItem, field.dataField, field.defaultValue || '');
                });
                items.push(newItem);
                this.workflow._updateSettingsPanel();
                this.workflow._commitState(`Thêm mục vào repeater: ${control.dataField}`);
            }
        });

        return wrapper;
    }

    _renderConditionBuilder(control, nodeId, nodeData) {
        const container = document.createElement('div');
        const conditionGroups = this.workflow._getProperty(nodeData, control.dataField) || [];

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
                const inputValueId = `${nodeId}-cond-${groupIndex}-${condIndex}-inputValue`;
                const comparisonValueId = `${nodeId}-cond-${groupIndex}-${condIndex}-comparisonValue`;

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

    _renderJsonBuilder(control, nodeId, nodeData) {
        const container = document.createElement('div');
        const items = this.workflow._getProperty(nodeData, control.dataField) || [];
        this._renderJsonBuilderUI(container, items, control.dataField);
        return container;
    }
    
    _renderJsonBuilderUI(container, items, dataPath) {
        container.innerHTML = ''; 

        const dataTypeOptions = document.createElement('select');
        const nodeConfig = this.workflow._findNodeConfig('generate_data');
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