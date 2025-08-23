// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { initialize, enable } = require('@electron/remote/main');
const i18n = require('./workflow/js/i18n.js'); // <-- ĐÃ THÊM

// Khởi tạo @electron/remote ngay lập tức khi ứng dụng bắt đầu
initialize();

// --- LOGIC BACK-END TRUNG TÂM ---
const Database = require('./workflow/js/database.js');
const WorkflowRunner = require('./workflow/js/runner.js');
const loadNodesConfig = require('./workflow/js/nodes/index.js');

let db; // Biến toàn cục giữ instance của database

function createWindow(page = 'shell.html', workflowId = null) {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        frame: false, // Giả sử bạn có frame tùy chỉnh
        webPreferences: {
            // Cấu hình an toàn
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: true,
            webviewTag: true // Cần thiết để thẻ <webview> hoạt động
        }
    });

    // Kích hoạt module @electron/remote cho cửa sổ này
    enable(win.webContents);

    let url = path.join(__dirname, 'workflow', page);
    if (workflowId) {
        url += `?id=${workflowId}`;
    }
    win.loadURL(`file://${url}`);

    // Gửi trạng thái cửa sổ khi có thay đổi để cập nhật icon ở front-end
    win.on('maximize', () => win.webContents.send('window-state-changed', { isMaximized: true }));
    win.on('unmaximize', () => win.webContents.send('window-state-changed', { isMaximized: false }));
}

// --- CÁC KÊNH GIAO TIẾP (IPC HANDLERS) ---

// Kênh cung cấp đường dẫn DB cho preload script
ipcMain.handle('get-db-path', () => path.join(app.getPath('userData'), 'workflow.db'));
ipcMain.on('get-db-path-sync', (event) => {
    event.returnValue = path.join(app.getPath('userData'), 'workflow.db');
});

// Kênh mới để cung cấp dữ liệu ngôn ngữ cho renderer
ipcMain.handle('i18n:get-translations', () => {
    return i18n.getTranslations();
});

// Các kênh xử lý cho Database API
ipcMain.handle('db-get-workflows', (event, options) => db.getWorkflows(options));
ipcMain.handle('db-get-workflow-by-id', (event, id) => db.getWorkflowById(id));
ipcMain.handle('db-save-workflow', (event, { name, data, id }) => id ? db.updateWorkflow(id, { name, data }) : db.createWorkflow({ name, data }));
ipcMain.handle('db-delete-workflow', (event, id) => db.deleteWorkflow(id));
ipcMain.handle('db-get-versions', (event, workflowId) => db.getWorkflowVersions(workflowId));
ipcMain.handle('db-save-version', (event, { workflowId, data }) => db.createWorkflowVersion(workflowId, data));

// Các kênh xử lý cho điều khiển cửa sổ
ipcMain.on('minimize-window', () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on('maximize-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
});
ipcMain.on('close-window', () => BrowserWindow.getFocusedWindow()?.close());
ipcMain.on('open-workflow-window', (event, workflowId) => createWindow('workflow.html', workflowId));

// Kênh xử lý cho các hộp thoại hệ thống
ipcMain.handle('show-confirm-dialog', (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return dialog.showMessageBox(win, options);
});
ipcMain.handle('dialog:showOpenDialog', (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return dialog.showOpenDialog(win, options);
});

// Các kênh xử lý trợ giúp cho front-end
ipcMain.handle('get-webview-url', (event, { tabId, workflowId = null }) => {
    const query = new URLSearchParams({ tabId });
    if (workflowId !== null) query.set('workflowId', workflowId);
    const filePath = path.join(__dirname, 'workflow', 'workflow.html');
    return `file://${filePath}?${query.toString()}`;
});
ipcMain.handle('get-preload-path', () => path.join(__dirname, 'preload.js'));

// Kênh xử lý cho việc chạy Sub-Workflow
ipcMain.handle('workflow:run-sub-workflow', async (event, { workflowId, inputs, globalVariables }) => {
    try {
        const subWorkflowData = await db.getWorkflowById(workflowId);
        if (!subWorkflowData) throw new Error(`Sub workflow with ID "${workflowId}" not found.`);
        
        const nodeConfig = await loadNodesConfig();
        const subRunner = new WorkflowRunner({
            workflow: subWorkflowData.data, 
            config: nodeConfig, 
            logger: console,
            globalVariables, 
            formData: inputs, 
            db, 
            isSubRunner: true
        });
        const result = await subRunner.run();
        return { success: true, result };
    } catch (error) {
        console.error(`Error running sub-workflow ${workflowId}:`, error);
        return { success: false, error: error.message };
    }
});

// --- VÒNG ĐỜI ỨNG DỤNG (APP LIFECYCLE) ---

app.whenReady().then(async () => {
    // Tải ngôn ngữ trước khi tạo cửa sổ
    i18n.loadLanguage('en'); // <-- ĐÃ THÊM

    // Khởi tạo database một lần duy nhất khi ứng dụng sẵn sàng
    const dbPath = path.join(app.getPath('userData'), 'workflows.db');
    db = new Database(dbPath);
    await db.init();
    
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        db.close().then(() => app.quit());
    }
});