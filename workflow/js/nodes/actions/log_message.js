module.exports = {
    type: 'log_message',
    title: 'Log Message',
    displayName: 'Log Message',
    icon: '<i class="ri-message-2-line"></i>',
    outputs: ['success'],
    defaultData: { message: 'Hello from workflow!', level: 'info' },
    settings: [
        { type: 'textarea', label: 'Nội dung', dataField: 'message', rows: 3, variablePicker: true },
        { type: 'select', label: 'Cấp độ Log', dataField: 'level', options: [
            { value: 'info', text: 'Info' }, { value: 'success', text: 'Success' }, { value: 'error', text: 'Error' }
        ]}
    ],
    execute: (data, logger) => {
        const { message, level } = data;
        if (logger && logger[level]) {
            logger[level](message);
        } else if (logger) {
            logger.info(message);
        }
        return { logged: true, level, message };
    }
};