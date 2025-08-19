module.exports = {
    type: 'html_extractor',
    title: 'Trích xuất HTML',
    displayName: 'Trích xuất HTML',
    icon: '<i class="ri-code-s-slash-line"></i>',
    outputs: ['success', 'error'],
    defaultData: {
        htmlContent: '',
        extractions: [
            { key: 'title', selector: 'h1', attribute: '', extractType: 'single' }
        ]
    },
    settings: [
        { type: 'textarea', label: 'Nội dung HTML', dataField: 'htmlContent', rows: 6, variablePicker: true },
        { type: 'info', text: 'Dùng CSS Selector để trích xuất dữ liệu. Nếu "Thuộc tính" để trống, sẽ lấy text bên trong.' },
        {
            type: 'repeater',
            dataField: 'extractions',
            addButtonText: '<i class="bi bi-plus-lg"></i> Thêm trường trích xuất',
            fields: [
                { type: 'text', dataField: 'key', placeholder: 'Key' },
                { type: 'text', dataField: 'selector', placeholder: 'CSS Selector' },
                { type: 'text', dataField: 'attribute', placeholder: 'Thuộc tính' },
                {
                    type: 'select',
                    dataField: 'extractType',
                    options: [
                        { value: 'single', text: 'Một' },
                        { value: 'multiple', text: 'Nhiều' }
                    ]
                }
            ]
        }
    ],
    execute: (data, logger) => {
        const cheerio = require('cheerio');
        const { htmlContent, extractions } = data;
        if (!htmlContent) throw new Error('Nội dung HTML không được để trống.');

        const $ = cheerio.load(htmlContent);
        const results = {};

        if (logger) logger.info(`Bắt đầu trích xuất từ HTML...`);

        extractions.forEach(ext => {
            if (!ext.key || !ext.selector) return;

            try {
                const elements = $(ext.selector);
                if (ext.extractType === 'multiple') {
                    results[ext.key] = elements.map((i, el) => {
                        const element = $(el);
                        return ext.attribute ? element.attr(ext.attribute) : element.text().trim();
                    }).get();
                } else { // 'single'
                    const firstElement = elements.first();
                    results[ext.key] = firstElement.length 
                        ? (ext.attribute ? firstElement.attr(ext.attribute) : firstElement.text().trim()) 
                        : null;
                }
            } catch (e) {
                if(logger) logger.error(`Lỗi với selector "${ext.selector}": ${e.message}`);
                results[ext.key] = { error: `Invalid selector: ${e.message}` };
            }
        });

        if (logger) logger.success(`Trích xuất HTML hoàn tất.`);
        return results;
    }
};