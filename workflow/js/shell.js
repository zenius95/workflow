// shell.js
document.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');

    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    // *** BẮT ĐẦU THAY ĐỔI: Lấy tham chiếu đến icon bên trong nút maximize ***
    const maximizeBtnIcon = maximizeBtn.querySelector('i');
    // *** KẾT THÚC THAY ĐỔI ***

    const tabBar = document.getElementById('tab-bar');
    const addTabBtn = document.getElementById('add-tab-btn');
    const webviewContainer = document.getElementById('webview-container');

    let tabCounter = 0;
    let activeTabId = null;

    const createNewTab = (options = {}) => {
        const { title = 'Workflow Mới', workflowId = null, focus = true, sourceTabId = null } = options;

        tabCounter++;
        const tabId = `tab-${tabCounter}`;

        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';
        tabEl.dataset.tabId = tabId;
        tabEl.dataset.workflowId = workflowId;
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
            
            if (channel === 'updateTabTitle') {
                updateTab(data.tabId, { title: data.title, workflowId: data.workflowId });
            } else if (channel === 'openWorkflowInNewTab') {
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

        if (tabEl) {
            tabEl.querySelector('.tab-title').textContent = title;
            tabEl.dataset.workflowId = workflowId;
        }

        if (webview) {
            const newUrl = `workflow.html?tabId=${tabId}&workflowId=${workflowId}`;
            const currentUrl = new URL(webview.getURL());
            const currentWorkflowId = currentUrl.searchParams.get('workflowId');
            
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

    // *** BẮT ĐẦU THAY ĐỔI: Lắng nghe và cập nhật icon maximize ***
    ipcRenderer.on('window-state-changed', (event, { isMaximized }) => {
        if (isMaximized) {
            // Thay icon thành "restore" (thu nhỏ lại)
            maximizeBtnIcon.className = 'ri-file-copy-2-line';
        } else {
            // Trả icon về "maximize"
            maximizeBtnIcon.className = 'ri-checkbox-blank-line';
        }
    });
    // *** KẾT THÚC THAY ĐỔI ***

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