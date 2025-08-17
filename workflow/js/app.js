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

    // *** BẮT ĐẦU SỬA LỖI: Thay thế direct DB access bằng IPC ***
    // Xóa các dòng require và initialize db trực tiếp
    // const db = require('./js/database.js');
    // db.initialize();

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
    // *** KẾT THÚC SỬA LỖI ***

    const saveWorkflowModal = new bootstrap.Modal(document.getElementById('save-workflow-modal'));
    const saveBtn = document.getElementById('save-workflow-btn');
    const workflowNameInput = document.getElementById('workflow-name-input');
    const confirmSaveBtn = document.getElementById('confirm-save-btn');
    const historyTab = document.getElementById('history-tab');
    const workflowVersionsList = document.getElementById('workflow-versions-list');
    const createNewWorkflowBtn = document.querySelector('[data-action="create-new-workflow"]');
    const startPageWorkflowList = workflowBuilder.dom.startPageWorkflowList;

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
    
    // --- BẮT ĐẦU THAY ĐỔI: Logic hiển thị danh sách workflow ---
    const populateStartPage = async () => {
        try {
            // 1. Gửi yêu cầu lên shell để lấy danh sách ID các workflow đang mở
            ipcRenderer.sendToHost('getOpenWorkflows-request', { tabId });

            // 2. Chờ phản hồi từ shell
            const openWorkflowIds = await new Promise(resolve => {
                ipcRenderer.once('getOpenWorkflows-response', (event, { openIds }) => {
                    resolve(new Set(openIds)); // Dùng Set để tra cứu nhanh hơn
                });
            });

            const workflows = await db.getWorkflows();
            startPageWorkflowList.innerHTML = ''; // Xóa danh sách cũ

            if (workflows.length === 0) {
                startPageWorkflowList.innerHTML = '<p class="text-center text-muted p-3">Sếp chưa lưu workflow nào cả.</p>';
            } else {
                // 3. Render danh sách với trạng thái tương ứng
                workflows.forEach(wf => {
                    const isOpen = openWorkflowIds.has(wf.id);
                    const item = document.createElement('div'); // Thay <a> bằng <div>
                    item.className = 'list-group-item list-group-item-action workflow-list-item d-flex justify-content-between align-items-center';
                    
                    if (isOpen) {
                        item.classList.add('bg-light'); // Highlight nhẹ nếu đang mở
                    }

                    // Phần thông tin workflow
                    let contentHTML = `
                        <div>
                            <h5 class="${isOpen ? 'text-primary' : ''}">${wf.name}</h5>
                            <small>Cập nhật: ${new Date(wf.updatedAt).toLocaleString()}</small>
                        </div>
                    `;
                    
                    item.innerHTML = contentHTML;

                    if (isOpen) {
                        // Nếu đang mở, thêm nút "Chuyển Tab"
                        const switchBtn = document.createElement('button');
                        switchBtn.className = 'btn btn-sm btn-primary';
                        switchBtn.innerHTML = 'Chuyển Tab <i class="ri-arrow-right-line ms-1"></i>';
                        switchBtn.dataset.action = 'switch-tab';
                        switchBtn.dataset.workflowId = wf.id;
                        item.appendChild(switchBtn);
                    } else {
                        // Nếu chưa mở, thêm icon và data-id để mở
                        const icon = document.createElement('i');
                        icon.className = 'ri-arrow-right-s-line';
                        item.appendChild(icon);
                        item.dataset.action = 'open-workflow';
                        item.dataset.id = wf.id;
                    }
                    startPageWorkflowList.appendChild(item);
                });
            }
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi tải danh sách workflow: ${error.message}`);
            startPageWorkflowList.innerHTML = '<p class="text-center text-danger p-3">Không thể tải danh sách workflow.</p>';
        }
    };
    
    const handleStartPageSelection = async (e) => {
        // Bắt sự kiện cho nút "Chuyển Tab"
        const switchBtn = e.target.closest('[data-action="switch-tab"]');
        if (switchBtn) {
            e.preventDefault();
            const workflowIdToSwitch = switchBtn.dataset.workflowId;
            if (workflowIdToSwitch) {
                ipcRenderer.sendToHost('switchToWorkflow', { workflowId: workflowIdToSwitch });
            }
            return;
        }

        // Logic cũ để mở workflow mới
        const item = e.target.closest('[data-action="open-workflow"]');
        if (!item) return;
        
        e.preventDefault();
        const id = parseInt(item.dataset.id, 10);
        await loadWorkflowById(id);
    };
    // --- KẾT THÚC THAY ĐỔI ---
    
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

    const resetCurrentWorkflow = (event) => {
        const isFromJsonImport = event.detail?.workflow?.nodes[0]?.id.includes('_');
        if (event.type === 'workflow:cleared' || isFromJsonImport) {
            currentWorkflowId = null;
            stopAutoSaveTimer();
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

    saveBtn.addEventListener('click', openSaveModal);
    confirmSaveBtn.addEventListener('click', handleConfirmSave);
    createNewWorkflowBtn.addEventListener('click', handleCreateNew);
    startPageWorkflowList.addEventListener('click', handleStartPageSelection);
    historyTab.addEventListener('show.bs.tab', updateHistoryTabContent);
    workflowBuilder.addEventListener('workflow:cleared', resetCurrentWorkflow);
    workflowBuilder.addEventListener('workflow:loaded', resetCurrentWorkflow);

    stopAutoSaveTimer();
    autoLoadWorkflowOnStart();
});