const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const Database = require('./workflow/js/database.js');
// THÊM DÒNG NÀY: Import module @electron/remote
const remoteMain = require('@electron/remote/main');

const db = new Database(path.join(app.getPath('userData'), 'workflows.db'));

// THÊM DÒNG NÀY: Khởi tạo module @electron/remote
remoteMain.initialize();

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 940,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 15, y: 15 },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true
        },
        backgroundColor: '#fff',
        icon: path.join(__dirname, 'workflow/assets/icon.png')
    });

    // THÊM DÒNG NÀY: Kích hoạt module cho cửa sổ này
    remoteMain.enable(mainWindow.webContents);

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
        await db.init();
        createWindow();
    } catch (error) {
        console.error("Failed to initialize database and create window:", error);
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

// --- Dialog IPC Handler ---
ipcMain.handle('show-confirm-dialog', async (event, options) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showMessageBox(focusedWindow, options);
    return result;
});