module.exports = {
    type: 'try_catch',
    title: 'Try / Catch',
    displayName: 'Try / Catch',
    icon: '<i class="bi bi-shield-shaded"></i>',
    outputs: ['try', 'catch'],
    defaultData: {},
    settings: [
        { type: 'info', text: "Thực thi các khối trong nhánh 'try'. Nếu có lỗi xảy ra, luồng sẽ chuyển sang nhánh 'catch'." }
    ],
    execute: () => {
        return { selectedPort: 'try', data: { status: 'initiated' } };
    }
};