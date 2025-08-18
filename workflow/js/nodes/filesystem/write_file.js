module.exports = {
    type: 'write_file',
    title: 'Ghi File',
    displayName: 'Ghi File',
    icon: '<i class="bi bi-file-earmark-plus"></i>',
    outputs: ['success', 'error'],
    defaultData: { folderPath: '', fileName: 'output.txt', content: '', writeMode: 'overwrite' },
    settings: [
        { type: 'folder-select', label: 'Thư mục Lưu trữ', dataField: 'folderPath' },
        { type: 'text', label: 'Tên File', dataField: 'fileName', placeholder: 'output.txt', variablePicker: true },
        { type: 'textarea', label: 'Nội dung', dataField: 'content', rows: 5, variablePicker: true },
        { type: 'select', label: 'Chế độ ghi', dataField: 'writeMode', options: [
            { value: 'overwrite', text: 'Ghi đè (Overwrite)' }, { value: 'append', text: 'Ghi nối (Append)' }
        ]}
    ],
    execute: (data, logger) => {
        const fs = require('fs').promises;
        const path = require('path');
        const { folderPath, fileName, content, writeMode } = data;
        if (!folderPath) throw new Error('Thư mục lưu trữ không được để trống.');
        if (!fileName) throw new Error('Tên file không được để trống.');

        const finalPath = path.join(folderPath, fileName);
        const operation = writeMode === 'append' ? fs.appendFile : fs.writeFile;
        const actionText = writeMode === 'append' ? 'nối vào' : 'ghi vào';

        if (logger) logger.info(`Đang ${actionText} file: ${finalPath}`);
        return operation(finalPath, content, 'utf8')
            .then(() => {
                if (logger) logger.success(`Ghi file thành công.`);
                return { success: true, path: finalPath };
            })
            .catch(err => {
                throw new Error(err.message);
            });
    }
};