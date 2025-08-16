// main.js

// Import các module cần thiết từ Electron
const { app, BrowserWindow } = require('electron');
const path = require('path');

// *** BẮT ĐẦU THAY ĐỔI ***
// Khởi tạo module "remote" để cho phép renderer truy cập dialog
require('@electron/remote/main').initialize();
// *** KẾT THÚC THAY ĐỔI ***

// Hàm tạo cửa sổ ứng dụng
const createWindow = () => {
  // Tạo một cửa sổ trình duyệt mới.
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js'), // Sẽ dùng cho các tính năng nâng cao
      nodeIntegration: true, // Cho phép code trong renderer truy cập Node.js
      contextIsolation: false // Tắt context isolation để dễ dàng hơn cho các ví dụ ban đầu
    }
  });

  win.setMenuBarVisibility(false)

  // *** BẮT ĐẦU THAY ĐỔI ***
  // Kích hoạt module "remote" cho cửa sổ này
  require('@electron/remote/main').enable(win.webContents);
  // *** KẾT THÚC THAY ĐỔI ***

  // Tải file index.html từ thư mục workflow của sếp.
  win.loadFile('workflow/app.html');

  // Mở công cụ phát triển (DevTools) để debug nếu cần.
  // win.webContents.openDevTools();
};

// Phương thức này sẽ được gọi khi Electron đã hoàn tất
// quá trình khởi tạo và sẵn sàng tạo cửa sổ trình duyệt.
app.whenReady().then(() => {
  createWindow();

  // Xử lý cho macOS: Mở lại cửa sổ khi nhấn vào biểu tượng dock.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Thoát ứng dụng khi tất cả các cửa sổ đã đóng (trừ trên macOS).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});