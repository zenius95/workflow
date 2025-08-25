const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // General
    getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),
    getWorkflowConfig: () => ipcRenderer.invoke('get-workflow-config'),

    // i18n
    getTranslations: (lang) => ipcRenderer.invoke('i18n-get-translations', lang),

    // Simulation
    runSimulation: (data) => ipcRenderer.invoke('run-simulation', data),

    // Database
    getWorkflows: (options) => ipcRenderer.invoke('db-get-workflows', options),
    saveWorkflow: (data) => ipcRenderer.invoke('db-save-workflow', data),
    deleteWorkflow: (id) => ipcRenderer.invoke('db-delete-workflow', id),
    getWorkflowById: (id) => ipcRenderer.invoke('db-get-workflow-by-id', id),
    getWorkflowVersions: (workflowId) => ipcRenderer.invoke('db-get-versions', workflowId),
    createWorkflowVersion: (data) => ipcRenderer.invoke('db-save-version', data),
    getWorkflowLogs: (workflowId) => ipcRenderer.invoke('db-get-workflow-logs', workflowId),

    // Dialogs
    showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

    // Window controls
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    onWindowStateChanged: (callback) => ipcRenderer.on('window-state-changed', (event, ...args) => callback(...args)),

    // Custom webview -> host communication
    notifyHost: (channel, ...args) => ipcRenderer.sendToHost(channel, ...args),
    onWorkflowRenamed: (callback) => ipcRenderer.on('workflow-renamed', (event, ...args) => callback(...args)),
    onRunnerEvent: (callback) => ipcRenderer.on('runner-event', (event, ...args) => callback(...args)),
});