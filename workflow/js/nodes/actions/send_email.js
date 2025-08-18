module.exports = {
    type: 'send_email',
    title: 'Gửi Email',
    displayName: 'Gửi Email',
    icon: '<i class="bi bi-envelope"></i>',
    outputs: ['success', 'error'],
    defaultData: { subject: 'Thông báo quan trọng', recipient: '' },
    settings: [
        { type: 'text', label: 'Chủ đề', dataField: 'subject', variablePicker: true },
        { type: 'text', label: 'Người nhận', dataField: 'recipient', variablePicker: true }
    ],
    execute: (data, logger) => new Promise((resolve, reject) => {
        if (logger) logger.info(`Đang gửi email tới ${data.recipient} với chủ đề "${data.subject}"`);
        setTimeout(() => {
            if (!data || !data.recipient || !data.recipient.includes('@')) {
                reject(new Error('Email người nhận không hợp lệ.'));
                return;
            }
            const result = { status: 'sent', recipient: data.recipient, subject: data.subject, timestamp: new Date().toISOString() };
            if (logger) logger.success(`Đã gửi email thành công tới ${data.recipient}`);
            resolve(result);
        }, 1500);
    })
};