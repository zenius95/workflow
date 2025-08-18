// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron'); // Thêm dialog
const path = require('path');
const db = require('./workflow/js/database.js');

const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

app.on('web-contents-created', (event, webContents) => {
  remoteMain.enable(webContents);
});

app.whenReady().then(() => {
  db.initialize();
});


// *** BẮT ĐẦU THAY ĐỔI: Cập nhật các hàm IPC ***
ipcMain.handle('db-get-workflows', async (event, options) => {
  const { count, rows } = await db.getWorkflows(options);
  return { count, rows: rows.map(wf => wf.get({ plain: true })) };
});

ipcMain.handle('db-save-workflow', async (event, { name, data, id }) => {
  const savedWorkflow = await db.saveWorkflow(name, data, id);
  return savedWorkflow ? savedWorkflow.get({ plain: true }) : null;
});

ipcMain.handle('db-get-versions', async (event, workflowId) => {
  const versions = await db.getWorkflowVersions(workflowId);
  return versions.map(v => v.get({ plain: true }));
});

ipcMain.handle('db-save-version', async (event, { workflowId, data }) => {
  const savedVersion = await db.saveWorkflowVersion(workflowId, data);
  return savedVersion ? savedVersion.get({ plain: true }) : null;
});

// Thêm IPC handler để xóa workflow
ipcMain.handle('db-delete-workflow', async (event, id) => {
  return await db.deleteWorkflow(id);
});

// Thêm IPC handler để hiển thị hộp thoại xác nhận
ipcMain.handle('show-confirm-dialog', async (event, options) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showMessageBox(focusedWindow, options);
    return result;
});
// *** KẾT THÚC THAY ĐỔI ***


const createWindow = () => {
  // ... (Phần còn lại của file không đổi)
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