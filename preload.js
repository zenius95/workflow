// workflow/preload.js

const { contextBridge, ipcRenderer } = require('electron');

// Hàm bootstrap để khởi tạo API bất đồng bộ
const initializeApi = async () => {
    // Lấy dữ liệu ngôn ngữ từ main process
    const translations = await ipcRenderer.invoke('i18n:get-translations');

    // Tạo một đối tượng i18n cục bộ ở renderer
    const i18n = {
        translations: translations,
        get: (key, params = {}) => {
            let translation = key.split('.').reduce((obj, k) => (obj && obj[k] !== 'undefined') ? obj[k] : undefined, i18n.translations);
            if (translation === undefined) {
                return key;
            }
            if (params && typeof params === 'object') {
                Object.keys(params).forEach(placeholder => {
                    translation = translation.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), params[placeholder]);
                });
            }
            return translation;
        },
        translateUI: () => {
            document.querySelectorAll('[data-i18n]').forEach(element => {
                const key = element.getAttribute('data-i18n');
                const translation = i18n.get(key);
                if (translation !== key) {
                    if (element.placeholder) {
                        element.placeholder = translation;
                    } else {
                        element.textContent = translation;
                    }
                }
            });
        }
    };

    // Expose toàn bộ API ra window
    contextBridge.exposeInMainWorld('api', {
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        sendToHost: (channel, ...args) => ipcRenderer.sendToHost(channel, ...args), // <== ADD THIS LINE
        send: (channel, ...args) => ipcRenderer.send(channel, ...args),
        on: (channel, func) => {
            const validChannels = ['window-state-changed', 'workflow-renamed'];
            if (validChannels.includes(channel)) {
                const subscription = (event, ...args) => func(...args);
                ipcRenderer.on(channel, subscription);
                return () => ipcRenderer.removeListener(channel, subscription);
            }
        },
        // Cung cấp đối tượng i18n đã được khởi tạo
        i18n: i18n,
        dialog: {
            showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options)
        }
    });

    // Gửi một sự kiện để báo cho renderer rằng API đã sẵn sàng
    window.dispatchEvent(new Event('api-ready'));
};

initializeApi();