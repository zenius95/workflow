// workflow/js/i18n.js

const fs = require('fs');
const path = require('path');

let translations = {};
let currentLanguage = 'en';

// SỬA LỖI: Xác định đường dẫn gốc một cách chính xác hơn
// __dirname ở đây sẽ là D:\workflow\workflow\js
// path.join(__dirname, '..', '..') sẽ trỏ về D:\workflow
const appRoot = path.join(__dirname, '..', '..');

const i18n = {
    loadLanguage: (lang) => {
        try {
            // SỬA LỖI: Thêm 'workflow' vào đường dẫn để trỏ đúng vào thư mục locales
            const filePath = path.join(appRoot, 'workflow', 'locales', `${lang}.json`);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            translations = JSON.parse(fileContent);
            console.log(`Language '${lang}' loaded successfully from: ${filePath}`);
        } catch (error) {
            console.error(`Failed to load language file for '${lang}':`, error);
            translations = {}; // Reset để tránh dùng dữ liệu cũ
        }
    },

    get: (key, params = {}) => {
        let translation = key.split('.').reduce((obj, k) => (obj && obj[k] !== 'undefined') ? obj[k] : undefined, translations);
        if (translation === undefined) {
            console.warn(`Translation not found for key: ${key}`);
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
    },

    // Hàm mới để trả về toàn bộ dữ liệu translations
    getTranslations: () => {
        return translations;
    },

    // Hàm mới để thiết lập translations (dùng ở renderer)
    setTranslations: (data) => {
        translations = data;
    }
};

module.exports = i18n;