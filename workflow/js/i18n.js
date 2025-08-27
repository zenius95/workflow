// workflow/js/i18n.js (Frontend Version)
class I18nManager {
    constructor() {
        this.translations = {};
        this.currentLanguage = 'en';
    }

    /**
     * Initializes the manager with translation data.
     * @param {string} lang - The language code (e.g., 'vi', 'en').
     * @param {object} translations - The translation data object.
     */
    init(lang, translations) {
        this.translations = translations;
        this.currentLanguage = lang;
        console.log(`I18nManager initialized for '${lang}'.`);
    }

    /**
     * Gets a translation string for the given key.
     * @param {string} key - The key for the translation string (e.g., 'browser.create_new_workflow').
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
            console.warn(`Translation key not found: ${key}`);
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
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.get(key);
            if (translation !== key) {
                const targetAttr = element.getAttribute('data-i18n-target') || 'innerHTML';
                if (targetAttr === 'innerHTML') {
                    element.innerHTML = translation;
                } else {
                    element.setAttribute(targetAttr, translation);
                }
            }
        });

        document.querySelectorAll('*').forEach(element => {
            for (const attr of element.attributes) {
                const attrName = attr.name;
                const key = attr.value;
                if (attrName.startsWith('data-i18n-') && key) {
                    const targetAttr = attrName.substring('data-i18n-'.length);
                    // Skip attributes we already handled or are special
                    if (targetAttr === 'target' || targetAttr === 'title' || attrName === 'data-i18n') continue;
                    
                    const translation = this.get(key);
                    if (translation !== key) {
                         element.setAttribute(targetAttr, translation);
                    }
                }
            }
        });
        
        const titleElement = document.querySelector('title[data-i18n]');
        if(titleElement){
            const key = titleElement.getAttribute('data-i18n');
            document.title = this.get(key);
        }
    }
}

// Create a single, global instance for the frontend to use.
const i18n = new I18nManager();

// Export the instance for Node.js environments (like the runner)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = i18n;
}