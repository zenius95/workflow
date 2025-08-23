// workflow/js/i18n.js
const fs = require('fs');
const path = require('path');

class I18nManager {
    constructor() {
        this.translations = {};
        this.currentLanguage = 'en'; // Default language
    }

    /**
     * Loads a language file into memory.
     * @param {string} lang - The language code (e.g., 'vi', 'en').
     */
    loadLanguage(lang) {
        try {
            const filePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            this.translations = JSON.parse(fileContent);
            this.currentLanguage = lang;
            console.log(`Language '${lang}' loaded successfully.`);
        } catch (error) {
            console.error(this.get('logs.error_loading_language', { lang: lang }), error);
        }
    }

    /**
     * Gets a translation string for the given key.
     * @param {string} key - The key for the translation string (e.g., 'shell.create_new_workflow').
     * @param {object} [placeholders={}] - Values to replace in the string.
     * @returns {string|object} - The translated string or the key if not found.
     */
    get(key, placeholders = {}) {
        const keys = key.split('.');
        let result = this.translations;
        for (const k of keys) {
            if (result === undefined) break;
            result = result[k];
        }

        if (result === undefined) {
            return key; // Return the key itself as a fallback
        }

        if (typeof result === 'string' && Object.keys(placeholders).length > 0) {
            for (const placeholder in placeholders) {
                result = result.replace(new RegExp(`{${placeholder}}`, 'g'), placeholders[placeholder]);
            }
        }

        return result;
    }

    /**
     * Applies translations to all DOM elements with a data-i18n attribute.
     */
    translateUI() {
        // Xử lý các trường hợp data-i18n="key" đơn giản (như phiên bản gốc)
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.get(key);
            if (translation !== key) {
                // Mặc định là 'innerHTML', trừ khi có data-i18n-target chỉ định khác
                const targetAttr = element.getAttribute('data-i18n-target') || 'innerHTML';
                if (targetAttr === 'innerHTML') {
                    element.innerHTML = translation;
                } else {
                    element.setAttribute(targetAttr, translation);
                }
            }
        });

        // Xử lý các trường hợp mở rộng data-i18n-attr="key"
        document.querySelectorAll('*').forEach(element => {
            for (const attr of element.attributes) {
                if (attr.name.startsWith('data-i18n-') && attr.name !== 'data-i18n-target' && attr.name !== 'data-i18n-title') {
                    const key = attr.value;
                    if (!key) continue;

                    const targetAttr = attr.name.substring('data-i18n-'.length);
                    const translation = this.get(key);

                    if (translation !== key) {
                        if (targetAttr === 'text' || targetAttr === 'html') {
                            element.innerHTML = translation;
                        } else {
                            element.setAttribute(targetAttr, translation);
                        }
                    }
                }
            }
        });

        // Giữ lại phần dịch cho title của trang
        const titleKey = document.body.getAttribute('data-i18n-title');
        if (titleKey) {
            document.title = this.get(titleKey);
        } else {
            // Trường hợp title của trang dùng data-i18n
            const titleElement = document.querySelector('title[data-i18n]');
            if(titleElement){
                const key = titleElement.getAttribute('data-i18n');
                document.title = this.get(key);
            }
        }
    }
}

module.exports = new I18nManager();