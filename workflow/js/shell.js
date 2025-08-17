// workflow/js/shell.js
document.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');

    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    const maximizeBtnIcon = maximizeBtn.querySelector('i');

    const tabBar = document.getElementById('tab-bar');
    const addTabBtn = document.getElementById('add-tab-btn');
    const webviewContainer = document.getElementById('webview-container');

    let tabCounter = 0;
    let activeTabId = null;
    
    const findTabByWorkflowId = (workflowId) => {
        if (!workflowId || String(workflowId) === 'null') {
            return null;
        }
        return document.querySelector(`.tab-item[data-workflow-id="${workflowId}"]`);
    };

    const createNewTab = (options = {}) => {
        const { title = 'Workflow Mới', workflowId = null, focus = true } = options;

        tabCounter++;
        const tabId = `tab-${tabCounter}`;

        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';
        tabEl.dataset.tabId = tabId;
        tabEl.dataset.workflowId = String(workflowId);
        tabEl.innerHTML = `
            <div class="tab-title">${title}</div>
            <button class="close-tab-btn"><i class="ri-close-line"></i></button>
        `;

        tabBar.appendChild(tabEl);

        const webview = document.createElement('webview');
        webview.id = `webview-${tabId}`;
        webview.className = 'workflow-webview';
        const url = `workflow.html?tabId=${tabId}` + (workflowId ? `&workflowId=${workflowId}` : '');
        webview.setAttribute('src', url);
        
        webview.setAttribute('webpreferences', 'contextIsolation=false, nodeIntegration=true');

        webview.addEventListener('ipc-message', (event) => {
            const { channel, args } = event;
            const [data] = args;
            
            if (channel === 'getOpenWorkflows-request') {
                const openIds = Array.from(document.querySelectorAll('.tab-item[data-workflow-id]'))
                    .map(tab => parseInt(tab.dataset.workflowId, 10))
                    .filter(id => !isNaN(id) && id > 0);
                
                const requestingWebview = document.getElementById(`webview-${data.tabId}`);
                if (requestingWebview) {
                    requestingWebview.send('getOpenWorkflows-response', { openIds });
                }
                return;
            }

            if (channel === 'switchToWorkflow') {
                const tabToSwitch = findTabByWorkflowId(data.workflowId);
                if (tabToSwitch) {
                    switchToTab(tabToSwitch.dataset.tabId);
                    tabToSwitch.classList.add('tab-flash');
                    setTimeout(() => tabToSwitch.classList.remove('tab-flash'), 500);
                }
                return;
            }

            if (channel === 'updateTabTitle') {
                updateTab(data.tabId, { title: data.title, workflowId: data.workflowId });
            } 
        });

        webviewContainer.appendChild(webview);

        if (focus) {
            switchToTab(tabId);
        }
        
        tabBar.scrollLeft = tabBar.scrollWidth;
    };
    
    const isTabNew = (tabId) => {
        const tab = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        return tab && tab.dataset.workflowId === 'null';
    };

    const switchToTab = (tabId) => {
        if (activeTabId === tabId) return;

        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        const tabToActivate = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        if (tabToActivate) {
            tabToActivate.classList.add('active');
            activeTabId = tabId;
        }

        document.querySelectorAll('.workflow-webview').forEach(wv => wv.classList.remove('active'));
        const webviewToActivate = document.getElementById(`webview-${tabId}`);
        if (webviewToActivate) {
            webviewToActivate.classList.add('active');
        }
    };
    
    const updateTab = (tabId, { title, workflowId, focus = false }) => {
        const tabEl = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        const webview = document.getElementById(`webview-${tabId}`);

        if (!tabEl || !webview) {
            console.error(`Không tìm thấy tab hoặc webview cho ID: ${tabId}`);
            return;
        }

        const currentWorkflowId = tabEl.dataset.workflowId;
        const isFirstSave = (currentWorkflowId === 'null' && String(workflowId) !== 'null');

        // *** BẮT ĐẦU SỬA LỖI: Tránh reload khi lưu lần đầu ***
        if (isFirstSave) {
            // Nếu đây là lần lưu đầu tiên, chỉ cần cập nhật URL của webview một cách "thầm lặng"
            // bằng cách thực thi một đoạn script nhỏ, thay vì tải lại toàn bộ trang.
            const newUrl = new URL(`workflow.html?tabId=${tabId}&workflowId=${workflowId}`, window.location.href).href;
            const script = `history.replaceState({}, '', '${newUrl}');`;
            webview.executeJavaScript(script).catch(err => console.error('Failed to update URL:', err));
        } else if (String(currentWorkflowId) !== String(workflowId)) {
            // Nếu ID workflow thực sự thay đổi (ví dụ: mở một workflow khác vào tab này),
            // thì chúng ta vẫn cần tải lại để hiển thị đúng nội dung.
            const newUrl = new URL(`workflow.html?tabId=${tabId}&workflowId=${workflowId}`, window.location.href).href;
            if (newUrl) {
                webview.loadURL(newUrl);
            }
        }
        // *** KẾT THÚC SỬA LỖI ***
        
        // Luôn cập nhật thông tin hiển thị và trạng thái của tab
        tabEl.querySelector('.tab-title').textContent = title;
        tabEl.dataset.workflowId = String(workflowId);
        
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
            activeTabId = null;
            createNewTab();
        }
    };
    
    minimizeBtn.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });

    maximizeBtn.addEventListener('click', () => {
        ipcRenderer.send('maximize-window');
    });

    closeBtn.addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });

    ipcRenderer.on('window-state-changed', (event, { isMaximized }) => {
        if (isMaximized) {
            maximizeBtnIcon.className = 'ri-file-copy-2-line';
        } else {
            maximizeBtnIcon.className = 'ri-checkbox-blank-line';
        }
    });

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

    tabBar.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            tabBar.scrollLeft += e.deltaY;
        }
    });

    new Sortable(tabBar, {
        animation: 200,
        ghostClass: 'tab-ghost',
        dragClass: 'tab-dragging',
    });

    createNewTab();
});