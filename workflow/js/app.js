// workflow/js/app.js
const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    // --- LẤY THÔNG TIN TỪ URL CỦA WEBVIEW ---
    const urlParams = new URLSearchParams(window.location.search);
    const initialWorkflowId = urlParams.get('workflowId') ? parseInt(urlParams.get('workflowId'), 10) : null;
    const tabId = urlParams.get('tabId');

    // --- KHỞI TẠO CÁC THÀNH PHẦN CHÍNH ---
    const workflowBuilder = new WorkflowBuilder('app-container', workflowConfig, null, {
        apiKey: "ABC-123-XYZ",
        environment: "production",
        adminEmail: "admin@example.com",
        todoId: 1
    });
    
    // Tạo một "proxy" object để giao tiếp với main process qua IPC
    const db = {
        async getWorkflows() {
            return await ipcRenderer.invoke('db-get-workflows');
        },
        async saveWorkflow(name, data, id) {
            return await ipcRenderer.invoke('db-save-workflow', { name, data, id });
        },
        async getWorkflowVersions(workflowId) {
            return await ipcRenderer.invoke('db-get-versions', workflowId);
        },
        async saveWorkflowVersion(workflowId, data) {
            return await ipcRenderer.invoke('db-save-version', { workflowId, data });
        }
    };

    const saveWorkflowModal = new bootstrap.Modal(document.getElementById('save-workflow-modal'));
    const saveBtn = document.getElementById('save-workflow-btn');
    const workflowNameInput = document.getElementById('workflow-name-input');
    const confirmSaveBtn = document.getElementById('confirm-save-btn');
    const historyTab = document.getElementById('history-tab');
    const workflowVersionsList = document.getElementById('workflow-versions-list');

    let currentWorkflowId = initialWorkflowId;
    let autoSaveInterval = null;
    let lastSavedVersionState = null;
    const AUTOSAVE_INTERVAL_MS = 10000; // 10 giây

    const openSaveModal = () => {
        const currentData = workflowBuilder.getWorkflow();
        if (currentData.nodes.length === 0) {
            alert("Sếp ơi, không thể lưu một workflow rỗng!");
            return;
        }
        const defaultName = `Workflow mới ${new Date().toLocaleString()}`;
        workflowNameInput.value = defaultName;
        saveWorkflowModal.show();
    };

    const handleConfirmSave = async () => {
        const name = workflowNameInput.value.trim();
        if (!name) {
            alert("Tên workflow không được để trống!");
            return;
        }
        const currentData = workflowBuilder.getWorkflow();
        try {
            const saved = await db.saveWorkflow(name, currentData, currentWorkflowId);
            const isNewSave = !currentWorkflowId || currentWorkflowId !== saved.id;
            currentWorkflowId = saved.id;
            saveWorkflowModal.hide();
            workflowBuilder.logger.success(`Đã lưu workflow "${name}" thành công!`);
            
            if (tabId) {
                ipcRenderer.sendToHost('updateTabTitle', {
                    tabId: tabId,
                    title: name,
                    workflowId: currentWorkflowId
                });
            }
            
            if (isNewSave) {
                await db.saveWorkflowVersion(currentWorkflowId, currentData);
                lastSavedVersionState = JSON.stringify(currentData);
                updateHistoryTabContent();
            }
            startAutoSaveTimer();
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi lưu workflow: ${error.message}`);
            alert(`Lỗi khi lưu workflow: ${error.message}`);
        }
    };
    
    const loadWorkflowById = async (workflowId) => {
        if (!workflowId) return;
        try {
            const workflows = await db.getWorkflows();
            const wfToLoad = workflows.find(w => w.id === workflowId);
            
            if (wfToLoad) {
                workflowBuilder.loadWorkflow(wfToLoad.data);
                workflowBuilder.logger.system(`Đã mở workflow "${wfToLoad.name}".`);
                currentWorkflowId = wfToLoad.id;
                lastSavedVersionState = JSON.stringify(wfToLoad.data);
                startAutoSaveTimer();
                updateHistoryTabContent();
            } else {
                workflowBuilder.logger.error(`Không tìm thấy workflow với ID: ${workflowId}`);
            }
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi tải workflow: ${error.message}`);
        }
    };

    const resetOnClearOrImport = (event) => {
        currentWorkflowId = null;
        stopAutoSaveTimer();
        ipcRenderer.sendToHost('updateTabTitle', {
            tabId: tabId,
            title: 'Workflow Chưa Lưu',
            workflowId: 'creating'
        });
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
            workflowBuilder.loadWorkflow(versionData);
            const nodesTab = new bootstrap.Tab(document.getElementById('nodes-tab'));
            nodesTab.show();
            workflowBuilder.logger.system(`Đã khôi phục workflow về phiên bản cũ.`);
        }
    };
    
    const startAutoSaveTimer = () => {
        stopAutoSaveTimer(); 
        if (currentWorkflowId) {
            historyTab.classList.remove('disabled');
            autoSaveInterval = setInterval(async () => {
                const currentData = workflowBuilder.getWorkflow();
                const currentState = JSON.stringify(currentData);
                if (currentState !== lastSavedVersionState) {
                    try {
                        await db.saveWorkflowVersion(currentWorkflowId, currentData);
                        lastSavedVersionState = currentState;
                        workflowBuilder.logger.system(`Đã tự động lưu phiên bản lúc ${new Date().toLocaleTimeString()}`);
                        if(historyTab.classList.contains('active')) {
                            updateHistoryTabContent();
                        }
                    } catch (error) {
                        workflowBuilder.logger.error(`Lỗi tự động lưu: ${error.message}`);
                    }
                }
            }, AUTOSAVE_INTERVAL_MS);
        }
    };
    
    const stopAutoSaveTimer = () => {
        historyTab.classList.add('disabled');
        workflowVersionsList.innerHTML = '<p class="text-muted text-center p-3">Lưu workflow để xem lịch sử.</p>';
        if (autoSaveInterval) {
            clearInterval(autoSaveInterval);
            autoSaveInterval = null;
        }
    };

    const initializeView = async () => {
        if (initialWorkflowId) {
            await loadWorkflowById(initialWorkflowId);
        } else {
            workflowBuilder.logger.system("Bắt đầu workflow mới.");
            stopAutoSaveTimer();
        }
    };

    saveBtn.addEventListener('click', openSaveModal);
    confirmSaveBtn.addEventListener('click', handleConfirmSave);
    historyTab.addEventListener('show.bs.tab', updateHistoryTabContent);
    workflowBuilder.addEventListener('workflow:cleared', resetOnClearOrImport);
    workflowBuilder.addEventListener('workflow:loaded', resetOnClearOrImport);

    initializeView();
});