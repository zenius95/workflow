// workflow/js/app.js
const { ipcRenderer } = require('electron');
const { workflowConfig } = require('./js/config.js');

document.addEventListener('DOMContentLoaded', () => {
    // --- LẤY THÔNG TIN TỪ URL CỦA WEBVIEW ---
    const urlParams = new URLSearchParams(window.location.search);
    const initialWorkflowId = urlParams.get('workflowId') ? parseInt(urlParams.get('workflowId'), 10) : null;
    const tabId = urlParams.get('tabId');

    // --- LOADING OVERLAY ---
    const loadingOverlay = document.getElementById('loading-overlay');
    const showLoading = () => loadingOverlay.style.display = 'flex';
    const hideLoading = () => setTimeout(() => {
        loadingOverlay.style.display = 'none';
    }, 1000)

    // --- KHỞI TẠO CÁC THÀNH PHẦN CHÍNH ---
    const workflowBuilder = new WorkflowBuilder('app-container', workflowConfig, null, {
        apiKey: "ABC-123-XYZ",
        environment: "production",
        adminEmail: "admin@example.com",
        todoId: 1
    });

    const db = {
        async getWorkflows() { return await ipcRenderer.invoke('db-get-workflows'); },
        async saveWorkflow(name, data, id) { return await ipcRenderer.invoke('db-save-workflow', { name, data, id }); },
        async getWorkflowVersions(workflowId) { return await ipcRenderer.invoke('db-get-versions', workflowId); },
        async saveWorkflowVersion(workflowId, data) { return await ipcRenderer.invoke('db-save-version', { workflowId, data }); }
    };

    const saveWorkflowModal = new bootstrap.Modal(document.getElementById('save-workflow-modal'));
    const workflowNameInput = document.getElementById('workflow-name-input');
    const confirmSaveBtn = document.getElementById('confirm-save-btn');
    const historyTab = document.getElementById('history-tab');
    const workflowVersionsList = document.getElementById('workflow-versions-list');

    const titleDisplay = document.querySelector('[data-ref="workflow-title-display"]');
    const titleEdit = document.querySelector('[data-ref="workflow-title-edit"]');
    const saveStatusEl = document.querySelector('[data-ref="save-status"]');

    let currentWorkflowId = initialWorkflowId;
    let currentWorkflowName = 'Workflow Chưa Lưu';
    let autoSaveTimer = null;
    let versionHistoryTimer = null;
    let lastSavedVersionState = null;
    let isSavingFirstTime = false;
    const AUTOSAVE_INTERVAL_MS = 2000; // 2 giây
    const VERSION_INTERVAL_MS = 30000; // 30 giây

    // --- LOGIC TRẠNG THÁI LƯU ---
    const setSaveStatus = (status, message = '') => {
        saveStatusEl.className = `save-status ${status}`;
        const text = message || {
            saved: 'Đã lưu',
            saving: 'Đang lưu...',
            unsaved: 'Chưa lưu',
            error: 'Lỗi'
        }[status];
        saveStatusEl.innerHTML = `
            <div class="spinner-sm" role="status"></div>
            <i class="icon saved bi bi-check-circle-fill"></i>
            <i class="icon unsaved bi bi-hdd-fill"></i>
            <i class="icon error bi bi-x-circle-fill"></i>
            <span>${text}</span>`;
    };

    // --- LOGIC LƯU TỰ ĐỘNG ---
    const triggerAutoSave = async () => {
        if (isSavingFirstTime) return;

        if (!currentWorkflowId) {
            isSavingFirstTime = true;
            setSaveStatus('saving', 'Đang tạo...');
            try {
                const tabNumber = tabId.split('-')[1] || 1;
                const defaultName = `Workflow mới ${tabNumber}`;
                updateWorkflowTitle(defaultName);

                const currentData = workflowBuilder.getWorkflow();
                const saved = await db.saveWorkflow(defaultName, currentData, null);

                currentWorkflowId = saved.id;
                setSaveStatus('saved');
                workflowBuilder.logger.success(`Đã tự động tạo và lưu workflow "${defaultName}"`);

                ipcRenderer.sendToHost('updateTabTitle', {
                    tabId: tabId, title: defaultName, workflowId: currentWorkflowId
                });

                await db.saveWorkflowVersion(currentWorkflowId, currentData);
                lastSavedVersionState = JSON.stringify(currentData);

                startVersionHistoryTimer();
                updateHistoryTabContent();

            } catch (error) {
                setSaveStatus('error', 'Tạo thất bại');
                updateWorkflowTitle('Workflow Chưa Lưu');
                console.error("Lỗi khi lưu lần đầu:", error);
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
            setSaveStatus('error', 'Lưu thất bại');
            console.error("Lỗi tự động lưu:", error);
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

        if (!currentWorkflowId) {
            updateWorkflowTitle(newName);
            ipcRenderer.sendToHost('updateTabTitle', {
                tabId: tabId, title: newName, workflowId: 'creating'
            });
        } else {
            updateWorkflowTitle(newName);
            ipcRenderer.sendToHost('updateTabTitle', {
                tabId: tabId, title: newName, workflowId: currentWorkflowId
            });
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
            const wfToLoad = workflows.find(w => w.id === workflowId);
            
            if (wfToLoad) {
                // *** BẮT ĐẦU SỬA LỖI: Cập nhật ID và Tên TRƯỚC KHI load data ***
                currentWorkflowId = wfToLoad.id;
                updateWorkflowTitle(wfToLoad.name);
                lastSavedVersionState = JSON.stringify(wfToLoad.data);
                
                ipcRenderer.sendToHost('updateTabTitle', {
                    tabId: tabId, title: wfToLoad.name, workflowId: currentWorkflowId
                });

                workflowBuilder.loadWorkflow(wfToLoad.data); // Hàm này sẽ trigger 'workflow:changed'
                // *** KẾT THÚC SỬA LỖI ***

                setSaveStatus('saved');
                startVersionHistoryTimer();
                updateHistoryTabContent();
            } else {
                updateWorkflowTitle('Không tìm thấy Workflow');
                setSaveStatus('error', 'Không tìm thấy');
            }
        } catch (error) {
            console.error(`Lỗi khi tải workflow: ${error.message}`);
            setSaveStatus('error', 'Lỗi tải');
        } finally {
            hideLoading();
        }
    };

    const resetOnClearOrImport = () => {
        currentWorkflowId = null;
        updateWorkflowTitle('Workflow Chưa Lưu');
        setSaveStatus('unsaved', 'Chưa đặt tên');
        stopVersionHistoryTimer();
        ipcRenderer.sendToHost('updateTabTitle', {
            tabId: tabId, title: 'Workflow Chưa Lưu', workflowId: 'creating'
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
                    } catch (error) { console.error(`Lỗi tự động lưu phiên bản: ${error.message}`); }
                }
            }, VERSION_INTERVAL_MS);
        }
    };
    
    const stopVersionHistoryTimer = () => {
        historyTab.classList.add('disabled');
        workflowVersionsList.innerHTML = '<p class="text-muted text-center p-3">Lưu workflow để xem lịch sử.</p>';
        clearInterval(versionHistoryTimer);
        versionHistoryTimer = null;
    };
    
    const updateHistoryTabContent = async () => {
        if (!currentWorkflowId) {
            workflowVersionsList.innerHTML = '<p class="text-muted text-center p-3">Lưu workflow để xem lịch sử.</p>';
            return;
        }

        try {
            const versions = await db.getWorkflowVersions(currentWorkflowId);
            workflowVersionsList.innerHTML = '';
            if (versions.length === 0) {
                workflowVersionsList.innerHTML = '<p class="text-muted text-center p-3">Chưa có lịch sử phiên bản nào.</p>';
            } else {
                versions.forEach(v => {
                    const item = document.createElement('div');
                    item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                    item.innerHTML = `<div><h6 class="mb-0 small">Phiên bản lúc: ${new Date(v.createdAt).toLocaleString()}</h6></div><div><button class="btn btn-sm btn-outline-primary btn-restore"><i class="ri-download-2-line"></i></button></div>`;
                    item.querySelector('.btn-restore').addEventListener('click', () => handleRestoreVersion(v.data));
                    workflowVersionsList.appendChild(item);
                });
            }
        } catch (error) {
             workflowBuilder.logger.error(`Lỗi khi tải lịch sử phiên bản: ${error.message}`);
             workflowVersionsList.innerHTML = '<p class="text-danger text-center p-3">Không thể tải lịch sử.</p>';
        }
    };

    const handleRestoreVersion = (versionData) => {
        if (confirm("Sếp có chắc muốn khôi phục phiên bản này không? Mọi thay đổi chưa lưu sẽ bị mất.")) {
            showLoading();
            setTimeout(() => {
                try {
                    workflowBuilder.loadWorkflow(versionData);
                    const nodesTab = new bootstrap.Tab(document.getElementById('nodes-tab'));
                    nodesTab.show();
                    workflowBuilder.logger.system(`Đã khôi phục workflow về phiên bản cũ.`);
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
            updateWorkflowTitle('Workflow Chưa Lưu');
            setSaveStatus('unsaved', 'Chưa đặt tên');
            stopVersionHistoryTimer();
            hideLoading();
        }
    };
    
    workflowBuilder.addEventListener('workflow:changed', triggerAutoSave);
    historyTab.addEventListener('show.bs.tab', updateHistoryTabContent);
    workflowBuilder.addEventListener('workflow:cleared', resetOnClearOrImport);
    
    initializeView();
});