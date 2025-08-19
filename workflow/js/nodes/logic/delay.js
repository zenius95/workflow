module.exports = {
    type: 'delay',
    title: 'Delay',
    displayName: 'Delay',
    icon: '<i class="ri-alarm-line"></i>',
    outputs: ['success'],
    defaultData: { delay: 1000 },
    settings: [
        { type: 'number', label: 'Thời gian chờ (ms)', dataField: 'delay' }
    ],
    execute: (data, logger) => new Promise(resolve => {
        const delayMs = parseInt(data.delay, 10) || 0;
        if (logger) logger.info(`Đang chờ trong ${delayMs}ms...`);
        setTimeout(() => {
            if (logger) logger.success(`Đã chờ xong.`);
            resolve({ delayedFor: delayMs });
        }, delayMs);
    })
};