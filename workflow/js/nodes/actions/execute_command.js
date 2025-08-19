module.exports = {
    type: 'execute_command',
    title: 'Chạy Lệnh',
    displayName: 'Chạy Lệnh',
    icon: '<i class="ri-terminal-box-line"></i>',
    outputs: ['success', 'error'],
    defaultData: { command: '' },
    settings: [
        { type: 'textarea', label: 'Lệnh cần chạy', dataField: 'command', rows: 4, placeholder: 'ví dụ: node --version' }
    ],
    execute: (data, logger) => new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        const { command } = data;

        if (!command) {
            return reject(new Error('Lệnh không được để trống.'));
        }

        if (logger) logger.info(`=> Đang chạy lệnh: ${command}`);

        exec(command, (error, stdout, stderr) => {
            if (error) {
                if (logger) logger.error(`Lỗi khi chạy lệnh: ${error.message}`);
                return reject(Object.assign(new Error(error.message), { context: { stderr, stdout } }));
            }
            if (stderr) {
                if (logger) logger.info(`Stderr: ${stderr}`);
            }

            if (logger) logger.success(`Lệnh thực thi thành công.`);
            resolve({ stdout, stderr });
        });
    })
};