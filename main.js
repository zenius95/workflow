// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

app.on('web-contents-created', (event, webContents) => {
  remoteMain.enable(webContents);
});

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

  // *** BẮT ĐẦU THAY ĐỔI: Gửi trạng thái maximize cho giao diện ***
  win.on('maximize', () => {
    win.webContents.send('window-state-changed', { isMaximized: true });
  });

  win.on('unmaximize', () => {
    win.webContents.send('window-state-changed', { isMaximized: false });
  });
  // *** KẾT THÚC THAY ĐỔI ***

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