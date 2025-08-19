module.exports = {
    type: 'generate_data',
    title: 'Tạo Dữ liệu',
    displayName: 'Tạo Dữ liệu',
    icon: '<i class="ri-magic-line"></i>',
    outputs: ['success', 'error'],
    defaultData: {
        generationType: 'string.uuid',
        locale: 'en',
        min: 0, max: 100,
        length: 16,
        jsonStructure: [
            { key: 'id', type: 'string.uuid' },
            { key: 'user', type: 'object', children: [
                { key: 'name', type: 'person.fullName' },
                { key: 'email', type: 'internet.email' }
            ]}
        ]
    },
    settings: [
        {
            type: 'select',
            label: 'Ngôn ngữ (Locale)',
            dataField: 'locale',
            options: [
                { value: 'vi', text: 'Vietnamese (vi)' },
                { value: 'en', text: 'English (en)' },
                { value: 'de', text: 'German (de)' },
                { value: 'ja', text: 'Japanese (ja)' },
                { value: 'fr', text: 'French (fr)' },
                { value: 'es', text: 'Spanish (es)' },
                { value: 'ru', text: 'Russian (ru)' },
            ]
        },
        {
            type: 'select',
            label: 'Loại dữ liệu',
            dataField: 'generationType',
            onChange: 'rerender',
            optionGroups: [
                { label: 'Chuỗi & Số', options: [
                    { value: 'string.uuid', text: 'UUID' },
                    { value: 'string.alphanumeric', text: 'Chuỗi chữ và số' },
                    { value: 'string.hexadecimal', text: 'Chuỗi Hex' },
                    { value: 'number.int', text: 'Số nguyên ngẫu nhiên' },
                    { value: 'number.float', text: 'Số thực ngẫu nhiên' },
                ]},
                { label: 'Người dùng (Person)', options: [
                    { value: 'person.fullName', text: 'Họ và Tên' }, { value: 'person.firstName', text: 'Tên' },
                    { value: 'person.lastName', text: 'Họ' }, { value: 'person.jobTitle', text: 'Chức danh' },
                    { value: 'person.gender', text: 'Giới tính' }, { value: 'person.bio', text: 'Tiểu sử' },
                ]},
                { label: 'Địa chỉ (Location)', options: [
                    { value: 'location.streetAddress', text: 'Địa chỉ đường' }, { value: 'location.city', text: 'Thành phố' },
                    { value: 'location.state', text: 'Tiểu bang' }, { value: 'location.zipCode', text: 'Mã bưu điện' },
                    { value: 'location.country', text: 'Quốc gia' }, { value: 'location.latitude', text: 'Vĩ độ' },
                    { value: 'location.longitude', text: 'Kinh độ' },
                ]},
                { label: 'Internet', options: [
                    { value: 'internet.email', text: 'Email' }, { value: 'internet.userName', text: 'Tên người dùng' },
                    { value: 'internet.url', text: 'URL' }, { value: 'internet.domainName', text: 'Tên miền' },
                    { value: 'internet.ip', text: 'Địa chỉ IP' }, { value: 'internet.mac', text: 'Địa chỉ MAC' },
                    { value: 'internet.password', text: 'Mật khẩu' }, { value: 'internet.userAgent', text: 'User Agent' },
                ]},
                 { label: 'Tài chính (Finance)', options: [
                    { value: 'finance.accountNumber', text: 'Số tài khoản' }, { value: 'finance.amount', text: 'Số tiền' },
                    { value: 'finance.currencyName', text: 'Tên tiền tệ' }, { value: 'finance.currencyCode', text: 'Mã tiền tệ' },
                    { value: 'finance.creditCardNumber', text: 'Số thẻ tín dụng' }, { value: 'finance.bic', text: 'Mã BIC' },
                ]},
                { label: 'Công ty (Company)', options: [
                    { value: 'company.name', text: 'Tên công ty' }, { value: 'company.buzzPhrase', text: 'Khẩu hiệu' },
                ]},
                { label: 'Điện thoại (Phone)', options: [
                    { value: 'phone.number', text: 'Số điện thoại' },
                ]},
                { label: 'Dữ liệu có cấu trúc', options: [{ value: 'structured_json', text: 'JSON có cấu trúc' }] }
            ]
        },
        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'number.int' }, controls: [
            { type: 'number', label: 'Tối thiểu', dataField: 'min', col: 6 },
            { type: 'number', label: 'Tối đa', dataField: 'max', col: 6 }
        ]},
        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'number.float' }, controls: [
            { type: 'number', label: 'Tối thiểu', dataField: 'min', col: 4 },
            { type: 'number', label: 'Tối đa', dataField: 'max', col: 4 },
            { type: 'number', label: 'Số thập phân', dataField: 'precision', col: 4, placeholder: '2' }
        ]},
        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'string.alphanumeric' }, controls: [
            { type: 'number', label: 'Độ dài', dataField: 'length', col: 12 },
        ]},
         { type: 'group', visibleWhen: { dataField: 'generationType', is: 'internet.password' }, controls: [
            { type: 'number', label: 'Độ dài', dataField: 'length', col: 12 },
        ]},
        { type: 'group', visibleWhen: { dataField: 'generationType', is: 'structured_json' }, controls: [
            { type: 'json-builder', dataField: 'jsonStructure' }
        ]},
        { type: 'group', controls: [
            { type: 'button', text: '<i class="bi bi-play-circle"></i> Test', action: 'test-data-generation', class: 'btn-info text-white' },
            { type: 'output-display', label: 'Kết quả Test:', ref: 'test-output-container' }
        ]}
    ],
    execute: (data, logger, context) => {
        const { Faker, allLocales } = require('@faker-js/faker');
        const { generationType, locale = 'en' } = data;

        if (logger) logger.info(`Đang tạo dữ liệu loại: ${generationType} với ngôn ngữ: ${locale}`);
        
        const faker = new Faker({
            locale: [allLocales[locale], allLocales.en],
        });
        
        const _generateSingleValue = (type, params) => {
            const [module, method] = type.split('.');
            if (!module || !method || !faker[module] || !faker[module][method]) {
                throw new Error(`Loại dữ liệu không xác định hoặc không hợp lệ: ${type}`);
            }
            
            if (type === 'number.int' || type === 'number.float') {
                return faker.number[method]({ min: params.min, max: params.max, precision: params.precision });
            }
            if (type === 'string.alphanumeric' || type === 'internet.password') {
                return faker[module][method](params.length);
            }

            return faker[module][method]();
        };

        const _buildObjectRecursively = (structure, params) => {
            const output = {};
            if (!Array.isArray(structure)) return output;

            for (const item of structure) {
                if (item.key && item.type) {
                    if (item.type === 'object') {
                        output[item.key] = _buildObjectRecursively(item.children, params);
                    } else {
                        output[item.key] = _generateSingleValue(item.type, params);
                    }
                }
            }
            return output;
        };

        if (generationType === 'structured_json') {
            const result = _buildObjectRecursively(data.jsonStructure, data);
            if (logger) logger.success(`Đã tạo JSON có cấu trúc thành công.`);
            return { result };
        } else {
            const result = _generateSingleValue(generationType, data);
            if (logger) logger.success(`Đã tạo dữ liệu thành công.`);
            return { result };
        }
    }
};