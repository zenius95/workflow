// workflow/js/app.js
const { ipcRenderer } = require('electron');
const { workflowConfig } = require('./js/config.js');
const i18n = require('./js/i18n.js');

document.addEventListener('DOMContentLoaded', () => {

    window.i18n = i18n
    // Load language first
    i18n.loadLanguage('en'); // or 'vi', or load from user settings
    i18n.translateUI();

    // --- LẤY THÔNG TIN TỪ URL CỦA WEBVIEW ---
    const urlParams = new URLSearchParams(window.location.search);
    const initialWorkflowId = urlParams.get('workflowId') ? parseInt(urlParams.get('workflowId'), 10) : null;
    const tabId = urlParams.get('tabId');

    // --- LOADING OVERLAY ---
    const loadingOverlay = document.getElementById('loading-overlay');
    const showLoading = () => {};
    const hideLoading = () => setTimeout(() => {
        loadingOverlay.style.display = 'none';
    }, 2000);

    const db = {
        async getWorkflows(options) { return await ipcRenderer.invoke('db-get-workflows', options); },
        async saveWorkflow(name, data, id) { return await ipcRenderer.invoke('db-save-workflow', { name, data, id }); },
        async getWorkflowVersions(workflowId) { return await ipcRenderer.invoke('db-get-versions', workflowId); },
        async saveWorkflowVersion(workflowId, data) { return await ipcRenderer.invoke('db-save-version', { workflowId, data }); },
        // --- BẮT ĐẦU THÊM MÃ MỚI ---
        // Hàm này còn thiếu và rất quan trọng cho Sub Workflow
        async getWorkflowById(id) { return await ipcRenderer.invoke('db-get-workflow-by-id', id); },
        async deleteWorkflow(id) { return await ipcRenderer.invoke('db-delete-workflow', id); }
        // --- KẾT THÚC THÊM MÃ MỚI ---
    };

    // --- KHỞI TẠO CÁC THÀNH PHẦN CHÍNH ---
    const workflowBuilder = new WorkflowBuilder('app-container', workflowConfig, null, {
        apiKey: "ABC-123-XYZ",
        environment: "production",
        adminEmail: "admin@example.com",
        todoId: 1
    }, db);

    window.workflowBuilder = workflowBuilder;

    const workflowVersionsList = document.getElementById('workflow-versions-list');
    const titleDisplay = document.querySelector('[data-ref="workflow-title-display"]');
    const titleEdit = document.querySelector('[data-ref="workflow-title-edit"]');
    const saveStatusEl = document.querySelector('[data-ref="save-status"]');
    const historyTab = document.getElementById('history-tab');

    let currentWorkflowId = initialWorkflowId;
    let currentWorkflowName = i18n.get('app.unsaved_workflow');
    let autoSaveTimer = null;
    let versionHistoryTimer = null;
    let lastSavedVersionState = null;
    let isSavingFirstTime = false;
    const AUTOSAVE_INTERVAL_MS = 2000;
    const VERSION_INTERVAL_MS = 30000;

    // --- *** BẮT ĐẦU: LOGIC CHO TAB WORKFLOWS *** ---
    const workflowsTabBtn = document.getElementById('workflows-tab-btn');
    const workflowListContainer = document.getElementById('workflow-list');
    const workflowSearchInput = document.getElementById('workflow-list-search');
    let allWorkflowsCache = []; // Cache để tìm kiếm nhanh hơn

    /**
     * [CẬP NHẬT] Render danh sách workflow với giao diện giống node
     */
    const renderWorkflowList = (workflows) => {
        workflowListContainer.innerHTML = '';
        if (workflows.length === 0) {
            workflowListContainer.innerHTML = `<p class="text-muted text-center p-3">${i18n.get('workflow_page.workflows_tab.no_workflows')}</p>`;
            return;
        }
        workflows.forEach(wf => {
            const item = document.createElement('div');
            
            item.className = 'd-flex align-items-center palette-node p-3 bg-body-tertiary rounded-3';
            item.draggable = true;
            
            item.addEventListener('dragstart', (e) => {
                const workflowData = allWorkflowsCache.find(w => w.id === wf.id);
                if (workflowData && workflowData.data) {
                    const payload = {
                        type: 'sub_workflow',
                        initialData: {
                            title: workflowData.name,
                            workflowId: workflowData.id,
                            formDefinition: workflowData.data.formBuilder || []
                        }
                    };
                    e.dataTransfer.setData('application/json', JSON.stringify(payload));
                }
            });

            item.innerHTML = `
                <span class="rounded-3 text-white d-flex align-items-center justify-content-center me-2 bg-primary" style="width: 25px; height: 25px;"><i class="ri-git-pull-request-line"></i></span>
                <span class="fw-bold">${wf.name}</span>
            `;

            item.addEventListener('click', (e) => {
                e.preventDefault();
                ipcRenderer.send('open-workflow-in-new-tab', wf.id);
            });
            workflowListContainer.appendChild(item);
        });
    };

    // --- BẮT ĐẦU THAY ĐỔI ---
    const updateRenderedWorkflowList = () => {
        const query = workflowSearchInput.value.toLowerCase();
        // Lọc theo từ khóa tìm kiếm VÀ lọc bỏ workflow hiện tại
        const filtered = allWorkflowsCache.filter(wf => 
            wf.id !== currentWorkflowId && wf.name.toLowerCase().includes(query)
        );
        renderWorkflowList(filtered);
    };
    // --- KẾT THÚC THAY ĐỔI ---

    const loadWorkflowsToTab = async () => {
        workflowListContainer.innerHTML = `<p class="text-muted text-center p-3">${i18n.get('workflow_page.workflows_tab.loading')}</p>`;
        try {
            const result = await db.getWorkflows();
            allWorkflowsCache = result.rows;
            updateRenderedWorkflowList(); // Sử dụng hàm cập nhật mới
        } catch (error) {
            console.error('Failed to load workflows for tab:', error);
            workflowListContainer.innerHTML = `<p class="text-danger text-center p-3">${i18n.get('workflow_page.workflows_tab.load_error')}</p>`;
        }
    };

    if (workflowsTabBtn) {
        workflowsTabBtn.addEventListener('show.bs.tab', loadWorkflowsToTab);
    }
    if (workflowSearchInput) {
        workflowSearchInput.addEventListener('input', updateRenderedWorkflowList); // Sử dụng hàm cập nhật mới
    }
    // --- *** KẾT THÚC: LOGIC CHO TAB WORKFLOWS *** ---


    // --- LOGIC TRẠNG THÁI LƯU ---
    const setSaveStatus = (status, message = '') => {
        saveStatusEl.className = `save-status ${status}`;
        const text = message || i18n.get(`app.${status}_status`);
        saveStatusEl.innerHTML = `
            <span>${new Date().toLocaleString()}</span>
            <div class="spinner-sm" role="status"><i class="ri-loop-left-line"></i></div>
            <i class="icon saved ri-checkbox-circle-fill"></i>
            <i class="icon unsaved ri-upload-cloud-fill"></i>
            <i class="icon error ri-close-circle-fill"></i>`;
    };

    // --- LOGIC LƯU TỰ ĐỘNG ---
    const triggerAutoSave = async () => {
        if (isSavingFirstTime) return;

        if (!currentWorkflowId) {
            isSavingFirstTime = true;
            setSaveStatus('saving', i18n.get('app.creating_status'));
            try {
                const tabNumber = tabId.split('-')[1] || 1;
                const defaultName = i18n.get('app.new_workflow_default', { number: tabNumber });
                updateWorkflowTitle(defaultName);

                const currentData = workflowBuilder.getWorkflow();
                const saved = await db.saveWorkflow(defaultName, currentData, null);

                currentWorkflowId = saved.id;
                setSaveStatus('saved');
                workflowBuilder.logger.success(i18n.get('app.save_first_success', { name: defaultName }));

                ipcRenderer.sendToHost('updateTabTitle', {
                    tabId: tabId, title: defaultName, workflowId: currentWorkflowId
                });

                await db.saveWorkflowVersion(currentWorkflowId, currentData);
                lastSavedVersionState = JSON.stringify(currentData);

                startVersionHistoryTimer();
                updateHistoryTabContent();

            } catch (error) {
                setSaveStatus('error', i18n.get('app.save_failed_status'));
                updateWorkflowTitle(i18n.get('app.unsaved_workflow'));
                console.error(i18n.get('app.save_first_error'), error);
            } finally {
                isSavingFirstTime = false;
            }
            return;
        }

        setSaveStatus('unsaved');
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(autoSaveWorkflow, AUTOSAVE_INTERVAL_MS);
    };

    const autoSaveWorkflow = async () => {
        if (!currentWorkflowId) return;

        setSaveStatus('saving');
        try {
            const currentData = workflowBuilder.getWorkflow();
            await db.saveWorkflow(currentWorkflowName, currentData, currentWorkflowId);
            setSaveStatus('saved');
        } catch (error) {
            setSaveStatus('error', i18n.get('app.save_failed_status'));
            console.error(i18n.get('app.autosave_error'), error);
        }
    };

    // --- LOGIC TIÊU ĐỀ WORKFLOW ---
    const updateWorkflowTitle = (name) => {
        currentWorkflowName = name;
        titleDisplay.textContent = name;
        titleEdit.value = name;
    };

    const enableTitleEdit = () => {
        titleDisplay.style.display = 'none';
        titleEdit.style.display = 'inline-block';
        titleEdit.focus();
        titleEdit.select();
    };

    const disableTitleEdit = async (save = false) => {
        titleEdit.style.display = 'none';
        titleDisplay.style.display = 'block';

        const newName = titleEdit.value.trim();
        if (!save || !newName || newName === currentWorkflowName) {
            updateWorkflowTitle(currentWorkflowName);
            return;
        }

        updateWorkflowTitle(newName);
        ipcRenderer.sendToHost('updateTabTitle', {
            tabId: tabId, title: newName, workflowId: currentWorkflowId || 'creating'
        });
        if (currentWorkflowId) {
            await autoSaveWorkflow();
        }
    };

    titleDisplay.addEventListener('dblclick', enableTitleEdit);
    titleEdit.addEventListener('blur', () => disableTitleEdit(true));
    titleEdit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') disableTitleEdit(true);
        if (e.key === 'Escape') disableTitleEdit(false);
    });

    const loadWorkflowById = async (workflowId) => {
        if (!workflowId) return;
        showLoading();
        try {
            const workflows = await db.getWorkflows();
            const wfToLoad = workflows.rows.find(w => w.id === workflowId);
            
            if (wfToLoad) {
                currentWorkflowId = wfToLoad.id;
                updateWorkflowTitle(wfToLoad.name);
                lastSavedVersionState = JSON.stringify(wfToLoad.data);
                
                ipcRenderer.sendToHost('updateTabTitle', {
                    tabId: tabId, title: wfToLoad.name, workflowId: currentWorkflowId
                });

                workflowBuilder.loadWorkflow(wfToLoad.data);
                setSaveStatus('saved');
                startVersionHistoryTimer();
                updateHistoryTabContent();
            } else {
                updateWorkflowTitle(i18n.get('app.workflow_not_found'));
                setSaveStatus('error', i18n.get('app.workflow_not_found'));
            }
        } catch (error) {
            console.error(i18n.get('app.load_error', { message: error.message }));
            setSaveStatus('error', i18n.get('app.load_failed_status'));
        } finally {
            hideLoading();
        }
    };

    const resetOnClearOrImport = () => {
        currentWorkflowId = null;
        updateWorkflowTitle(i18n.get('app.unsaved_workflow'));
        setSaveStatus('unsaved', i18n.get('app.unnamed_status'));
        stopVersionHistoryTimer();
        ipcRenderer.sendToHost('updateTabTitle', {
            tabId: tabId, title: i18n.get('app.unsaved_workflow'), workflowId: 'creating'
        });
    };
    
    // --- LỊCH SỬ PHIÊN BẢN ---
    const startVersionHistoryTimer = () => {
        stopVersionHistoryTimer(); 
        if (currentWorkflowId) {
            historyTab.classList.remove('disabled');
            versionHistoryTimer = setInterval(async () => {
                const currentState = JSON.stringify(workflowBuilder.getWorkflow());
                if (currentState !== lastSavedVersionState) {
                    try {
                        await db.saveWorkflowVersion(currentWorkflowId, JSON.parse(currentState));
                        lastSavedVersionState = currentState;
                        if(historyTab.classList.contains('active')) updateHistoryTabContent();
                    } catch (error) { console.error(i18n.get('app.version_save_error', { message: error.message })); }
                }
            }, VERSION_INTERVAL_MS);
        }
    };
    
    const stopVersionHistoryTimer = () => {
        historyTab.classList.add('disabled');
        workflowVersionsList.innerHTML = `<p class="text-muted text-center p-3">${i18n.get('app.history_unavailable')}</p>`;
        clearInterval(versionHistoryTimer);
        versionHistoryTimer = null;
    };
    
    const updateHistoryTabContent = async () => {
        if (!currentWorkflowId) {
            workflowVersionsList.innerHTML = `<p class="text-muted text-center p-3">${i18n.get('app.history_unavailable')}</p>`;
            return;
        }

        try {
            const versions = await db.getWorkflowVersions(currentWorkflowId);
            workflowVersionsList.innerHTML = '';
            if (versions.length === 0) {
                workflowVersionsList.innerHTML = `<p class="text-muted text-center p-3">${i18n.get('app.history_empty')}</p>`;
            } else {
                versions.forEach(v => {
                    const item = document.createElement('div');
                    item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                    const dateTime = new Date(v.createdAt).toLocaleString();
                    item.innerHTML = `<div><h6 class="mb-0 small">${i18n.get('app.version_at', { datetime: dateTime })}</h6></div><div><button class="btn btn-sm btn-outline-primary btn-restore"><i class="ri-download-2-line"></i> ${i18n.get('app.restore_button')}</button></div>`;
                    item.querySelector('.btn-restore').addEventListener('click', () => handleRestoreVersion(v.data));
                    workflowVersionsList.appendChild(item);
                });
            }
        } catch (error) {
             workflowBuilder.logger.error(i18n.get('app.history_load_error', {message: error.message}));
             workflowVersionsList.innerHTML = `<p class="text-danger text-center p-3">${i18n.get('app.history_load_fail')}</p>`;
        }
    };

    const handleRestoreVersion = (versionData) => {
        if (confirm(i18n.get('app.restore_confirm'))) {
            showLoading();
            setTimeout(() => {
                try {
                    workflowBuilder.loadWorkflow(versionData);
                    new bootstrap.Tab(document.getElementById('nodes-tab-btn')).show();
                    workflowBuilder.logger.system(i18n.get('app.restored_log'));
                } finally {
                    hideLoading();
                }
            }, 100);
        }
    };

    // --- KHỞI TẠO ---
    const initializeView = async () => {
        if (initialWorkflowId) {
            await loadWorkflowById(initialWorkflowId);
        } else {
            updateWorkflowTitle(i18n.get('app.unsaved_workflow'));
            setSaveStatus('unsaved', i18n.get('app.unnamed_status'));
            stopVersionHistoryTimer();
            hideLoading();
        }
    };
    
    workflowBuilder.addEventListener('workflow:changed', triggerAutoSave);
    historyTab.addEventListener('show.bs.tab', updateHistoryTabContent);
    workflowBuilder.addEventListener('workflow:cleared', resetOnClearOrImport);
    
    // **FIX:** Lắng nghe tin nhắn từ shell để cập nhật tiêu đề
    ipcRenderer.on('workflow-renamed', (event, { newName }) => {
        if (newName) {
            updateWorkflowTitle(newName);
        }
    });

    initializeView();
});