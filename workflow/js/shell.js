// shell.js
document.addEventListener('DOMContentLoaded', () => {
    const tabBar = document.getElementById('tab-bar');
    const addTabBtn = document.getElementById('add-tab-btn');
    const webviewContainer = document.getElementById('webview-container');

    let tabCounter = 0;
    let activeTabId = null;

    const createNewTab = (options = {}) => {
        const { title = 'Workflow Mới', workflowId = null, focus = true, sourceTabId = null } = options;

        tabCounter++;
        const tabId = `tab-${tabCounter}`;

        // Tạo phần tử tab trên UI
        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';
        tabEl.dataset.tabId = tabId;
        // Gán workflowId vào dataset để kiểm tra sau này
        tabEl.dataset.workflowId = workflowId;
        tabEl.innerHTML = `
            <span class="tab-title">${title}</span>
            <button class="close-tab-btn"><i class="ri-close-line"></i></button>
        `;

        tabBar.appendChild(tabEl);

        // Tạo webview để chứa nội dung workflow
        const webview = document.createElement('webview');
        webview.id = `webview-${tabId}`;
        webview.className = 'workflow-webview';
        const url = `workflow.html?tabId=${tabId}` + (workflowId ? `&workflowId=${workflowId}` : '');
        webview.setAttribute('src', url);
        webview.setAttribute('nodeintegration', 'true');
        webview.setAttribute('webpreferences', 'contextIsolation=false');

        // Lắng nghe các thông điệp từ webview
        webview.addEventListener('ipc-message', (event) => {
            const { channel, args } = event;
            const [data] = args;
            
            if (channel === 'updateTabTitle') {
                updateTab(data.tabId, { title: data.title, workflowId: data.workflowId });
            } else if (channel === 'openWorkflowInNewTab') {
                // Nếu tab hiện tại là "Workflow Mới", ta sẽ tái sử dụng nó
                if (isTabNew(data.sourceTabId)) {
                     updateTab(data.sourceTabId, { title: data.name, workflowId: data.workflowId, focus: true });
                } else {
                    createNewTab({ title: data.name, workflowId: data.workflowId, focus: true });
                }
            }
        });

        webviewContainer.appendChild(webview);

        if (focus) {
            switchToTab(tabId);
        }
    };
    
    // Hàm kiểm tra xem một tab có phải là tab "Workflow Mới" hay không
    const isTabNew = (tabId) => {
        const tab = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        // So sánh với chuỗi 'null' vì dataset luôn là string
        return tab && tab.dataset.workflowId === 'null';
    };

    const switchToTab = (tabId) => {
        if (activeTabId === tabId) return;

        // Cập nhật trạng thái active cho các tab
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        const tabToActivate = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        if (tabToActivate) {
            tabToActivate.classList.add('active');
            activeTabId = tabId;
        }

        // Cập nhật trạng thái active cho các webview
        document.querySelectorAll('.workflow-webview').forEach(wv => wv.classList.remove('active'));
        const webviewToActivate = document.getElementById(`webview-${tabId}`);
        if (webviewToActivate) {
            webviewToActivate.classList.add('active');
        }
    };
    
    const updateTab = (tabId, { title, workflowId, focus = false }) => {
        const tabEl = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        const webview = document.getElementById(`webview-${tabId}`);

        if (tabEl) {
            tabEl.querySelector('.tab-title').textContent = title;
            tabEl.dataset.workflowId = workflowId;
        }

        if (webview) {
            const newUrl = `workflow.html?tabId=${tabId}&workflowId=${workflowId}`;
            const currentUrl = new URL(webview.getURL());
            const currentWorkflowId = currentUrl.searchParams.get('workflowId');
            
            // Chỉ tải lại URL nếu workflowId thay đổi
            if (String(currentWorkflowId) !== String(workflowId)) {
                 webview.loadURL(newUrl);
            }
        }
        
        if (focus) {
            switchToTab(tabId);
        }
    };

    const closeTab = (tabId) => {
        const tabEl = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        const webview = document.getElementById(`webview-${tabId}`);
        
        if (!tabEl) return;

        const wasActive = tabEl.classList.contains('active');
        const sibling = tabEl.previousElementSibling || tabEl.nextElementSibling;
        
        tabEl.remove();
        if (webview) webview.remove();

        if (wasActive && sibling) {
            switchToTab(sibling.dataset.tabId);
        } else if (document.querySelectorAll('.tab-item').length === 0) {
            // Nếu không còn tab nào, tạo một tab "Workflow Mới"
            activeTabId = null;
            createNewTab();
        }
    };

    // --- Event Listeners ---
    addTabBtn.addEventListener('click', () => createNewTab());

    tabBar.addEventListener('click', (e) => {
        const targetTab = e.target.closest('.tab-item');
        if (!targetTab) return;

        if (e.target.closest('.close-tab-btn')) {
            closeTab(targetTab.dataset.tabId);
        } else {
            switchToTab(targetTab.dataset.tabId);
        }
    });

    // Kích hoạt tính năng kéo/thả để sắp xếp tab
    new Sortable(tabBar, {
        animation: 150,
        ghostClass: 'tab-ghost'
    });

    // Khởi tạo tab đầu tiên
    createNewTab();
});