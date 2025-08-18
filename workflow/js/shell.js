// workflow/js/shell.js
document.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');

    // DOM Elements
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const maximizeBtnIcon = maximizeBtn.querySelector('i');
    const tabBar = document.getElementById('tab-bar');
    const addTabBtn = document.getElementById('add-tab-btn');
    const webviewContainer = document.getElementById('webview-container');
    const startPageOverlay = document.getElementById('start-page-overlay');
    const createNewWorkflowBtn = document.querySelector('[data-action="create-new-workflow"]');
    const startPageWorkflowList = document.getElementById('start-page-workflow-list');

    // State
    let tabCounter = 0;
    let activeTabId = null;
    let sortableInstance = null;

    const db = {
        async getWorkflows() {
            return await ipcRenderer.invoke('db-get-workflows');
        }
    };

    // --- UI State Management ---
    const updateUiState = () => {
        const tabs = document.querySelectorAll('.tab-item');
        let isStartTabActive = false;
        
        const activeTabEl = document.querySelector('.tab-item.active');
        if (activeTabEl && activeTabEl.dataset.workflowId === 'null') {
            isStartTabActive = true;
        }

        // Show/Hide Overlay
        startPageOverlay.style.display = isStartTabActive ? 'flex' : 'none';
        if(isStartTabActive) {
            populateStartPage();
        }

        // Reset visibility for all close buttons first
        tabs.forEach(tab => {
            const closeBtn = tab.querySelector('.close-tab-btn');
            if (closeBtn) closeBtn.style.display = '';
        });

        // Hide Add Tab button if any start tab exists
        const anyStartTabExists = !!document.querySelector('.tab-item[data-workflow-id="null"]');
        addTabBtn.style.display = anyStartTabExists ? 'none' : 'flex';

        // Disable/Enable sorting
        if (sortableInstance) {
            sortableInstance.option('disabled', anyStartTabExists);
        }

        // Hide close button on single start tab
        if (tabs.length === 1 && anyStartTabExists) {
            const singleTab = tabs[0];
            const closeBtn = singleTab.querySelector('.close-tab-btn');
            if (closeBtn) closeBtn.style.display = 'none';
        }
    };

    // --- Tab Management ---
    const findTabByWorkflowId = (workflowId) => {
        if (!workflowId || String(workflowId) === 'null') return null;
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
        tabEl.innerHTML = `<div class="tab-title">${title}</div><button class="close-tab-btn"><i class="ri-close-line"></i></button>`;
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
            } else if (channel === 'switchToWorkflow') {
                const tabToSwitch = findTabByWorkflowId(data.workflowId);
                if (tabToSwitch) {
                    switchToTab(tabToSwitch.dataset.tabId);
                    tabToSwitch.classList.add('tab-flash');
                    setTimeout(() => tabToSwitch.classList.remove('tab-flash'), 500);
                }
            }
        });
        webviewContainer.appendChild(webview);
        if (focus) switchToTab(tabId);
        tabBar.scrollLeft = tabBar.scrollWidth;
        updateUiState();
    };
    
    const switchToTab = (tabId) => {
        if (activeTabId === tabId) return;

        const startTab = document.querySelector('.tab-item[data-workflow-id="null"]');
        if (startTab && startTab.dataset.tabId !== tabId) {
            closeTab(startTab.dataset.tabId);
        }

        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.workflow-webview').forEach(wv => wv.classList.remove('active'));

        const tabToActivate = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        if (tabToActivate) {
            tabToActivate.classList.add('active');
            activeTabId = tabId;
            const webviewToActivate = document.getElementById(`webview-${tabId}`);
            if (webviewToActivate) webviewToActivate.classList.add('active');
        }
        updateUiState();
    };

    const updateTab = (tabId, { title, workflowId, focus = false }) => {
        const tabEl = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        const webview = document.getElementById(`webview-${tabId}`);
        if (!tabEl || !webview) return;

        const currentWorkflowId = tabEl.dataset.workflowId;
        const isBecomingReal = ((currentWorkflowId === 'null' || currentWorkflowId === 'creating') && !isNaN(parseInt(workflowId, 10)));
        const isStartingNew = (currentWorkflowId === 'null' && workflowId === 'creating');

        if (isBecomingReal) {
            const newUrl = new URL(`workflow.html?tabId=${tabId}&workflowId=${workflowId}`, window.location.href).href;
            const script = `history.replaceState({}, '', '${newUrl}');`;
            webview.executeJavaScript(script).catch(err => console.error('Failed to update URL:', err));
        } else if (isStartingNew) {
            // Do nothing to the webview, just update state
        } else if (String(currentWorkflowId) !== String(workflowId)) {
            const newUrl = new URL(`workflow.html?tabId=${tabId}&workflowId=${workflowId}`, window.location.href).href;
            if (newUrl) webview.loadURL(newUrl);
        }
        
        tabEl.querySelector('.tab-title').textContent = title;
        tabEl.dataset.workflowId = String(workflowId);
        
        if (focus) switchToTab(tabId);
        else updateUiState();
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
        updateUiState();
    };

    // --- Start Page Logic ---
    const populateStartPage = async () => {
        try {
            const openIds = new Set(Array.from(document.querySelectorAll('.tab-item[data-workflow-id]'))
                .map(tab => parseInt(tab.dataset.workflowId, 10))
                .filter(id => !isNaN(id) && id > 0));
            
            const workflows = await db.getWorkflows();
            startPageWorkflowList.innerHTML = '';

            if (workflows.length === 0) {
                startPageWorkflowList.innerHTML = '<p class="text-center text-muted p-3">Sếp chưa lưu workflow nào cả.</p>';
            } else {
                workflows.forEach(wf => {
                    const isOpen = openIds.has(wf.id);
                    const item = document.createElement('div');
                    item.className = 'list-group-item list-group-item-action workflow-list-item d-flex justify-content-between align-items-center';
                    if (isOpen) item.classList.add('bg-light');

                    item.innerHTML = `<div><h5 class="${isOpen ? 'text-primary' : ''}">${wf.name}</h5><small>Cập nhật: ${new Date(wf.updatedAt).toLocaleString()}</small></div>`;
                    
                    if (isOpen) {
                        const switchBtn = document.createElement('button');
                        switchBtn.className = 'btn btn-sm btn-primary';
                        switchBtn.innerHTML = 'Chuyển Tab <i class="ri-arrow-right-line ms-1"></i>';
                        switchBtn.dataset.action = 'switch-tab';
                        switchBtn.dataset.workflowId = wf.id;
                        item.appendChild(switchBtn);
                    } else {
                        const icon = document.createElement('i');
                        icon.className = 'ri-arrow-right-s-line';
                        item.appendChild(icon);
                        item.dataset.action = 'open-workflow';
                        item.dataset.id = wf.id;
                        item.dataset.name = wf.name;
                    }
                    startPageWorkflowList.appendChild(item);
                });
            }
        } catch (error) {
            console.error(error);
            startPageWorkflowList.innerHTML = '<p class="text-center text-danger p-3">Không thể tải danh sách workflow.</p>';
        }
    };

    const handleStartPageAction = (e) => {
        const switchBtn = e.target.closest('[data-action="switch-tab"]');
        if (switchBtn) {
            const tabToSwitch = findTabByWorkflowId(switchBtn.dataset.workflowId);
            if (tabToSwitch) switchToTab(tabToSwitch.dataset.tabId);
            return;
        }

        const openBtn = e.target.closest('[data-action="open-workflow"]');
        if (openBtn) {
            const id = parseInt(openBtn.dataset.id, 10);
            const name = openBtn.dataset.name;
            updateTab(activeTabId, { title: name, workflowId: id });
            return;
        }
    };
    
    // --- Event Listeners ---
    createNewWorkflowBtn.addEventListener('click', () => {
        if (activeTabId) {
            updateTab(activeTabId, { title: 'Workflow Chưa Lưu', workflowId: 'creating' });
        }
    });
    startPageWorkflowList.addEventListener('click', handleStartPageAction);

    minimizeBtn.addEventListener('click', () => ipcRenderer.send('minimize-window'));
    maximizeBtn.addEventListener('click', () => ipcRenderer.send('maximize-window'));
    closeBtn.addEventListener('click', () => ipcRenderer.send('close-window'));
    ipcRenderer.on('window-state-changed', (event, { isMaximized }) => {
        maximizeBtnIcon.className = isMaximized ? 'ri-file-copy-2-line' : 'ri-checkbox-blank-line';
    });
    addTabBtn.addEventListener('click', () => createNewTab());
    tabBar.addEventListener('click', (e) => {
        const targetTab = e.target.closest('.tab-item');
        if (!targetTab) return;
        if (e.target.closest('.close-tab-btn')) closeTab(targetTab.dataset.tabId);
        else switchToTab(targetTab.dataset.tabId);
    });
    tabBar.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) { e.preventDefault(); tabBar.scrollLeft += e.deltaY; }
    });

    // --- Initialization ---
    sortableInstance = new Sortable(tabBar, {
        animation: 200,
        ghostClass: 'tab-ghost',
        dragClass: 'tab-dragging',
    });

    createNewTab();
});