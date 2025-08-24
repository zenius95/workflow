// --- DATA OPERATIONS CONFIG ---
const getProperty = (obj, path) => path.split('.').reduce((o, i) => (o && typeof o === 'object' && i in o) ? o[i] : undefined, obj);
const setProperty = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }
    let finalValue = value;
    if (typeof value === 'string') {
        if (!isNaN(value) && !isNaN(parseFloat(value))) {
            finalValue = parseFloat(value);
        } else if (value.toLowerCase() === 'true') {
            finalValue = true;
        } else if (value.toLowerCase() === 'false') {
            finalValue = false;
        }
    }
    current[keys[keys.length - 1]] = finalValue;
};

const DATA_OPERATIONS = {
    string: {
        replace: {
            name: 'Thay thế',
            params: {
                find: { name: 'Tìm kiếm', placeholder: 'chuỗi cần tìm' },
                replaceWith: { name: 'Thay thế bằng', placeholder: 'chuỗi thay thế' }
            },
            execute: (input, params) => String(input).replace(new RegExp(params.find, 'g'), params.replaceWith)
        },
        split: {
            name: 'Tách chuỗi',
            params: { delimiter: { name: 'Ký tự phân cách', placeholder: ',' } },
            execute: (input, params) => String(input).split(params.delimiter)
        },
        toUpperCase: { name: 'In hoa', execute: (input) => String(input).toUpperCase() },
        toLowerCase: { name: 'In thường', execute: (input) => String(input).toLowerCase() },
        trim: { name: 'Cắt khoảng trắng', execute: (input) => String(input).trim() },
        length: { name: 'Lấy độ dài', execute: (input) => String(input).length },
        substring: {
            name: 'Cắt chuỗi con',
            params: {
                start: { name: 'Bắt đầu', type: 'number', placeholder: '0' },
                end: { name: 'Kết thúc (tùy chọn)', type: 'number' }
            },
            execute: (input, params) => {
                const end = params.end === '' || params.end === undefined ? undefined : parseInt(params.end, 10);
                return String(input).substring(parseInt(params.start, 10), end);
            }
        },
        startsWith: {
            name: 'Bắt đầu bằng',
            params: { value: { name: 'Chuỗi con' } },
            execute: (input, params) => String(input).startsWith(params.value)
        },
        endsWith: {
            name: 'Kết thúc bằng',
            params: { value: { name: 'Chuỗi con' } },
            execute: (input, params) => String(input).endsWith(params.value)
        },
        match: {
            name: 'Khớp với Regex',
            params: { regex: { name: 'Biểu thức chính quy (Regex)', placeholder: '\\d+' } },
            execute: (input, params) => String(input).match(new RegExp(params.regex, 'g')) || []
        }
    },
    number: {
        add: { name: 'Cộng', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) + parseFloat(params.value) },
        subtract: { name: 'Trừ', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) - parseFloat(params.value) },
        multiply: { name: 'Nhân', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) * parseFloat(params.value) },
        divide: { name: 'Chia', params: { value: { name: 'Giá trị', type: 'number' } }, execute: (input, params) => parseFloat(input) / parseFloat(params.value) },
        round: { name: 'Làm tròn', execute: (input) => Math.round(parseFloat(input)) },
        floor: { name: 'Làm tròn xuống', execute: (input) => Math.floor(parseFloat(input)) },
        ceil: { name: 'Làm tròn lên', execute: (input) => Math.ceil(parseFloat(input)) },
        abs: { name: 'Giá trị tuyệt đối', execute: (input) => Math.abs(parseFloat(input)) },
        is_number: { name: 'Kiểm tra là số', execute: (input) => !isNaN(parseFloat(input)) && isFinite(input) }
    },
    array: {
        join: { name: 'Nối mảng', params: { delimiter: { name: 'Ký tự phân cách', placeholder: ',' } }, execute: (input, params) => input.join(params.delimiter) },
        map: { name: 'Trích xuất thuộc tính (Map)', params: { path: { name: 'Đường dẫn thuộc tính', placeholder: 'user.name' } }, execute: (input, params) => input.map(item => getProperty(item, params.path)) },
        get_by_index: { name: 'Lấy theo chỉ số', params: { index: { name: 'Chỉ số (index)', type: 'number', placeholder: '0' } }, execute: (input, params) => input[parseInt(params.index, 10)] },
        length: { name: 'Lấy độ dài', execute: (input) => Array.isArray(input) ? input.length : 0 },
        sum: { name: 'Tính tổng', execute: (input) => Array.isArray(input) ? input.reduce((acc, val) => acc + (parseFloat(val) || 0), 0) : 0 },
        reverse: { name: 'Đảo ngược', execute: (input) => Array.isArray(input) ? [...input].reverse() : [] },
        slice: {
            name: 'Cắt mảng con',
            params: {
                start: { name: 'Bắt đầu', type: 'number', placeholder: '0' },
                end: { name: 'Kết thúc (tùy chọn)', type: 'number' }
            },
            execute: (input, params) => {
                    const end = params.end === '' || params.end === undefined ? undefined : parseInt(params.end, 10);
                    return Array.isArray(input) ? input.slice(parseInt(params.start, 10), end) : [];
            }
        },
        includes: {
            name: 'Kiểm tra chứa giá trị',
            params: { value: { name: 'Giá trị cần tìm' } },
            execute: (input, params) => Array.isArray(input) ? input.includes(params.value) : false
        },
        find_object: {
            name: 'Tìm đối tượng theo thuộc tính',
            params: {
                path: { name: 'Đường dẫn thuộc tính', placeholder: 'user.id' },
                value: { name: 'Giá trị cần tìm' }
            },
            execute: (input, params) => Array.isArray(input) ? input.find(item => String(getProperty(item, params.path)) === String(params.value)) : undefined
        }
    },
    object: {
        get_property: { name: 'Lấy thuộc tính', params: { path: { name: 'Đường dẫn', placeholder: 'data.results[0].name' } }, execute: (input, params) => getProperty(input, params.path) },
        get_keys: { name: 'Lấy danh sách khóa (keys)', execute: (input) => Object.keys(input) },
        get_values: { name: 'Lấy danh sách giá trị (values)', execute: (input) => Object.values(input) },
        merge: {
            name: 'Trộn đối tượng',
            params: { object2: { name: 'Đối tượng thứ 2 (JSON)', placeholder: '{"key": "value"}' } },
            execute: (input, params) => {
                try {
                    const obj2 = JSON.parse(params.object2);
                    return { ...input, ...obj2 };
                } catch (e) {
                    throw new Error("Đối tượng thứ 2 không phải là JSON hợp lệ.");
                }
            }
        },
        set_property: {
            name: 'Thiết lập thuộc tính',
            params: {
                path: { name: 'Đường dẫn', placeholder: 'user.name' },
                value: { name: 'Giá trị mới' }
            },
            execute: (input, params) => {
                const newObj = JSON.parse(JSON.stringify(input)); // Deep copy
                setProperty(newObj, params.path, params.value);
                return newObj;
            }
        },
        has_property: {
            name: 'Kiểm tra có thuộc tính',
            params: { path: { name: 'Đường dẫn', placeholder: 'user.name' } },
            execute: (input, params) => getProperty(input, params.path) !== undefined
        }
    },
    json: {
        parse: { name: 'Phân tích (Parse)', execute: (input) => JSON.parse(input) },
        stringify: { name: 'Chuỗi hóa (Stringify)', params: { indent: { name: 'Thụt lề (indent)', type: 'number', placeholder: '2' } }, execute: (input, params) => JSON.stringify(input, null, parseInt(params.indent, 10) || undefined) },
        is_valid: {
            name: 'Kiểm tra JSON hợp lệ',
            execute: (input) => {
                if (typeof input === 'object') return true;
                try {
                    JSON.parse(input);
                    return true;
                } catch (e) {
                    return false;
                }
            }
        }
    }
};


const nodeConfig = {
    type: 'data_processing',
    title: 'Xử lý Dữ liệu',
    displayName: 'Xử lý Dữ liệu',
    icon: '<i class="bi bi-code-slash"></i>',
    outputs: ['success', 'error'],
    defaultData: {
        input: '',
        operation: '',
        params: {}
    },
    settings: [
        { type: 'text', label: 'Giá trị đầu vào', dataField: 'input', placeholder: '{{some_node.output}}', variablePicker: true },
        { type: 'select', label: 'Thao tác', dataField: 'operation', onChange: 'rerender',
            optionGroups: [
                { label: 'String', options: Object.keys(DATA_OPERATIONS.string).map(k => ({ value: `string.${k}`, text: DATA_OPERATIONS.string[k].name })) },
                { label: 'Number', options: Object.keys(DATA_OPERATIONS.number).map(k => ({ value: `number.${k}`, text: DATA_OPERATIONS.number[k].name })) },
                { label: 'Array', options: Object.keys(DATA_OPERATIONS.array).map(k => ({ value: `array.${k}`, text: DATA_OPERATIONS.array[k].name })) },
                { label: 'Object', options: Object.keys(DATA_OPERATIONS.object).map(k => ({ value: `object.${k}`, text: DATA_OPERATIONS.object[k].name })) },
                { label: 'JSON', options: Object.keys(DATA_OPERATIONS.json).map(k => ({ value: `json.${k}`, text: DATA_OPERATIONS.json[k].name })) },
            ]
        },
        { type: 'group', dataField: 'params', visibleWhen: { dataField: 'operation', is: 'string.replace' }, controls: [
            { type: 'text', label: 'Tìm kiếm', dataField: 'params.find', variablePicker: true }, { type: 'text', label: 'Thay thế bằng', dataField: 'params.replaceWith', variablePicker: true }
        ]},
        { type: 'group', dataField: 'params', visibleWhen: { dataField: 'operation', is: 'string.split' }, controls: [
            { type: 'text', label: 'Ký tự phân cách', dataField: 'params.delimiter', variablePicker: true }
        ]},
        { type: 'group', dataField: 'params', visibleWhen: { dataField: 'operation', is: 'string.substring' }, controls: [
            { type: 'number', label: 'Bắt đầu', dataField: 'params.start', variablePicker: true }, { type: 'number', label: 'Kết thúc', dataField: 'params.end', variablePicker: true }
        ]},
        { type: 'group', controls: [
            { type: 'button', text: '<i class="bi bi-play-circle"></i> Test Thao tác', action: 'test-operation', class: 'btn-info text-white' },
            { type: 'output-display', label: 'Kết quả Test:', ref: 'test-output-container' }
        ]}
    ],
    execute: (data, logger) => {
        const { input, operation, params } = data;
        if (!operation) {
            throw new Error("Vui lòng chọn một thao tác.");
        }
        const [operationType, operationKey] = operation.split('.');
        const opConfig = DATA_OPERATIONS[operationType]?.[operationKey];

        if (!opConfig || typeof opConfig.execute !== 'function') {
            throw new Error(`Thao tác không hợp lệ: ${operation}`);
        }

        if (logger) logger.info(`Đang thực hiện ${opConfig.name} trên đầu vào.`);

        let processedInput = input;
        if (operationType !== 'json' && typeof input === 'string') {
            try {
                processedInput = JSON.parse(input);
            } catch (e) {
                // It's just a string, which is fine for string operations.
            }
        }

        const result = opConfig.execute(processedInput, params);
        if (logger) logger.success(`Xử lý dữ liệu thành công.`);
        return { result };
    }
};

module.exports = {
    ...nodeConfig,
    getProperty,
    setProperty
};