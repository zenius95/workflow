// workflow/js/app.js
document.addEventListener('DOMContentLoaded', () => {

    // The i18n and workflowConfig objects are now global, loaded from workflow.html
    let workflowConfig;

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

    // --- API BRIDGE ---
    // Use the preloaded window.api for all backend communication
    const db = {
        async getWorkflows(options) { return await window.api.getWorkflows(options); },
        async saveWorkflow(name, data, id) { return await window.api.saveWorkflow({ name, data, id }); },
        async getWorkflowVersions(workflowId) { return await window.api.getWorkflowVersions(workflowId); },
        async saveWorkflowVersion(workflowId, data) { return await window.api.createWorkflowVersion({ workflowId, data }); },
        async getWorkflowById(id) { return await window.api.getWorkflowById(id); },
        async deleteWorkflow(id) { return await window.api.deleteWorkflow(id); }
    };

    // --- KHỞI TẠO CÁC THÀNH PHẦN CHÍNH ---
    let workflowBuilder; // Will be initialized in initializeView

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
                // This needs a new IPC call since we can't use ipcRenderer directly
                window.api.notifyHost('open-workflow-in-new-tab', wf.id);
            });
            workflowListContainer.appendChild(item);
        });
    };

    const updateRenderedWorkflowList = () => {
        const query = workflowSearchInput.value.toLowerCase();
        const filtered = allWorkflowsCache.filter(wf => 
            wf.id !== currentWorkflowId && wf.name.toLowerCase().includes(query)
        );
        renderWorkflowList(filtered);
    };

    const loadWorkflowsToTab = async () => {
        workflowListContainer.innerHTML = `<p class="text-muted text-center p-3">${i18n.get('workflow_page.workflows_tab.loading')}</p>`;
        try {
            const result = await db.getWorkflows();
            allWorkflowsCache = result.rows;
            updateRenderedWorkflowList();
        } catch (error) {
            console.error('Failed to load workflows for tab:', error);
            workflowListContainer.innerHTML = `<p class="text-danger text-center p-3">${i18n.get('workflow_page.workflows_tab.load_error')}</p>`;
        }
    };

    if (workflowsTabBtn) {
        workflowsTabBtn.addEventListener('show.bs.tab', loadWorkflowsToTab);
    }
    if (workflowSearchInput) {
        workflowSearchInput.addEventListener('input', updateRenderedWorkflowList);
    }
    // --- *** KẾT THÚC: LOGIC CHO TAB WORKFLOWS *** ---

    // --- LOGS TAB LOGIC ---
    const logsTab = document.getElementById('logs-tab');
    const logsListContainer = document.getElementById('workflow-logs-list');

    // Bootstrap Modals
    const logDetailsModalEl = document.getElementById('log-details-modal');
    const logDetailsModal = new bootstrap.Modal(logDetailsModalEl);
    const logDetailsModalTitle = document.getElementById('log-details-modal-title');
    const logDetailsModalBody = document.getElementById('log-details-modal-body');

    const formatLogContent = (logContent) => {
        const lines = logContent.split('\n');
        let formattedHtml = '';
        lines.forEach(line => {
            let className = '';
            if (line.includes('[ERROR]')) {
                className = 'text-danger';
            } else if (line.includes('[WARN]')) {
                className = 'text-warning';
            } else if (line.includes('[INFO]')) {
                className = 'text-info';
            } else if (line.includes('[DEBUG]')) {
                className = 'text-muted';
            } else if (line.includes('[SYSTEM]')) {
                className = 'text-primary';
            }
            formattedHtml += `<span class="${className}">${line}</span><br>`;
        });
        return `<pre style="text-align: left; white-space: pre-wrap; word-wrap: break-word;">${formattedHtml}</pre>`;
    };

    const showLogDetailsModal = (title, bodyHtml) => {
        logDetailsModalTitle.textContent = title;
        logDetailsModalBody.innerHTML = bodyHtml;
        logDetailsModal.show();
    };

    const loadWorkflowLogs = async () => {
        if (!logsListContainer) return;

        logsListContainer.innerHTML = ''; // Clear existing logs

        if (!currentWorkflowId) {
            logsListContainer.innerHTML = `<p class="text-muted p-3">${i18n.get('workflow_page.logs_tab.no_workflow_saved')}</p>`;
            return;
        }

        try {
            const logs = await window.api.getWorkflowLogs(currentWorkflowId);

            if (logs.length === 0) {
                logsListContainer.innerHTML = `<p class="text-muted p-3">${i18n.get('workflow_page.logs_tab.no_logs')}</p>`;
                return;
            }

            logs.forEach(log => {
                const item = document.createElement('a');
                item.href = '#';
                item.className = 'list-group-item list-group-item-action';
                item.textContent = new Date(log.createdAt).toLocaleString();
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const logContentHtml = formatLogContent(log.log_content);
                    showLogDetailsModal(
                        i18n.get('workflow_page.logs_tab.log_details_title', { datetime: new Date(log.createdAt).toLocaleString() }),
                        logContentHtml
                    );
                });
                logsListContainer.appendChild(item);
            });
        } catch (error) {
            logsListContainer.innerHTML = `<p class="text-danger p-3">${i18n.get('workflow_page.logs_tab.load_error')}</p>`;
            console.error('Error loading workflow logs:', error);
        }
    };

    if (logsTab) {
        logsTab.addEventListener('show.bs.tab', loadWorkflowLogs);
    }

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
                workflowBuilder.setWorkflowId(saved.id);
                setSaveStatus('saved');
                workflowBuilder.logger.success(i18n.get('app.save_first_success', { name: defaultName }));

                window.api.notifyHost('updateTabTitle', {
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
        window.api.notifyHost('updateTabTitle', {
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
            const wfToLoad = await db.getWorkflowById(workflowId);
            
            if (wfToLoad) {
                currentWorkflowId = wfToLoad.id;
                workflowBuilder.setWorkflowId(wfToLoad.id);
                updateWorkflowTitle(wfToLoad.name);
                lastSavedVersionState = JSON.stringify(wfToLoad.data);
                
                window.api.notifyHost('updateTabTitle', {
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
        window.api.notifyHost('updateTabTitle', {
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
        Swal.fire({
            title: i18n.get('app.restore_confirm_title'),
            text: i18n.get('app.restore_confirm_text'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: i18n.get('app.restore_confirm_button'),
            cancelButtonText: i18n.get('app.cancel_button')
        }).then((result) => {
            if (result.isConfirmed) {
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
        });
    };

    // --- KHỞI TẠO ---
    const initializeView = async () => {
        // 1. Load translations for this renderer process
        const lang = 'en'; // Or get from settings, similar to browser.js
        const translations = await window.api.getTranslations(lang);
        if (translations) {
            i18n.init(lang, translations);
        } else {
            console.error("Could not load translations for workflow builder, UI might be broken.");
        }

        // Fetch workflowConfig before initializing WorkflowBuilder
        try {
            workflowConfig = await window.api.getWorkflowConfig();
        } catch (error) {
            console.error("Failed to load workflow configuration:", error);
            // Handle error, maybe show a message to the user
            return; // Stop initialization if config fails to load
        }

        // Initialize WorkflowBuilder after workflowConfig is loaded
        workflowBuilder = new WorkflowBuilder('app-container', workflowConfig, null, {
            apiKey: "ABC-123-XYZ",
            environment: "production",
            adminEmail: "admin@example.com",
            todoId: 1
        }, db);

        // Attach event listeners after workflowBuilder is initialized
        workflowBuilder.addEventListener('workflow:changed', (event) => {
            // Filter out state commit actions from triggering auto-save logs
            if (event.detail.action && event.detail.action.startsWith('workflow.state_commit')) {
                // Optionally, you could log these to console.debug if needed for development
                // console.debug("Ignoring state commit for auto-save trigger:", event.detail.action);
                return;
            }
            triggerAutoSave();
        });
        workflowBuilder.addEventListener('workflow:cleared', resetOnClearOrImport);
        historyTab.addEventListener('show.bs.tab', updateHistoryTabContent); // This was already there, but moved for clarity.

        // Translations are now loaded, so we can use i18n
        i18n.translateUI();

        if (initialWorkflowId) {
            await loadWorkflowById(initialWorkflowId);
        } else {
            updateWorkflowTitle(i18n.get('app.unsaved_workflow'));
            setSaveStatus('unsaved', i18n.get('app.unnamed_status'));
            stopVersionHistoryTimer();
            hideLoading();
        }
    };
    
    // Listen for messages from the browser (e.g., when a workflow is renamed)
    window.api.onWorkflowRenamed((newName) => {
        if (newName) {
            updateWorkflowTitle(newName);
        }
    });

    initializeView();
});