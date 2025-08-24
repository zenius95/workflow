// workflow/js/shell.js
document.addEventListener('DOMContentLoaded', () => {
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

    // The `db` object is now replaced by window.api
    const db = window.api;

    const getWebviewUrl = (tabId, workflowId = null) => {
        // Note: The path is now relative to shell.html
        const baseUrl = 'workflow.html';
        const query = new URLSearchParams({ tabId });
        if (workflowId !== null) {
            query.set('workflowId', workflowId);
        }
        return `${baseUrl}?${query.toString()}`;
    };
    
    const findTabByWorkflowId = (workflowId) => {
        if (!workflowId || String(workflowId) === 'null') return null;
        return document.querySelector(`.tab-item[data-workflow-id="${workflowId}"]`);
    };

    const createNewTab = async (options = {}) => {
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
        
        // Attach the same preload script to the webview
        const preloadPath = await window.api.getPreloadPath();
        webview.setAttribute('preload', `file://${preloadPath}`);

        webview.addEventListener('ipc-message', async (event) => {
            const { channel, args } = event;
            const [data] = args;
            if (channel === 'updateTabTitle') {
                updateTab(data.tabId, { title: data.title, workflowId: data.workflowId });
            }
            if (channel === 'open-workflow-in-new-tab') {
                const workflowId = data;
                const existingTab = findTabByWorkflowId(workflowId);
                if (existingTab) {
                    switchToTab(existingTab.dataset.tabId);
                    return;
                }
                try {
                    const wf = await db.getWorkflowById(workflowId);
                    if (wf) {
                        await createNewTab({ title: wf.name, workflowId: wf.id });
                    }
                } catch (error) {
                    console.error('Failed to open workflow in new tab:', error);
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
    
        // If we are on the start page, we need to do a full load to show the workflow editor.
        if (currentIdOnTab === 'null') {
            const newUrl = getWebviewUrl(tabId, newId);
            webview.setAttribute('src', newUrl); // FIX: Use setAttribute instead of loadURL
        } 
        // If the ID changes from 'creating' to a real ID, just update the URL without reloading.
        else if (currentIdOnTab === 'creating' && newId !== 'creating') {
            const newUrl = getWebviewUrl(tabId, newId);
            webview.executeJavaScript(`history.replaceState({}, '', '${newUrl}');`).catch(console.error);
        }
        // Other cases (like renaming) don't require a URL change, just a title update which is already done.
    
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
                                <div class="position-relative">
                                    <strong class="workflow-name-display d-block ${isOpen ? 'text-primary' : ''}">${wf.name}</strong>
                                    <input type="text" class="fw-bold workflow-name-input position-absolute top-0" value="${wf.name}" style="display: none;" />
                                </div>
                                <span class="small">${i18n.get('shell.updated_at')}: ${new Date(wf.updatedAt).toLocaleString()}</span>
                            </div>
                            ${isOpen 
                                ? `<button class="btn btn-sm btn-primary me-2" data-action="switch-tab" data-workflow-id="${wf.id}">${i18n.get('shell.switch_tab')} <i class="ri-arrow-right-line ms-1"></i></button>`
                                : '<button class="btn rounded-3 btn-sm btn-light me-2"><i class="ri-folder-open-line"></i></button>'
                            }
                            <button class="btn rounded-3 btn-sm btn-light" data-action="workflow-setting"><i class="ri-more-fill"></i></button>
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

    // --- Các hàm quản lý Menu cho từng Workflow Item ---
    const hideWorkflowMenu = () => {
        const existingMenu = document.getElementById('workflow-item-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
        document.removeEventListener('click', hideWorkflowMenu);
    };

    const showWorkflowMenu = (workflowId, name, targetButton) => {
        const existingMenu = document.getElementById('workflow-item-menu');
        if (existingMenu && existingMenu.dataset.openerId === String(workflowId)) {
            hideWorkflowMenu();
            return;
        }

        hideWorkflowMenu();

        const rect = targetButton.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.id = 'workflow-item-menu';
        menu.className = 'context-menu';
        menu.dataset.openerId = workflowId;
        
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.right}px`;
        menu.style.transform = 'translateX(-100%)';

        const renameItem = document.createElement('div');
        renameItem.className = 'context-menu-item';
        renameItem.innerHTML = `<i class="ri-pencil-line"></i> ${i18n.get('common.rename')}`;
        renameItem.addEventListener('click', () => handleRenameAction(workflowId));

        const duplicateItem = document.createElement('div');
        duplicateItem.className = 'context-menu-item';
        duplicateItem.innerHTML = `<i class="ri-file-copy-line"></i> ${i18n.get('common.duplicate')}`;
        duplicateItem.addEventListener('click', () => handleDuplicateAction(workflowId, name));

        const separator = document.createElement('div');
        separator.className = 'context-menu-separator';

        const deleteItem = document.createElement('div');
        deleteItem.className = 'context-menu-item context-menu-item-danger';
        deleteItem.innerHTML = `<i class="ri-delete-bin-line"></i> ${i18n.get('common.delete')}`;
        deleteItem.addEventListener('click', () => handleDeleteAction(workflowId, name));

        menu.appendChild(renameItem);
        menu.appendChild(duplicateItem);
        menu.appendChild(separator);
        menu.appendChild(deleteItem);

        document.body.appendChild(menu);

        setTimeout(() => {
            document.addEventListener('click', hideWorkflowMenu, { once: true });
        }, 0);
    };

    // --- Các hàm xử lý hành động từ Menu ---
    const handleRenameAction = (workflowId) => {
        hideWorkflowMenu();
        const itemElement = startPageWorkflowList.querySelector(`[data-id="${workflowId}"]`).closest('.workflow-list-item');
        const nameDisplay = itemElement.querySelector('.workflow-name-display');
        const nameInput = itemElement.querySelector('.workflow-name-input');
        
        nameDisplay.style.display = 'none';
        nameInput.style.display = 'block';
        nameInput.focus();
        nameInput.select();

        const saveRename = async () => {
            nameInput.removeEventListener('blur', saveRename);
            nameInput.removeEventListener('keydown', handleKeydown);
            
            const newName = nameInput.value.trim();
            nameInput.style.display = 'none';
            nameDisplay.style.display = 'block';

            const originalName = nameDisplay.textContent;

            if (newName && newName !== originalName) {
                try {
                    const workflow = await db.getWorkflowById(workflowId);
                    if (workflow) {
                        await db.saveWorkflow({ name: newName, data: workflow.data, id: workflowId });
                        nameDisplay.textContent = newName;
                        itemElement.querySelector('.workflow-list-item-main').dataset.name = newName;
                        
                        const tabToUpdate = findTabByWorkflowId(workflowId);
                        if (tabToUpdate) {
                            updateTab(tabToUpdate.dataset.tabId, { title: newName, workflowId });
                            
                            const webview = document.getElementById(`webview-${tabToUpdate.dataset.tabId}`);
                            if (webview) {
                                webview.send('workflow-renamed', { newName: newName });
                            }
                        }
                    }
                } catch (error) {
                    console.error("Failed to rename workflow:", error);
                    nameDisplay.textContent = originalName;
                }
            }
        };
        
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveRename();
            } else if (e.key === 'Escape') {
                nameInput.value = nameDisplay.textContent;
                saveRename();
            }
        };

        nameInput.addEventListener('blur', saveRename);
        nameInput.addEventListener('keydown', handleKeydown);
    };

    const handleDuplicateAction = async (workflowId, name) => {
        hideWorkflowMenu();
        try {
            const workflowToDuplicate = await db.getWorkflowById(workflowId);
            if (workflowToDuplicate) {
                const newName = `${name} (Copy)`;
                const newWorkflow = await db.saveWorkflow({ name: newName, data: workflowToDuplicate.data });
                if (newWorkflow) {
                    resetAndPopulateStartPage();
                }
            }
        } catch(error) {
            console.error("Failed to duplicate workflow:", error);
        }
    };

    const handleDeleteAction = async (workflowId, name) => {
        hideWorkflowMenu();
        
        Swal.fire({
            title: i18n.get('shell.confirm_delete_title'),
            html: i18n.get('shell.confirm_delete_message', { name: `<b>${name}</b>` }) + `<br><small>${i18n.get('shell.confirm_delete_detail')}</small>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: i18n.get('common.delete'),
            cancelButtonText: i18n.get('common.cancel'),
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            reverseButtons: true
        }).then(async (result) => {
            if (result.isConfirmed) {
                const deleteResult = await db.deleteWorkflow(workflowId);
                if (deleteResult.success) {
                    const tabToDelete = findTabByWorkflowId(workflowId);
                    if (tabToDelete) closeTab(tabToDelete.dataset.tabId);
                    resetAndPopulateStartPage();
                    Swal.fire(
                      i18n.get('shell.deleted_title'),
                      i18n.get('shell.deleted_text', { name: name }),
                      'success'
                    )
                } else {
                    console.error(i18n.get('shell.delete_error'), deleteResult.message);
                    Swal.fire(
                      i18n.get('shell.delete_error_title'),
                      deleteResult.message,
                      'error'
                    )
                }
            }
        })
    };

    const handleStartPageAction = async (e) => {
        if (e.target.classList.contains('workflow-name-input')) {
            return;
        }

        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const listItemMain = target.closest('.workflow-list-item-main');

        switch (action) {
            case 'switch-tab': {
                const workflowId = target.dataset.workflowId;
                const tabToSwitch = findTabByWorkflowId(workflowId);
                if (tabToSwitch) switchToTab(tabToSwitch.dataset.tabId);
                break;
            }
            case 'open-workflow': {
                const workflowId = listItemMain.dataset.id;
                const existingTab = findTabByWorkflowId(workflowId);
                if (existingTab) {
                    switchToTab(existingTab.dataset.tabId);
                } else {
                    const name = listItemMain.dataset.name;
                    updateTab(activeTabId, { title: name, workflowId: workflowId });
                }
                break;
            }
            case 'workflow-setting': {
                e.stopPropagation(); 
                const workflowId = listItemMain.dataset.id;
                const workflowName = listItemMain.querySelector('.workflow-name-display').textContent;
                showWorkflowMenu(workflowId, workflowName, target);
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
    
    minimizeBtn.addEventListener('click', () => window.api.minimizeWindow());
    maximizeBtn.addEventListener('click', () => window.api.maximizeWindow());
    closeBtn.addEventListener('click', () => window.api.closeWindow());
    window.api.onWindowStateChanged(({ isMaximized }) => {
        maximizeBtnIcon.className = isMaximized ? 'ri-file-copy-line' : 'ri-checkbox-blank-line';
    });
    
    addTabBtn.addEventListener('click', async () => {
        await createNewTab({ workflowId: null });
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
    const initializeApp = async () => {
        // 1. Load translations
        const lang = 'en'; // or get from settings
        const translations = await window.api.getTranslations(lang);
        if (translations) {
            i18n.init(lang, translations);
        } else {
            console.error("Could not load translations, UI might be broken.");
        }

        // 2. Translate the initial UI
        i18n.translateUI();

        // 3. Setup Sortable tabs
        sortableInstance = new Sortable(tabBar, {
            animation: 200,
            ghostClass: 'tab-ghost',
            dragClass: 'tab-dragging',
            filter: '#add-tab-btn', // Correct way to filter
            onMove: function (e) {
                return e.related.id !== 'add-tab-btn';
            },
        });

        // 4. Create the initial start page tab
        await createNewTab({ workflowId: null });
    };

    initializeApp();
});