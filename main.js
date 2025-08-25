const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path')
const fs = require('fs')
const WorkflowRunner = require('./workflow/js/runner.js');
const db = require('./workflow/js/database.js'); // Now imports the pre-initialized instance

// Load workflow config in main process
const nodeCategories = require('./workflow/js/nodes');
const workflowConfig = {
    nodeCategories: nodeCategories
};

require('@electron/remote/main').initialize();

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1200,
        minHeight: 800,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Disable Node.js integration in the renderer
            contextIsolation: true, // Enable context isolation
            webviewTag: true
        },
    });

    mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
        require('@electron/remote/main').enable(webContents);

        // Handle messages from the webview to the main window's renderer process
        webContents.on('ipc-message', (e, channel, ...args) => {
            mainWindow.webContents.send(channel, ...args);
        });
    });

    mainWindow.loadFile('workflow/shell.html');
    // mainWindow.webContents.openDevTools();

    // --- Window Control Listeners ---
    ipcMain.on('minimize-window', () => {
        mainWindow.minimize();
    });
    ipcMain.on('maximize-window', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.on('close-window', () => {
        mainWindow.close();
    });
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-state-changed', { isMaximized: true });
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-state-changed', { isMaximized: false });
    });
}

app.whenReady().then(async () => {
    try {
        // db.init() is now called within database.js itself
        createWindow();
    } catch (error) {
        console.error("Failed to create window:", error); // Removed db.init() from here
        app.quit();
    }
    
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        db.close();
        app.quit();
    }
});

// --- General Handlers ---
ipcMain.handle('get-preload-path', (event) => {
    return path.join(__dirname, 'preload.js');
});

ipcMain.handle('get-workflow-config', (event) => {
    // Create a deep copy of workflowConfig to avoid modifying the original object
    // and to ensure all nested objects are also copied.
    const serializableConfig = JSON.parse(JSON.stringify(workflowConfig));

    // Iterate through nodeCategories and remove the 'execute' function from each node
    serializableConfig.nodeCategories.forEach(category => {
        if (category.nodes && Array.isArray(category.nodes)) {
            category.nodes.forEach(node => {
                if (node.execute) {
                    delete node.execute; // Remove the execute function
                }
            });
        }
    });

    return serializableConfig;
});

// --- I18n IPC Handler ---
ipcMain.handle('i18n-get-translations', (event, lang) => {
    const localePath = path.join(__dirname, 'workflow', 'locales', `${lang}.json`);
    try {
        const fileContent = fs.readFileSync(localePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Failed to load translations for ${lang}:`, error);
        return null;
    }
});

// --- Simulation IPC Handler ---
ipcMain.handle('run-simulation', async (event, { workflow, globalVariables, formData }) => {
    const logMessages = [];
    // Custom logger for runner to send events to renderer and accumulate logs
    const logger = {
        info: (msg) => {
            logMessages.push(`[INFO] ${msg}`);
            event.sender.send('runner-event', { type: 'log', level: 'info', message: msg });
        },
        success: (msg) => {
            logMessages.push(`[SUCCESS] ${msg}`);
            event.sender.send('runner-event', { type: 'log', level: 'success', message: msg });
        },
        error: (msg) => {
            logMessages.push(`[ERROR] ${msg}`);
            event.sender.send('runner-event', { type: 'log', level: 'error', message: msg });
        },
        system: (msg) => {
            logMessages.push(`[SYSTEM] ${msg}`);
            event.sender.send('runner-event', { type: 'log', level: 'system', message: msg });
        },
        warn: (msg) => {
            logMessages.push(`[WARN] ${msg}`);
            event.sender.send('runner-event', { type: 'log', level: 'warn', message: msg });
        },
        clear: () => {
            logMessages.length = 0;
            event.sender.send('runner-event', { type: 'log', level: 'clear' });
        },
        // Add methods for node state and connection animation
        nodeState: (nodeId, state) => {
            event.sender.send('runner-event', { type: 'nodeState', nodeId, state });
        },
        animateConnection: (connectionId) => {
            event.sender.send('runner-event', { type: 'animateConnection', connectionId });
        },
        updateVariables: (globalVars, formVars, execState) => {
            event.sender.send('runner-event', { type: 'updateVariables', globalVars, formVars, execState });
        }
    };
    
    const runner = new WorkflowRunner({
        workflow,
        config: workflowConfig, // Use the config loaded in main
        logger,
        globalVariables,
        formData
    });

    try {
        const result = await runner.run();
        if (workflow.id) {
            await db.createWorkflowLog(workflow.id, logMessages.join('\n'));
        }
        return { success: true, result };
    } catch (error) {
        logger.error(error.message);
        if (workflow.id) {
            await db.createWorkflowLog(workflow.id, logMessages.join('\n'));
        }
        return { success: false, error: error.message };
    }
});

// --- Database IPC Handlers ---
ipcMain.handle('db-get-workflows', async (event, options) => {
    return db.getWorkflows(options);
});

ipcMain.handle('db-save-workflow', async (event, { name, data, id }) => {
    if (id) {
        return db.updateWorkflow(id, { name, data });
    } else {
        return db.createWorkflow({ name, data });
    }
});

ipcMain.handle('db-delete-workflow', async (event, id) => {
    return db.deleteWorkflow(id);
});

ipcMain.handle('db-get-versions', async (event, workflowId) => {
    return db.getWorkflowVersions(workflowId);
});

ipcMain.handle('db-save-version', async (event, { workflowId, data }) => {
    return db.createWorkflowVersion(workflowId, data);
});

ipcMain.handle('db-get-workflow-by-id', async (event, id) => {
    return db.getWorkflowById(id);
});

ipcMain.handle('db-create-workflow-log', async (event, { workflowId, logContent }) => {
    return db.createWorkflowLog(workflowId, logContent);
});

ipcMain.handle('db-get-workflow-logs', async (event, workflowId) => {
    return db.getWorkflowLogs(workflowId);
});

// --- Dialog IPC Handler ---
ipcMain.handle('show-confirm-dialog', async (event, options) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showMessageBox(focusedWindow, options);
    return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(focusedWindow, options);
    return result;
});
