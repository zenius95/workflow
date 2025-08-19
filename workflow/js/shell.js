// workflow/js/shell.js
document.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');
    const path = require('path');
    const i18n = require('./js/i18n.js');

    // --- Load language and translate static UI elements ---
    i18n.loadLanguage('en'); // or 'vi', or load from user settings
    i18n.translateUI();
    // --- End of new code ---

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
    const workflowSearchInput = document.getElementById('workflow-search-input');
    const loadMoreContainer = document.getElementById('load-more-container');
    const loadMoreBtn = document.getElementById('load-more-btn');

    // State
    let tabCounter = 0;
    let activeTabId = null;
    let sortableInstance = null;
    let currentPage = 0;
    const WORKFLOWS_PER_PAGE = 15;
    let totalWorkflows = 0;
    let currentSearchTerm = '';
    let isFetching = false;

    const db = {
        async getWorkflows(options) {
            return await ipcRenderer.invoke('db-get-workflows', options);
        },
        async deleteWorkflow(id) {
            return await ipcRenderer.invoke('db-delete-workflow', id);
        }
    };

    const getWebviewUrl = (tabId, workflowId = null) => {
        const query = new URLSearchParams({ tabId });
        if (workflowId !== null) {
            query.set('workflowId', workflowId);
        }
        const filePath = path.join(__dirname, 'workflow.html');
        return `file://${filePath}?${query.toString()}`;
    };
    
    const findTabByWorkflowId = (workflowId) => {
        if (!workflowId || String(workflowId) === 'null') return null;
        return document.querySelector(`.tab-item[data-workflow-id="${workflowId}"]`);
    };

    const createNewTab = (options = {}) => {
        const { title, workflowId = null, focus = true } = options;
        tabCounter++;
        const tabId = `tab-${tabCounter}`;

        const tabEl = document.createElement('div');
        tabEl.className = 'tab-item';
        tabEl.dataset.tabId = tabId;
        tabEl.dataset.workflowId = String(workflowId);
        
        const tabTitle = workflowId === null ? i18n.get('shell.start_page') : title;
        tabEl.innerHTML = `<div class="tab-title">${tabTitle}</div><button class="close-tab-btn"><i class="ri-close-line"></i></button>`;
        
        tabBar.insertBefore(tabEl, addTabBtn);

        const webview = document.createElement('webview');
        webview.id = `webview-${tabId}`;
        webview.className = 'workflow-webview';
        const url = getWebviewUrl(tabId, workflowId);
        webview.setAttribute('src', url);
        webview.setAttribute('webpreferences', 'contextIsolation=false, nodeIntegration=true');

        webview.addEventListener('ipc-message', (event) => {
            const { channel, args } = event;
            const [data] = args;
            if (channel === 'updateTabTitle') {
                updateTab(data.tabId, { title: data.title, workflowId: data.workflowId });
            }
        });
        webviewContainer.appendChild(webview);
        if (focus) switchToTab(tabId);
        tabBar.scrollLeft = tabBar.scrollWidth;
        updateUiState();
    };
    
    const switchToTab = (tabId) => {
        if (activeTabId === tabId) return;

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
    
        const currentIdOnTab = tabEl.dataset.workflowId;
        const newId = String(workflowId);
    
        tabEl.querySelector('.tab-title').textContent = title;
        tabEl.dataset.workflowId = newId;
    
        if (currentIdOnTab !== newId) {
            const isOpeningFromStartPage = (currentIdOnTab === 'null' && ( newId !== 'creating' && !isNaN(parseInt(newId, 10)) ));
    
            if (isOpeningFromStartPage) {
                const newUrl = getWebviewUrl(tabId, newId);
                webview.loadURL(newUrl);
            } else {
                const newUrl = getWebviewUrl(tabId, newId);
                webview.executeJavaScript(`history.replaceState({}, '', '${newUrl}');`).catch(console.error);
            }
        }
    
        if (focus) {
            switchToTab(tabId);
        } else {
            updateUiState();
        }
    };

    const closeTab = (tabId) => {
        const tabEl = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
        const webview = document.getElementById(`webview-${tabId}`);
        if (!tabEl) return;

        const wasActive = tabEl.classList.contains('active');
        
        let nextTabToActivate = tabEl.previousElementSibling;
        if (!nextTabToActivate) {
            nextTabToActivate = tabEl.nextElementSibling;
            if (nextTabToActivate && nextTabToActivate.id === 'add-tab-btn') {
                 nextTabToActivate = null;
            }
        }
        
        tabEl.remove();
        if (webview) webview.remove();

        if (wasActive && nextTabToActivate) {
            switchToTab(nextTabToActivate.dataset.tabId);
        } else if (document.querySelectorAll('.tab-item').length === 0) {
            activeTabId = null;
            createNewTab({ workflowId: null });
        }
        
        const activeTabNow = document.querySelector('.tab-item.active');
        if (activeTabNow && activeTabNow.dataset.workflowId === 'null') {
            resetAndPopulateStartPage();
        }

        updateUiState();
    };

    // --- Start Page Logic ---
    const resetAndPopulateStartPage = () => {
        currentPage = 0;
        totalWorkflows = 0;
        startPageWorkflowList.innerHTML = '';
        loadMoreContainer.style.display = 'none';
        populateStartPage();
    };

    const populateStartPage = async (append = false) => {
        if (isFetching) return;
        isFetching = true;
        loadMoreBtn.disabled = true;

        try {
            const openIds = new Set(
                Array.from(document.querySelectorAll('.tab-item[data-workflow-id]'))
                    .map(tab => parseInt(tab.dataset.workflowId, 10))
                    .filter(id => !isNaN(id) && id > 0)
            );

            const { count, rows: workflows } = await db.getWorkflows({
                limit: WORKFLOWS_PER_PAGE,
                offset: currentPage * WORKFLOWS_PER_PAGE,
                searchTerm: currentSearchTerm
            });
            totalWorkflows = count;

            if (!append) {
                startPageWorkflowList.innerHTML = '';
            }
            
            if (workflows.length === 0 && !append) {
                startPageWorkflowList.innerHTML = `<p class="text-center text-muted p-3">${i18n.get('shell.no_workflows_found')}</p>`;
            } else {
                workflows.forEach(wf => {
                    const isOpen = openIds.has(wf.id);
                    const item = document.createElement('div');
                    item.className = 'workflow-list-item mb-3 rounded-3 shadow-sm p-3 bg-white';
                    if (isOpen) item.classList.add('bg-light');

                    item.innerHTML = `
                        <div class="workflow-list-item-main d-flex align-items-center position-relative" data-action="open-workflow" data-id="${wf.id}" data-name="${wf.name}">
                            <div class="text-white d-flex align-items-center justify-content-center rounded-3 bg-primary" style="width: 35px; height: 35px;">
                                <i class="ri-git-pull-request-line"></i>
                            </div>
                            <div class="flex-grow-1 ps-3">
                                <h5 class="${isOpen ? 'text-primary' : ''}">${wf.name}</h5>
                                <span>${i18n.get('shell.updated_at')}: ${new Date(wf.updatedAt).toLocaleString()}</span>
                            </div>
                            ${isOpen 
                                ? `<button class="btn btn-sm btn-primary me-2" data-action="switch-tab" data-workflow-id="${wf.id}">${i18n.get('shell.switch_tab')} <i class="ri-arrow-right-line ms-1"></i></button>`
                                : '<button class="btn rounded-3 btn-sm btn-light me-2"><i class="ri-folder-open-line"></i></button>'
                            }
                            <button class="btn rounded-3 btn-sm btn-light" data-action="delete-workflow" data-id="${wf.id}" data-name="${wf.name}"><i class="ri-more-fill"></i></button>
                        </div>
                       
                    `;
                    startPageWorkflowList.appendChild(item);
                });
            }

            const workflowsDisplayed = startPageWorkflowList.children.length;
            if (workflowsDisplayed < totalWorkflows) {
                loadMoreContainer.style.display = 'block';
            } else {
                loadMoreContainer.style.display = 'none';
            }

        } catch (error) {
            console.error(error);
            startPageWorkflowList.innerHTML = `<p class="text-center text-danger p-3">${i18n.get('shell.load_error')}</p>`;
        } finally {
            isFetching = false;
            loadMoreBtn.disabled = false;
        }
    };
    
    // --- UI State Management (Updated) ---
    const updateUiState = () => {
        const isStartTabActive = !!(document.querySelector('.tab-item.active')?.dataset.workflowId === 'null');
        startPageOverlay.style.display = isStartTabActive ? 'block' : 'none';
        
        if (isStartTabActive) {
            resetAndPopulateStartPage();
        }

        const anyStartTabExists = !!document.querySelector('.tab-item[data-workflow-id="null"]');
        addTabBtn.style.display = anyStartTabExists ? 'none' : 'flex';

        if (sortableInstance) {
            sortableInstance.option('disabled', anyStartTabExists);
        }
        
        const tabs = document.querySelectorAll('.tab-item');
        tabs.forEach(tab => {
            const closeBtn = tab.querySelector('.close-tab-btn');
            if (closeBtn) closeBtn.style.display = '';
        });

        if (tabs.length === 1 && anyStartTabExists) {
            const singleTab = tabs[0];
            const closeBtn = singleTab.querySelector('.close-tab-btn');
            if (closeBtn) closeBtn.style.display = 'none';
        }
    };


    const handleStartPageAction = async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        const workflowId = target.dataset.id || target.dataset.workflowId;
        
        switch (action) {
            case 'switch-tab': {
                const tabToSwitch = findTabByWorkflowId(workflowId);
                if (tabToSwitch) switchToTab(tabToSwitch.dataset.tabId);
                break;
            }
            case 'open-workflow': {
                const name = target.dataset.name;
                updateTab(activeTabId, { title: name, workflowId: workflowId });
                break;
            }
            case 'delete-workflow': {
                const name = target.dataset.name;
                const { response } = await ipcRenderer.invoke('show-confirm-dialog', {
                    type: 'warning',
                    buttons: [i18n.get('common.cancel'), i18n.get('common.delete')],
                    defaultId: 0,
                    title: i18n.get('shell.confirm_delete_title'),
                    message: i18n.get('shell.confirm_delete_message', { name: name }),
                    detail: i18n.get('shell.confirm_delete_detail')
                });
                
                if (response === 1) { // 1 is the index for the "Delete" button
                    const result = await db.deleteWorkflow(workflowId);
                    if (result.success) {
                        const tabToDelete = findTabByWorkflowId(workflowId);
                        if (tabToDelete) closeTab(tabToDelete.dataset.tabId);
                        resetAndPopulateStartPage();
                    } else {
                        console.error(i18n.get('shell.delete_error'), result.message);
                    }
                }
                break;
            }
        }
    };

    // --- Event Listeners ---
    createNewWorkflowBtn.addEventListener('click', () => {
        if (activeTabId) {
            updateTab(activeTabId, { title: i18n.get('app.unsaved_workflow'), workflowId: 'creating' });
        }
    });

    startPageWorkflowList.addEventListener('click', handleStartPageAction);
    
    let searchTimeout;
    workflowSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearchTerm = workflowSearchInput.value.trim();
            resetAndPopulateStartPage();
        }, 300); // Debounce
    });

    loadMoreBtn.addEventListener('click', () => {
        currentPage++;
        populateStartPage(true); // append = true
    });
    
    minimizeBtn.addEventListener('click', () => ipcRenderer.send('minimize-window'));
    maximizeBtn.addEventListener('click', () => ipcRenderer.send('maximize-window'));
    closeBtn.addEventListener('click', () => ipcRenderer.send('close-window'));
    ipcRenderer.on('window-state-changed', (event, { isMaximized }) => {
        maximizeBtnIcon.className = isMaximized ? 'ri-file-copy-line' : 'ri-checkbox-blank-line';
    });
    
    addTabBtn.addEventListener('click', () => {
        const existingStartTab = document.querySelector('.tab-item[data-workflow-id="null"]');
        if (existingStartTab) {
            switchToTab(existingStartTab.dataset.tabId);
        } else {
            createNewTab({ workflowId: null });
        }
    });

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
        if (e.deltaY !== 0) { e.preventDefault(); tabBar.scrollLeft += e.deltaY; }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12') {
            e.preventDefault();
            const activeWebview = document.querySelector('.workflow-webview.active');
            if (activeWebview) {
                activeWebview.openDevTools();
            }
        }
    });
    
    // --- Initialization ---
    sortableInstance = new Sortable(tabBar, {
        animation: 200,
        ghostClass: 'tab-ghost',
        dragClass: 'tab-dragging',
        filter: '#add-tab-btn',
    });

    createNewTab({ workflowId: null });
});