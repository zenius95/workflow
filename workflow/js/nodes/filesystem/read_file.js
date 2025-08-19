module.exports = {
    type: 'read_file',
    title: 'Đọc File',
    displayName: 'Đọc File',
    icon: '<i class="ri-file-text-line"></i>',
    outputs: ['success', 'error'],
    defaultData: { filePath: '', encoding: 'utf8' },
    settings: [
        { type: 'file-select', label: 'Đường dẫn File', dataField: 'filePath' },
        { type: 'select', label: 'Encoding', dataField: 'encoding', options: [
            { value: 'utf8', text: 'UTF-8' }, { value: 'ascii', text: 'ASCII' }, { value: 'utf16le', text: 'UTF-16 LE' }, { value: 'base64', text: 'Base64' }
        ]}
    ],
    execute: (data, logger) => {
        const fs = require('fs').promises;
        const { filePath, encoding } = data;
        if (!filePath) throw new Error('Đường dẫn file không được để trống.');
        if (logger) logger.info(`Đang đọc file: ${filePath}`);
        return fs.readFile(filePath, encoding)
            .then(content => {
                if (logger) logger.success(`Đọc file thành công.`);
                return { content };
            })
            .catch(err => {
                throw new Error(err.message);
            });
    }
};