// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./workflow/js/database.js'); // Import database manager

const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

app.on('web-contents-created', (event, webContents) => {
  remoteMain.enable(webContents);
});

// Khởi tạo DB khi app sẵn sàng
app.whenReady().then(() => {
  db.initialize();
});

// *** BẮT ĐẦU SỬA LỖI: Chuyển đổi dữ liệu Sequelize sang object thường trước khi gửi qua IPC ***

ipcMain.handle('db-get-workflows', async () => {
  const workflows = await db.getWorkflows();
  // Chuyển đổi từng instance Sequelize thành object thường
  return workflows.map(wf => wf.get({ plain: true }));
});

ipcMain.handle('db-save-workflow', async (event, { name, data, id }) => {
  const savedWorkflow = await db.saveWorkflow(name, data, id);
  // Chuyển đổi instance thành object thường
  return savedWorkflow ? savedWorkflow.get({ plain: true }) : null;
});

ipcMain.handle('db-get-versions', async (event, workflowId) => {
  const versions = await db.getWorkflowVersions(workflowId);
  // Chuyển đổi từng instance thành object thường
  return versions.map(v => v.get({ plain: true }));
});

ipcMain.handle('db-save-version', async (event, { workflowId, data }) => {
  const savedVersion = await db.saveWorkflowVersion(workflowId, data);
  // Chuyển đổi instance thành object thường
  return savedVersion ? savedVersion.get({ plain: true }) : null;
});

// *** KẾT THÚC SỬA LỖI ***

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });

  win.setMenuBarVisibility(false)

  remoteMain.enable(win.webContents);

  win.on('maximize', () => {
    win.webContents.send('window-state-changed', { isMaximized: true });
  });

  win.on('unmaximize', () => {
    win.webContents.send('window-state-changed', { isMaximized: false });
  });

  win.loadFile('workflow/shell.html');

  ipcMain.on('minimize-window', () => {
    win.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    win.close();
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});