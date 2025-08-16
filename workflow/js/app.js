document.addEventListener('DOMContentLoaded', () => {
    // --- KHỞI TẠO CÁC THÀNH PHẦN CHÍNH ---

    // 1. Khởi tạo Workflow Builder
    const workflowBuilder = new WorkflowBuilder('app-container', workflowConfig, null, {
        apiKey: "ABC-123-XYZ",
        environment: "production",
        adminEmail: "admin@example.com",
        todoId: 1
    });

    // 2. Khởi tạo Database và các Modal
    const db = require('./js/database.js');
    db.initialize();

    const loadWorkflowModal = new bootstrap.Modal(document.getElementById('load-workflow-modal'));
    const saveWorkflowModal = new bootstrap.Modal(document.getElementById('save-workflow-modal'));

    // 3. Lấy các element DOM mới
    const saveBtn = document.getElementById('save-workflow-btn');
    const loadBtn = document.getElementById('load-workflow-btn');
    const savedWorkflowsList = document.getElementById('saved-workflows-list');
    const workflowNameInput = document.getElementById('workflow-name-input');
    const confirmSaveBtn = document.getElementById('confirm-save-btn');
    
    // *** BẮT ĐẦU THAY ĐỔI: Lấy Element mới cho tab Lịch sử ***
    const historyTab = document.getElementById('history-tab');
    const workflowVersionsList = document.getElementById('workflow-versions-list');
    // *** KẾT THÚC THAY ĐỔI ***


    // --- STATE QUẢN LÝ ---
    let currentWorkflowId = null;
    let autoSaveInterval = null;
    let lastSavedVersionState = null;
    const AUTOSAVE_INTERVAL_MS = 10000; // 10 giây
    

    // --- CÁC HÀM XỬ LÝ SỰ KIỆN ---

    const openSaveModal = () => {
        const currentData = workflowBuilder.getWorkflow();
        if (currentData.nodes.length === 0) {
            alert("Sếp ơi, không thể lưu một workflow rỗng!");
            return;
        }
        const currentNameElement = document.querySelector(`#saved-workflows-list [data-id="${currentWorkflowId}"] .workflow-name`);
        const defaultName = currentWorkflowId && currentNameElement ? currentNameElement.textContent : `Workflow mới ${new Date().toLocaleString()}`;
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
            
            if (isNewSave) {
                await db.saveWorkflowVersion(currentWorkflowId, currentData);
                lastSavedVersionState = JSON.stringify(currentData);
                updateHistoryTabContent(); // Cập nhật tab lịch sử ngay
            }
            startAutoSaveTimer();
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi lưu workflow: ${error.message}`);
            alert(`Lỗi khi lưu workflow: ${error.message}`);
        }
    };

    const openLoadModal = async () => {
        try {
            const workflows = await db.getWorkflows();
            savedWorkflowsList.innerHTML = '';
            if (workflows.length === 0) {
                savedWorkflowsList.innerHTML = '<p class="text-center text-muted">Chưa có workflow nào được lưu.</p>';
            } else {
                workflows.forEach(wf => {
                    const item = document.createElement('div');
                    item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                    item.innerHTML = `
                        <div>
                            <h6 class="mb-0 workflow-name">${wf.name}</h6>
                            <small class="text-muted">Cập nhật lần cuối: ${new Date(wf.updatedAt).toLocaleString()}</small>
                        </div>
                        <div>
                            <button class="btn btn-sm btn-primary btn-open" data-id="${wf.id}"><i class="ri-folder-open-line"></i> Mở</button>
                            <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${wf.id}"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    `;
                    savedWorkflowsList.appendChild(item);
                });
            }
            loadWorkflowModal.show();
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi tải danh sách workflow: ${error.message}`);
        }
    };

    const handleWorkflowSelection = async (e) => {
        const openBtn = e.target.closest('.btn-open');
        const deleteBtn = e.target.closest('.btn-delete');

        if (openBtn) {
            const id = parseInt(openBtn.dataset.id, 10);
            const workflows = await db.getWorkflows();
            const wfToLoad = workflows.find(w => w.id === id);
            if (wfToLoad) {
                workflowBuilder.loadWorkflow(wfToLoad.data);
                currentWorkflowId = wfToLoad.id;
                loadWorkflowModal.hide();
                workflowBuilder.logger.system(`Đã mở workflow "${wfToLoad.name}".`);
                lastSavedVersionState = JSON.stringify(wfToLoad.data);
                startAutoSaveTimer();
                updateHistoryTabContent(); // *** MODIFIED: Cập nhật lịch sử khi mở
            }
        }

        if (deleteBtn) {
            const id = parseInt(deleteBtn.dataset.id, 10);
            if (confirm("Sếp có chắc muốn xóa workflow này không?")) {
                await db.deleteWorkflow(id);
                deleteBtn.closest('.list-group-item').remove();
                if (savedWorkflowsList.children.length === 0) {
                     savedWorkflowsList.innerHTML = '<p class="text-center text-muted">Chưa có workflow nào được lưu.</p>';
                }
            }
        }
    };
    
    const resetCurrentWorkflow = (event) => {
        const isFromJsonImport = event.detail?.workflow?.nodes[0]?.id.includes('_');
        if (event.type === 'workflow:cleared' || isFromJsonImport) {
            currentWorkflowId = null;
            stopAutoSaveTimer();
        }
    };

    // *** BẮT ĐẦU THAY ĐỔI: Logic mới cho Tab Lịch sử ***
    
    /**
     * Cập nhật nội dung của tab Lịch sử
     */
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
            // Chuyển về tab Khối để dễ làm việc
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
                        // Nếu tab lịch sử đang mở thì cập nhật luôn
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
    // *** KẾT THÚC THAY ĐỔI ***


    // --- GÁN SỰ KIỆN ---
    saveBtn.addEventListener('click', openSaveModal);
    confirmSaveBtn.addEventListener('click', handleConfirmSave);
    loadBtn.addEventListener('click', openLoadModal);
    savedWorkflowsList.addEventListener('click', handleWorkflowSelection);

    // *** MODIFIED: Cập nhật sự kiện cho tab thay vì modal
    historyTab.addEventListener('show.bs.tab', updateHistoryTabContent);

    workflowBuilder.addEventListener('workflow:cleared', resetCurrentWorkflow);
    workflowBuilder.addEventListener('workflow:loaded', resetCurrentWorkflow);

    // Khởi tạo trạng thái ban đầu
    stopAutoSaveTimer();
});