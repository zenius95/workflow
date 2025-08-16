class TabManager {
    constructor() {
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.mainAppScreen = document.getElementById('main-app-screen');
        this.welcomeWorkflowList = document.getElementById('saved-workflows-list');
        this.createNewBtn = document.getElementById('create-new-btn');
        this.tabList = document.getElementById('tab-list');
        this.iframeContainer = document.getElementById('iframe-container');
        this.addNewTabBtn = document.getElementById('add-new-tab-btn');
        
        this.tabs = new Map();
        this.nextTabId = 0;
        this.activeTabId = null;
        this.isAppViewActive = false;
        
        this.db = require('./js/database.js');
        this.db.initialize();

        this._init();
    }

    switchToAppView() {
        if (this.isAppViewActive) return;
        this.welcomeScreen.classList.add('d-none');
        this.mainAppScreen.classList.remove('d-none');
        this.isAppViewActive = true;
    }

    switchToWelcomeView() {
        if (!this.isAppViewActive) return;
        this.mainAppScreen.classList.add('d-none');
        this.welcomeScreen.classList.remove('d-none');
        this.isAppViewActive = false;
        this.loadWorkflowsForWelcomeScreen();
    }

    async loadWorkflowsForWelcomeScreen() {
        try {
            const workflows = await this.db.getWorkflows();
            this.welcomeWorkflowList.innerHTML = '';
            if (workflows.length === 0) {
                this.welcomeWorkflowList.innerHTML = '<p class="text-center text-muted p-3">Chưa có workflow nào được lưu.</p>';
            } else {
                workflows.forEach(wf => {
                    const item = document.createElement('a');
                    item.href = '#';
                    item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center workflow-item';
                    item.dataset.id = wf.id;
                    item.dataset.name = wf.name;
                    item.innerHTML = `
                        <div>
                            <h6 class="mb-0 fw-medium">${wf.name}</h6>
                            <small class="text-muted">Cập nhật: ${new Date(wf.updatedAt).toLocaleString()}</small>
                        </div>
                        <i class="ri-arrow-right-s-line"></i>
                    `;
                    this.welcomeWorkflowList.appendChild(item);
                });
            }
        } catch (error) {
            console.error('Lỗi khi tải workflows:', error);
            this.welcomeWorkflowList.innerHTML = '<p class="text-center text-danger p-3">Không thể tải danh sách workflow.</p>';
        }
    }

    openNewTab({ workflowId = null, name = 'Workflow Mới' } = {}) {
        this.switchToAppView();
        
        const tabId = `tab-${this.nextTabId++}`;
        const iframe = document.createElement('iframe');
        iframe.id = `iframe-${tabId}`;
        iframe.className = 'tab-iframe';
        iframe.src = `index.html?workflowId=${workflowId || ''}&tabId=${tabId}`;
        this.iframeContainer.appendChild(iframe);

        const tabButton = document.createElement('li');
        tabButton.className = 'nav-item';
        tabButton.innerHTML = `
            <a class="nav-link" href="#">
                <span class="tab-title">${name}</span>
                <button type="button" class="btn-close btn-close-tab" aria-label="Close"></button>
            </a>
        `;
        this.tabList.appendChild(tabButton);

        this.tabs.set(tabId, { button: tabButton, iframe, workflowId });
        this.switchToTab(tabId);
        
        tabButton.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchToTab(tabId);
        });

        tabButton.querySelector('.btn-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });
    }

    switchToTab(tabId) {
        if (this.activeTabId === tabId) return;
        this.tabs.forEach((tab, id) => {
            const isActive = id === tabId;
            tab.button.querySelector('a').classList.toggle('active', isActive);
            tab.iframe.style.display = isActive ? 'block' : 'none';
        });
        this.activeTabId = tabId;
    }

    closeTab(tabId) {
        if (!this.tabs.has(tabId)) return;
        const tabToClose = this.tabs.get(tabId);
        tabToClose.button.remove();
        tabToClose.iframe.remove();
        this.tabs.delete(tabId);

        if (this.tabs.size === 0) {
            this.switchToWelcomeView();
            return;
        }

        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            this.switchToTab(remainingTabs[remainingTabs.length - 1]);
        }
    }
    
    _init() {
        this.switchToWelcomeView();
        this.loadWorkflowsForWelcomeScreen();

        this.createNewBtn.addEventListener('click', () => this.openNewTab());
        this.addNewTabBtn.addEventListener('click', () => this.openNewTab()); // Gán sự kiện cho nút '+'

        this.welcomeWorkflowList.addEventListener('click', (e) => {
            const item = e.target.closest('.workflow-item');
            if (item) {
                e.preventDefault();
                this.openNewTab({
                    workflowId: item.dataset.id,
                    name: item.dataset.name
                });
            }
        });

        window.addEventListener('message', (event) => {
            const { action, workflowId, name, tabId, title } = event.data;
            if (action === 'openWorkflowInNewTab') {
                this.openNewTab({ workflowId, name });
            } else if (action === 'updateTabTitle' && tabId && title) {
                if (this.tabs.has(tabId)) {
                    this.tabs.get(tabId).button.querySelector('.tab-title').textContent = title;
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TabManager();
});