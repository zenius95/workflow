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


    // --- STATE QUẢN LÝ ---
    let currentWorkflowId = null; // Để theo dõi workflow đang được chỉnh sửa

    // --- CÁC HÀM XỬ LÝ SỰ KIỆN ---

    /**
     * Mở modal để người dùng nhập tên và lưu workflow.
     */
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

    /**
     * Xử lý logic lưu sau khi người dùng xác nhận trong modal.
     */
    const handleConfirmSave = async () => {
        const name = workflowNameInput.value.trim();
        if (!name) {
            alert("Tên workflow không được để trống!");
            return;
        }

        const currentData = workflowBuilder.getWorkflow();
        try {
            const saved = await db.saveWorkflow(name, currentData, currentWorkflowId);
            currentWorkflowId = saved.id; // Cập nhật ID sau khi lưu
            saveWorkflowModal.hide();
            workflowBuilder.logger.success(`Đã lưu workflow "${name}" thành công!`);
        } catch (error) {
            workflowBuilder.logger.error(`Lỗi khi lưu workflow: ${error.message}`);
            alert(`Lỗi khi lưu workflow: ${error.message}`);
        }
    };

    /**
     * Lấy danh sách workflows từ DB và hiển thị modal.
     */
    const openLoadModal = async () => {
        try {
            const workflows = await db.getWorkflows();
            savedWorkflowsList.innerHTML = ''; // Xóa danh sách cũ
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

    /**
     * Xử lý khi người dùng chọn Mở hoặc Xóa một workflow trong modal.
     */
    const handleWorkflowSelection = async (e) => {
        const openBtn = e.target.closest('.btn-open');
        const deleteBtn = e.target.closest('.btn-delete');

        if (openBtn) {
            const id = parseInt(openBtn.dataset.id, 10);
            const workflows = await db.getWorkflows();
            const wfToLoad = workflows.find(w => w.id === id);
            if (wfToLoad) {
                workflowBuilder.loadWorkflow(wfToLoad.data);
                currentWorkflowId = wfToLoad.id; // Cập nhật ID của workflow đang mở
                loadWorkflowModal.hide();
                workflowBuilder.logger.system(`Đã mở workflow "${wfToLoad.name}".`);
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
    
    /**
     * Reset ID của workflow hiện tại để khi lưu sẽ là "Lưu mới" thay vì "Cập nhật".
     */
    const resetCurrentWorkflowId = (event) => {
        const isFromJsonImport = event.detail?.workflow?.nodes[0]?.id.includes('_');
        if (event.type === 'workflow:cleared' || isFromJsonImport) {
            currentWorkflowId = null;
        }
    };


    // --- GÁN SỰ KIỆN ---
    saveBtn.addEventListener('click', openSaveModal);
    confirmSaveBtn.addEventListener('click', handleConfirmSave);
    loadBtn.addEventListener('click', openLoadModal);
    savedWorkflowsList.addEventListener('click', handleWorkflowSelection);

    workflowBuilder.addEventListener('workflow:cleared', resetCurrentWorkflowId);
    workflowBuilder.addEventListener('workflow:loaded', resetCurrentWorkflowId);
});