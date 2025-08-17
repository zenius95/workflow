// workflow/js/app.js

// Thêm dòng này vào đầu file để sử dụng API giao tiếp của Electron
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

    const db = require('./js/database.js');
    db.initialize();

    // --- BẮT ĐẦU THAY ĐỔI: Loại bỏ modal cũ, lấy tham chiếu đến các phần tử mới ---
    const saveWorkflowModal = new bootstrap.Modal(document.getElementById('save-workflow-modal'));

    const saveBtn = document.getElementById('save-workflow-btn');
    const workflowNameInput = document.getElementById('workflow-name-input');
    const confirmSaveBtn = document.getElementById('confirm-save-btn');
    
    const historyTab = document.getElementById('history-tab');
    const workflowVersionsList = document.getElementById('workflow-versions-list');

    // Các phần tử của trang bắt đầu
    const createNewWorkflowBtn = document.querySelector('[data-action="create-new-workflow"]');
    const startPageWorkflowList = workflowBuilder.dom.startPageWorkflowList;
    // --- KẾT THÚC THAY ĐỔI ---

    // --- STATE QUẢN LÝ ---
    let currentWorkflowId = initialWorkflowId;
    let autoSaveInterval = null;
    let lastSavedVersionState = null;
    const AUTOSAVE_INTERVAL_MS = 10000; // 10 giây

    // --- CÁC HÀM XỬ LÝ SỰ KIỆN (ĐÃ CẬP NHẬT) ---

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
            const isNewSave = currentWorkflowId !== saved.id;
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
    
    // --- BẮT ĐẦU THAY ĐỔI: Các hàm logic cho trang bắt đầu ---
    const populateStartPage = async () => {
        try {
            const workflows = await db.getWorkflows();
            startPageWorkflowList.innerHTML = ''; // Xóa danh sách cũ
            if (workflows.length === 0) {
                startPageWorkflowList.innerHTML = '<p class="text-center text-muted p-3">Sếp chưa lưu workflow nào cả.</p>';
            } else {
                workflows.forEach(wf => {
                    const item = document.createElement('a');
                    item.href = '#';
                    item.className = 'list-group-item list-group-item-action workflow-list-item';
                    item.dataset.id = wf.id;
                    item.innerHTML = `
                        <div>
                            <h5>${wf.name}</h5>
                            <small>Cập nhật: ${new Date(wf.updatedAt).toLocaleString()}</small>
                        </div>
                        <i class="ri-arrow-right-s-line"></i>
                    `;
                    startPageWorkflowList.appendChild(item);
                });
            }
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi tải danh sách workflow: ${error.message}`);
            startPageWorkflowList.innerHTML = '<p class="text-center text-danger p-3">Không thể tải danh sách workflow.</p>';
        }
    };
    
    const handleStartPageSelection = async (e) => {
        const item = e.target.closest('.workflow-list-item');
        if (!item) return;
        
        e.preventDefault();
        const id = parseInt(item.dataset.id, 10);
        await loadWorkflowById(id);
    };
    
    const handleCreateNew = () => {
        workflowBuilder.hideStartPage();
        workflowBuilder.logger.system("Bắt đầu workflow mới.");
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

                if (tabId) {
                    ipcRenderer.sendToHost('updateTabTitle', {
                        tabId: tabId,
                        title: wfToLoad.name,
                        workflowId: currentWorkflowId
                    });
                }

                workflowBuilder.hideStartPage();
                startAutoSaveTimer();
                updateHistoryTabContent();
            } else {
                workflowBuilder.logger.error(`Không tìm thấy workflow với ID: ${workflowId}`);
            }
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi tải workflow: ${error.message}`);
        }
    };
    // --- KẾT THÚC THAY ĐỔI ---

    const resetCurrentWorkflow = (event) => {
        const isFromJsonImport = event.detail?.workflow?.nodes[0]?.id.includes('_');
        if (event.type === 'workflow:cleared' || isFromJsonImport) {
            currentWorkflowId = null;
            stopAutoSaveTimer();
            // Nếu xóa canvas, quay lại trang bắt đầu
            populateStartPage();
            workflowBuilder.showStartPage();
        }
    };
    
    const updateHistoryTabContent = async () => {
        if (!currentWorkflowId) {
            workflowVersionsList.innerHTML = '<p class="text-muted text-center p-3">Mở một workflow đã lưu để xem lịch sử.</p>';
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
                    item.innerHTML = `
                        <div>
                            <h6 class="mb-0 small">Phiên bản lúc: ${new Date(v.createdAt).toLocaleString()}</h6>
                        </div>
                        <div>
                            <button class="btn btn-sm btn-outline-primary btn-restore"><i class="ri-download-2-line"></i></button>
                        </div>
                    `;
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
        workflowVersionsList.innerHTML = '<p class="text-muted text-center p-3">Mở một workflow đã lưu để xem lịch sử.</p>';
        if (autoSaveInterval) {
            clearInterval(autoSaveInterval);
            autoSaveInterval = null;
        }
    };

    const autoLoadWorkflowOnStart = async () => {
        if (initialWorkflowId) {
            await loadWorkflowById(initialWorkflowId);
        } else {
            populateStartPage();
            workflowBuilder.showStartPage();
        }
    };

    // --- GÁN SỰ KIỆN ---
    saveBtn.addEventListener('click', openSaveModal);
    confirmSaveBtn.addEventListener('click', handleConfirmSave);
    
    // Gán sự kiện cho các phần tử mới của trang bắt đầu
    createNewWorkflowBtn.addEventListener('click', handleCreateNew);
    startPageWorkflowList.addEventListener('click', handleStartPageSelection);
    
    historyTab.addEventListener('show.bs.tab', updateHistoryTabContent);
    workflowBuilder.addEventListener('workflow:cleared', resetCurrentWorkflow);
    workflowBuilder.addEventListener('workflow:loaded', resetCurrentWorkflow);

    // --- KHỞI TẠO TRẠNG THÁI ---
    stopAutoSaveTimer();
    autoLoadWorkflowOnStart();
});